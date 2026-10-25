#!/bin/zsh
# Pilot (#67) modellerini indirir ve mflux ile 4-bit'e çevirir. Ağırlıklar depoya girmez:
#   ham (bf16) indirme önbelleği: ~/.cache/time-portal/pilot/hf
#   4-bit kopyalar:               ~/.cache/time-portal/pilot/models/<ad>-q4
# Kullanım: backend/tools/pilot/setup_models.sh [model ...]  (varsayılan: klein base 4B ve klein 4B)
set -eu
PILOT_DIR=${0:A:h}
CACHE=$HOME/.cache/time-portal/pilot
export HF_HOME=$CACHE/hf
export HF_HUB_ENABLE_HF_TRANSFER=1
mkdir -p $CACHE/models $CACHE/logs

if (( $# )); then
  models=($@)
else
  models=(flux2-klein-base-4b flux2-klein-4b)
fi
for m in $models; do
  out=$CACHE/models/$m-q4
  if [[ -d $out ]]; then
    echo "== $m zaten var: $out"
    continue
  fi
  echo "== $m başlıyor $(date '+%F %T')"
  /usr/bin/time -l $PILOT_DIR/.venv/bin/mflux-save --model $m --quantize 4 --path $out
  echo "== $m bitti $(date '+%F %T')"
done
