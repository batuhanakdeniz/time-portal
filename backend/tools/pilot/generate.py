"""Dönem panoraması üretimi: FLUX.2 [klein] base 4B (4-bit, mflux/MLX) + 360° ERP outpaint LoRA.

LoRA bir "düzenleme" (referans görüntü) LoRA'sıdır: 2:1 yeşil (#00ff00) kontrol görüntüsünde yeşil alanları
doldurur. Pilotta kontrol tamamen yeşildir (yalnızca metinden 360°). Arazi koşulu iki yoldan girer:
  1. tarif: arazi özetinden ipucu (prompts.terrain_hint),
  2. img2img: ışın izlenmiş arazi önizlemesi (terrain/render.jpg) gürültülenip başlangıç gizli değişkeni olur
     (`--init-strength`, mflux anlamı: atlanan adım oranı; 0 = kapalı). Böylece ufuk çizgisi, deniz ve dağların
     yönü DEM ile hizalı kalır (orta sütun = kuzey).
Ayarlar LoRA'nın ComfyUI iş akışından: 20 adım, CFG 5, LoRA ölçeği 0,9; negatif tarif insan figürünü dışlar.

Kullanım:
  python generate.py --place trabzon-merkez --bucket roma [--width 1024 --height 512] [--steps 20]
                     [--init-strength 0.2] [--seed 7] [--tag deneme]
  python generate.py --all ...   (5 yer × 4 kova)
Çıktı: <OUTPUT_DIR>/<yer>/<kova>/<etiket>/{pano.jpg, control.png, meta.json}
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

import depthmath
import prompts
from pilot_common import BUCKETS, CACHE_DIR, MODEL_LICENSES, MODELS_DIR, PLACES, TERRAIN_SOURCE, place_dir

GREEN = (0, 255, 0)


def lora_path() -> str:
    from huggingface_hub import hf_hub_download

    info = MODEL_LICENSES["erp-lora"]
    return hf_hub_download(info["repo"], info["file"], revision=info["sha"], cache_dir=str(CACHE_DIR / "hf" / "hub"))


def make_control(path: Path, width: int, height: int) -> Path:
    Image.new("RGB", (width, height), GREEN).save(path)
    return path


class Generator:
    """Model bir kez yüklenir, birçok sahne üretilir (yükleme süresi ayrı ölçülür)."""

    def __init__(self, variant: str = "flux2-klein-base-4b", lora_scale: float = 0.9, use_lora: bool = True,
                 bake_lora: bool = True, fp16: bool = False):
        from mflux.models.common.config.model_config import ModelConfig
        from mflux.models.flux2.variants import Flux2KleinEdit

        t0 = time.perf_counter()
        cfg = ModelConfig.flux2_klein_base_4b() if "base" in variant else ModelConfig.flux2_klein_4b()
        kwargs = {}
        if use_lora:
            kwargs = {"lora_paths": [lora_path()], "lora_scales": [lora_scale], "bake_lora": bake_lora}
        if fp16:
            import mlx.core as mx

            kwargs["compute_precision"] = mx.float16
        self.variant = variant
        self.lora_scale = lora_scale if use_lora else None
        self.bake_lora = bake_lora
        self.fp16 = fp16
        self.model = Flux2KleinEdit(model_config=cfg, model_path=str(MODELS_DIR / f"{variant}-q4"), **kwargs)
        self.negative = prompts.NEGATIVE
        self._patch()
        self.load_seconds = time.perf_counter() - t0

    def _patch(self):
        """mflux'un düzenleme hattına iki ek: (1) gerçek negatif tarif (CFG dalı), (2) img2img başlangıcı."""
        import mlx.core as mx
        from mflux.models.common.config.config import Config
        from mflux.models.common.latent_creator.latent_creator import LatentCreator
        from mflux.models.flux2.latent_creator.flux2_latent_creator import Flux2LatentCreator
        from mflux.models.flux2.variants.edit import flux2_klein_edit as edit_mod
        from mflux.models.flux2.variants.edit.flux2_klein_edit_helpers import _Flux2KleinEditHelpers as H

        model = self.model
        gen = self
        original_encode = model._encode_prompt_pair
        self.embed_cache = {}

        def encode(prompt, negative_prompt, guidance):
            key = (prompt, guidance > 1)
            if key not in gen.embed_cache:
                if model.text_encoder is None:
                    raise RuntimeError("text encoder freed; call precompute() with every prompt first")
                gen.embed_cache[key] = original_encode(
                    prompt=prompt, negative_prompt=gen.negative if guidance > 1 else negative_prompt,
                    guidance=guidance)
            return gen.embed_cache[key]

        model._encode_prompt_pair = encode

        # Dikiş: her adımdan sonra gizli değişken yatayda döndürülür (latent rolling); böylece son dikiş
        # konumu önceki adımlarda görüntünün içinde gürültüden arındırılır. Çözmeden önce toplam kayma geri alınır.
        from mflux.models.common.schedulers.flow_match_euler_discrete_scheduler import FlowMatchEulerDiscreteScheduler

        self.roll = None  # (lh, lw, adım başına kayma) — generate() ayarlar
        self.roll_total = 0
        self.wrap_decode = 4  # gizli sütun; 0 = kapalı
        original_step = FlowMatchEulerDiscreteScheduler.step

        def step(sched, *a, **kw):
            out = original_step(sched, *a, **kw)
            if gen.roll is None:
                return out
            lh, lw, shift = gen.roll
            b, seq, c = out.shape
            out = mx.roll(out.reshape(b, lh, lw, c), shift, axis=2).reshape(b, seq, c)
            gen.roll_total += shift
            return out

        FlowMatchEulerDiscreteScheduler.step = step
        original_decode = model.vae.decode_packed_latents

        def decode(packed_latents, tiling_config=None):
            if gen.roll is not None and gen.roll_total:
                packed_latents = mx.roll(packed_latents, -gen.roll_total, axis=3)
            if not gen.wrap_decode:
                return original_decode(packed_latents, tiling_config=tiling_config)
            # VAE çözücüsü sıfır dolgulu bir CNN: görüntü kenarlarında dikişte fark yaratır. Gizli değişkeni
            # yatayda sarmalı dolgu ile genişletip çöz, sonra dolguyu kırp (1 gizli sütun = 16 piksel).
            pad = gen.wrap_decode
            wide = mx.concatenate([packed_latents[..., -pad:], packed_latents, packed_latents[..., :pad]], axis=3)
            decoded = original_decode(wide, tiling_config=tiling_config)
            return decoded[..., pad * 16:decoded.shape[-1] - pad * 16]

        model.vae.decode_packed_latents = decode
        self.init = None  # (yol, güç, adım) — generate() ayarlar
        self.init_band = None  # (alt, üst) derece; None = tüm görüntü

        original_prepare = H.prepare_generation_latents

        def prepare(seed, height, width):
            latents, ids, lh, lw = original_prepare(seed=seed, height=height, width=width)
            if gen.init is None:
                return latents, ids, lh, lw
            init_path, strength, steps = gen.init
            cfg = Config(model_config=model.model_config, num_inference_steps=steps, height=height, width=width,
                         guidance=1.0, image_path=init_path, image_strength=strength,
                         scheduler="flow_match_euler_discrete")
            encoded = LatentCreator.encode_image(vae=model.vae, image_path=init_path, height=height, width=width,
                                                 tiling_config=model.tiling_config)
            encoded = H.ensure_4d_latents(encoded)
            encoded = H.crop_to_even_spatial(encoded)
            encoded = Flux2LatentCreator.patchify_latents(encoded)
            encoded = H.bn_normalize_vae_encoded_latents(encoded, vae=model.vae)
            clean = Flux2LatentCreator.pack_latents(encoded)
            sigma = cfg.scheduler.sigmas[cfg.init_time_step]
            mixed = LatentCreator.add_noise_by_interpolation(clean=clean, noise=latents, sigma=sigma)
            if gen.init_band is None:
                return mixed, ids, lh, lw
            # Yalnızca ufuk şeridi (yükseklik açısı lo..hi) arazi önizlemesinden başlar; geri kalanı saf gürültü.
            # Düz renkli yakın zemin ve gökyüzü başlangıca girerse model onları düz bırakıyor (pilot gözlemi).
            lo, hi = gen.init_band
            el = 90.0 - (np.arange(lh) + 0.5) / lh * 180.0
            rows = mx.array(((el >= lo) & (el <= hi)).astype(np.float32))
            m = mx.repeat(rows, lw).reshape(1, lh * lw, 1).astype(mixed.dtype)
            return m * mixed + (1 - m) * latents, ids, lh, lw

        edit_mod._Flux2KleinEditHelpers.prepare_generation_latents = staticmethod(prepare)

    def precompute(self, prompt_list: list[str], guidance: float):
        """Tüm tarifleri bir kez kodlar ve metin kodlayıcıyı (Qwen3 4B, ~2,2 GB) bellekten atar."""
        import gc

        import mlx.core as mx

        t0 = time.perf_counter()
        for p in prompt_list:
            emb = self.model._encode_prompt_pair(prompt=p, negative_prompt=" ", guidance=guidance)
            mx.eval([e for e in emb if e is not None])
        self.model.text_encoder = None
        gc.collect()
        mx.clear_cache()
        return time.perf_counter() - t0

    def generate(self, prompt: str, control: Path, width: int, height: int, steps: int, guidance: float,
                 seed: int, init_path: Path | None, init_strength: float, roll: bool = True,
                 init_band: tuple[float, float] | None = None):
        self.init = (str(init_path), init_strength, steps) if init_path and init_strength > 0 else None
        self.init_band = init_band
        lh, lw = height // 16, width // 16
        self.roll = (lh, lw, max(1, lw // 7)) if roll else None
        self.roll_total = 0
        t0 = time.perf_counter()
        image = self.model.generate_image(
            seed=seed, prompt=prompt, width=width, height=height, guidance=guidance, image_paths=[control],
            image_strength=init_strength if self.init else None, num_inference_steps=steps,
        )
        self.last_roll_total = self.roll_total
        return image.image, time.perf_counter() - t0


def run_scene(gen: Generator, place_id: str, bucket_id: str, args) -> dict:
    out = place_dir(place_id) / bucket_id / args.tag
    out.mkdir(parents=True, exist_ok=True)
    composed = prompts.compose(place_id, bucket_id, erp_trigger=gen.lora_scale is not None)
    control = make_control(out / "control.png", int(args.width * args.control_scale),
                           int(args.height * args.control_scale))
    init = place_dir(place_id) / "terrain" / "render.jpg"
    init = init if args.init_strength > 0 and init.exists() else None
    img, seconds = gen.generate(composed["prompt"], control, args.width, args.height, args.steps, args.guidance,
                                args.seed, init, args.init_strength, roll=not args.no_roll,
                                init_band=tuple(args.init_band) if args.init_band else None)
    if img.size != (args.width, args.height):
        img = img.resize((args.width, args.height), Image.LANCZOS)
    img.save(out / "pano.jpg", quality=90)
    arr = np.asarray(img)
    meta = {
        "place": place_id, "bucket": bucket_id, "confidence": composed["confidence"], "tag": args.tag,
        "model": gen.variant, "quantize": 4, "lora": MODEL_LICENSES["erp-lora"]["repo"] if gen.lora_scale else None,
        "lora_scale": gen.lora_scale, "bake_lora": gen.bake_lora, "fp16": gen.fp16, "width": args.width, "height": args.height, "steps": args.steps,
        "guidance": args.guidance, "seed": args.seed,
        "init": "terrain/render.jpg" if init else None, "init_strength": args.init_strength if init else 0,
        "init_band_deg": args.init_band if init else None,
        "latent_roll": not args.no_roll, "latent_roll_total": gen.last_roll_total, "wrap_decode": gen.wrap_decode, "control_scale": args.control_scale,
        "prompt": composed["prompt"], "negative_prompt": gen.negative,
        "seconds": round(seconds, 1), "model_load_seconds": round(gen.load_seconds, 1),
        "seam_ratio": round(depthmath.seam_ratio(arr), 3), "seam_rank": round(depthmath.seam_rank(arr), 3),
        "pole_ratio": round(depthmath.pole_ratio(arr), 3),
        "sources": [
            {"kind": "model", **MODEL_LICENSES[gen.variant]},
            *([{"kind": "lora", **MODEL_LICENSES["erp-lora"]}] if gen.lora_scale else []),
            *([{"kind": "terrain", **TERRAIN_SOURCE}] if init else []),
        ],
        "label": "Kurgu" if composed["confidence"] == "kurgu" else "Yorum",
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    return meta


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--place", action="append")
    ap.add_argument("--bucket", action="append")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--pairs", nargs="+", metavar="YER:KOVA", help="belirli yer:kova çiftleri")
    ap.add_argument("--variant", default="flux2-klein-base-4b")
    ap.add_argument("--no-lora", action="store_true")
    ap.add_argument("--lora-scale", type=float, default=0.9)
    ap.add_argument("--no-bake", action="store_true", help="LoRA'yı katmana gömme (4-bit'te gömme %%27 kaybettiriyor)")
    ap.add_argument("--fp16", action="store_true", help="mflux compute_precision=float16 (M1/M2'de hızlı)")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=512)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--guidance", type=float, default=5.0)
    ap.add_argument("--init-strength", type=float, default=0.0)
    ap.add_argument("--init-band", type=float, nargs=2, metavar=("ALT", "UST"),
                    help="img2img yalnızca bu yükseklik açısı şeridinde (derece), ör. -8 25")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--tag", default="klein")
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--control-scale", type=float, default=1.0,
                    help="yeşil kontrol görüntüsü ölçeği (referans jeton sayısı; 0.5 → 1/4 jeton)")
    ap.add_argument("--no-roll", action="store_true", help="dikiş için gizli değişken döndürmeyi kapat")
    ap.add_argument("--cache-limit-gb", type=float, default=1.0, help="MLX ara bellek sınırı (8 GB makinede takası azaltır)")
    args = ap.parse_args(argv)
    if "base" not in args.variant:
        args.guidance = 1.0  # damıtılmış model CFG desteklemez
    places = [p.id for p in PLACES] if args.all or not args.place else args.place
    buckets = [b.id for b in BUCKETS] if args.all or not args.bucket else args.bucket
    import mlx.core as mx

    mx.set_cache_limit(int(args.cache_limit_gb * 1e9))
    gen = Generator(args.variant, args.lora_scale, use_lora=not args.no_lora, bake_lora=not args.no_bake,
                    fp16=args.fp16)
    pairs = [tuple(x.split(":")) for x in args.pairs] if args.pairs else \
        [(pid, bid) for pid in places for bid in buckets]
    todo = [(pid, bid) for pid, bid in pairs
            if not (args.skip_existing and (place_dir(pid) / bid / args.tag / "meta.json").exists())]
    enc = gen.precompute([prompts.compose(pid, bid, erp_trigger=gen.lora_scale is not None)["prompt"]
                          for pid, bid in todo], args.guidance)
    print(json.dumps({"model_load_seconds": round(gen.load_seconds, 1), "encode_seconds": round(enc, 1),
                      "scenes": len(todo)}), flush=True)
    for pid, bid in todo:
        meta = run_scene(gen, pid, bid, args)
        print(json.dumps({k: meta[k] for k in ("place", "bucket", "tag", "seconds", "seam_ratio", "seam_rank",
                                               "pole_ratio")}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
