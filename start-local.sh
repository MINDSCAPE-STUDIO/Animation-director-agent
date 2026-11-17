#!/usr/bin/env bash
# Load local .env and start the service.
set -a
. "$(dirname "$0")/.env"
set +a
mkdir -p "$PERSISTENT_STORAGE_DIR"
exec node "$(dirname "$0")/bootstrap.js"
