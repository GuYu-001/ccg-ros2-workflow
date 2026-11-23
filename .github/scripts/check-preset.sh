#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '::error::%s. Wait for build-binaries to pass on main before publishing.\n' "$1" >&2
  exit 1
}

expected=$(sed -nE "s/^export const EXPECTED_BINARY_VERSION = '([^']+)'$/\1/p" src/utils/installer.ts)
[[ "$expected" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][a-zA-Z0-9.-]+)?$ ]] || fail "Cannot read EXPECTED_BINARY_VERSION"

url=https://github.com/GuYu-001/ccg-ros2-workflow/releases/download/preset/codeagent-wrapper-linux-amd64
wrapper=$(mktemp)
trap 'rm -f "$wrapper"' EXIT
curl -fsSL --retry 2 --max-time 120 -o "$wrapper" "$url" || fail "Cannot download preset linux-amd64 wrapper"
chmod +x "$wrapper"
output=$("$wrapper" --version) || fail "Preset linux-amd64 wrapper --version failed"
actual=${output#codeagent-wrapper version }
[[ "$actual" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][a-zA-Z0-9.-]+)?$ ]] || fail "Unrecognized preset wrapper version; expected $expected"
[[ "$actual" == "$expected" ]] || fail "Preset wrapper is $actual; expected $expected"
printf 'Preset linux-amd64 wrapper matches expected version %s\n' "$expected"
