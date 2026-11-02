#!/bin/sh
set -eu

# Fly mounts /data at runtime, hiding image-layer permissions.
# Root only fixes volume ownership; the server always executes as node.
if [ "$(id -u)" -ne 0 ]; then
  echo 'vutadex-entrypoint: expected root for volume ownership initialization' >&2
  exit 1
fi
chown node:node /data
exec runuser -u node -- "$@"
