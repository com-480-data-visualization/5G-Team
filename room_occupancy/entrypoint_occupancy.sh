#!/bin/sh
set -e

FROM="$(date '+%Y-%m-%dT%H:%M')"
TO="$(date -d '+3 months' '+%Y-%m-%dT%H:%M')"

exec python main.py \
  --rooms-file room_list.txt \
  --output occupancy.json \
  --from "$FROM" \
  --to "$TO"
