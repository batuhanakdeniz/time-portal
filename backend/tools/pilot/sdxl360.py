"""Karşılaştırma: SDXL-360 Diffusion (ProGamerGov) ile aynı tarif, diffusers + MPS.

LİSANS UYARISI: `ProGamerGov/sdxl-360-diffusion` deposunda LICENSE dosyası yok, HF `cardData.license` boş;
yalnızca CITATION.cff "MIT" diyor. Temel SDXL OpenRAIL++. Lisans netleşmeden yalnızca deneme içindir,
çıktısı ürüne girmez.

8 GB bellek için aşamalı yükleme: (1) iki metin kodlayıcı fp16 → tarif gömmeleri → serbest bırak,
(2) SDXL-360 UNet fp16 (5,1 GB) → gürültü giderme → serbest bırak, (3) VAE (fp32, fp16'da NaN riski) → çöz.
Yalnızca metinden 360° (img2img yok): klein'in metin-yalnız koşuluyla karşılaştırılır.

Kullanım: python sdxl360.py --place trabzon-merkez --bucket roma [--width 1024 --height 512 --steps 25]
"""

from __future__ import annotations

import argparse
import gc
import json
import resource
import sys
import time

import numpy as np
from PIL import Image

import depthmath
import prompts
from pilot_common import CACHE_DIR, MODEL_LICENSES, place_dir

BASE = MODEL_LICENSES["sdxl-base"]
S360 = MODEL_LICENSES["sdxl-360"]
HUB = str(CACHE_DIR / "hf" / "hub")


def free():
    import torch

    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--place", required=True)
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=512)
    ap.add_argument("--steps", type=int, default=25)
    ap.add_argument("--guidance", type=float, default=6.0)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--tag", default="sdxl360")
    args = ap.parse_args(argv)

    import torch
    from diffusers import AutoencoderKL, EulerDiscreteScheduler, StableDiffusionXLPipeline, UNet2DConditionModel
    from transformers import CLIPTextModel, CLIPTextModelWithProjection, CLIPTokenizer

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    out = place_dir(args.place) / args.bucket / args.tag
    out.mkdir(parents=True, exist_ok=True)
    composed = prompts.compose(args.place, args.bucket, erp_trigger=False)
    prompt = "equirectangular 360 view, 360 panorama. " + composed["body"]
    t_all = time.perf_counter()
    timings = {}

    # 1. metin kodlayıcılar
    t0 = time.perf_counter()
    kw = dict(revision=BASE["sha"], cache_dir=HUB)
    tok1 = CLIPTokenizer.from_pretrained(BASE["repo"], subfolder="tokenizer", **kw)
    tok2 = CLIPTokenizer.from_pretrained(BASE["repo"], subfolder="tokenizer_2", **kw)
    te1 = CLIPTextModel.from_pretrained(BASE["repo"], subfolder="text_encoder", variant="fp16",
                                        torch_dtype=torch.float16, **kw).to(dev)
    te2 = CLIPTextModelWithProjection.from_pretrained(BASE["repo"], subfolder="text_encoder_2", variant="fp16",
                                                      torch_dtype=torch.float16, **kw).to(dev)
    pipe = StableDiffusionXLPipeline(vae=None, text_encoder=te1, text_encoder_2=te2, tokenizer=tok1,
                                     tokenizer_2=tok2, unet=None, scheduler=None)
    with torch.no_grad():
        pe, npe, ppe, nppe = pipe.encode_prompt(prompt=prompt, device=dev, num_images_per_prompt=1,
                                                do_classifier_free_guidance=True,
                                                negative_prompt=composed["negative"])
    del pipe, te1, te2
    free()
    timings["text_encode"] = time.perf_counter() - t0

    # 2. UNet
    t0 = time.perf_counter()
    unet = UNet2DConditionModel.from_pretrained(S360["repo"], subfolder="unet", revision=S360["sha"],
                                                cache_dir=HUB, torch_dtype=torch.float16).to(dev)
    sched = EulerDiscreteScheduler.from_pretrained(BASE["repo"], subfolder="scheduler", **kw)
    vae_cfg = AutoencoderKL.load_config(BASE["repo"], subfolder="vae", **kw)
    common = dict(prompt_embeds=pe, negative_prompt_embeds=npe, pooled_prompt_embeds=ppe,
                  negative_pooled_prompt_embeds=nppe, num_inference_steps=args.steps, guidance_scale=args.guidance,
                  generator=torch.Generator("cpu").manual_seed(args.seed), output_type="latent")
    # VAE'siz boru hattı: yalnızca gizli değişken üretir (VAE ayrı aşamada yüklenir)
    p = StableDiffusionXLPipeline(vae=AutoencoderKL.from_config(vae_cfg), text_encoder=None, text_encoder_2=None,
                                  tokenizer=None, tokenizer_2=None, unet=unet, scheduler=sched)
    p.vae = None
    with torch.no_grad():
        latents = p(width=args.width, height=args.height, **common).images
    latents = latents.to("cpu", torch.float32)
    del p, unet
    free()
    timings["denoise"] = time.perf_counter() - t0

    # 3. VAE çöz (fp32)
    t0 = time.perf_counter()
    vae = AutoencoderKL.from_pretrained(BASE["repo"], subfolder="vae", **kw).to(dev, torch.float32)
    with torch.no_grad():
        decoded = vae.decode(latents.to(dev) / vae.config.scaling_factor).sample
    arr = ((decoded[0].float().clamp(-1, 1) + 1) * 127.5).permute(1, 2, 0).cpu().numpy().astype(np.uint8)
    del vae
    free()
    timings["decode"] = time.perf_counter() - t0
    img = Image.fromarray(arr)
    img.save(out / "pano.jpg", quality=90)
    seconds = time.perf_counter() - t_all
    meta = {
        "place": args.place, "bucket": args.bucket, "confidence": composed["confidence"], "tag": args.tag,
        "model": "sdxl-360", "width": args.width, "height": args.height, "steps": args.steps,
        "guidance": args.guidance, "seed": args.seed, "init": None, "prompt": prompt,
        "negative_prompt": composed["negative"], "seconds": round(seconds, 1),
        "timing_s": {k: round(v, 1) for k, v in timings.items()},
        "peak_rss_gb_process": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9, 2),
        "seam_ratio": round(depthmath.seam_ratio(arr), 3), "seam_rank": round(depthmath.seam_rank(arr), 3),
        "pole_ratio": round(depthmath.pole_ratio(arr), 3),
        "sources": [{"kind": "model", **S360}, {"kind": "base", **BASE}],
        "label": "Deneme (lisans belirsiz)",
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(json.dumps({k: meta[k] for k in ("place", "bucket", "seconds", "timing_s", "peak_rss_gb_process",
                                           "seam_ratio", "seam_rank", "pole_ratio")}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
