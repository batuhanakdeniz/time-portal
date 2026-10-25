#!/bin/zsh
# Pilot betiğini venv Python'uyla çalıştırır, süre ve tepe belleği /usr/bin/time -l ile ölçer.
# Kullanım: backend/tools/pilot/run_timed.sh <log-adı> <betik.py> [argümanlar...]
# Çıktı: ~/.cache/time-portal/pilot/logs/<log-adı>.log (tqdm satırları süzülmüş özet ekrana basılır)
set -u
PILOT_DIR=${0:A:h}
LOGS=$HOME/.cache/time-portal/pilot/logs
mkdir -p $LOGS
name=$1; shift
script=$1; shift
export HF_HOME=$HOME/.cache/time-portal/pilot/hf
cd $PILOT_DIR
echo "== $(date '+%F %T') memory: $(memory_pressure | tail -1)" > $LOGS/$name.log
/usr/bin/time -l $PILOT_DIR/.venv/bin/python $script "$@" >> $LOGS/$name.log 2>&1
code=$?
echo "== exit $code $(date '+%F %T')" >> $LOGS/$name.log
grep -v -E 'it/s\]|s/it\]|^\s+[0-9]+\s+(average|page|swaps|block|messages|signals|voluntary|involuntary|instructions|cycles)' $LOGS/$name.log | tail -40
exit $code
