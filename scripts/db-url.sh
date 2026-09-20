#!/bin/sh
# Print absolute SQLite URL under ./data/linedev.db (cwd = project root)
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
echo "file:${ROOT}/data/linedev.db"
