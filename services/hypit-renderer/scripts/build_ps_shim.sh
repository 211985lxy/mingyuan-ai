#!/bin/sh
# Rebuild the `ps` shim.
#
# macOS 26 blocks spawning the system /bin/ps from a Node child process
# (`spawn EPERM`), and prints nothing from a non-interactive shell. Hypit's local
# renderer shells out to `ps` to build the process tree it reaps after a render,
# so without this shim every local render ends with
# "Render cleanup failed; Error: spawn EPERM".
#
# See tools/ps-shim/ps.c for the full explanation.
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_file="$project_dir/tools/ps-shim/ps.c"
target="$project_dir/bin/ps"

if [ ! -f "$source_file" ]; then
  echo "missing $source_file" >&2
  exit 1
fi

if ! command -v cc >/dev/null 2>&1; then
  echo "no C compiler found; install the Xcode command line tools" >&2
  exit 1
fi

mkdir -p "$project_dir/bin"
cc -O2 -Wall -Wextra -o "$target" "$source_file"

echo "built $target"
"$target" -A -o pid=,ppid= | head -3
