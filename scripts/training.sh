#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 /path/to/<voice>_dojo"
  exit 2
fi

DOJO_PATH="$(realpath "$1")"
ORIG_DIR="$(pwd)"
trap 'cd "$ORIG_DIR"' EXIT

if [ ! -d "$DOJO_PATH" ]; then
  echo "Directory not found: $DOJO_PATH"
  exit 3
fi

printf "1\n" > "$DOJO_PATH/.MAX_WORKERS"

cd "$DOJO_PATH"

bash -c './run_training.sh <<'EOF'
1
M
1

EOF
exit 0

