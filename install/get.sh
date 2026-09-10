#!/bin/sh
# Installs NILS.
#
#   curl -fsSL https://nils.kineuro.se/get | sh
#
# This script does one thing: it puts the `nils` binary on the machine and
# hands over to `nils setup`, the wizard that asks what you want, makes what
# it needs, and installs and runs the rest. Everything it can be told, the
# wizard can be told:
#
#   curl -fsSL https://nils.kineuro.se/get | sh -s -- --parts engine,desk --yes
#
# Options this script takes for itself:
#   --dir=DIR      where the binary goes (default ~/.local/bin, or
#                  /usr/local/bin as root)
#   --version=X    a version instead of the newest release
#   --no-setup     install the binary and stop
# Everything else is passed to `nils setup`.
#
# SPDX-License-Identifier: AGPL-3.0-only
set -eu

REL="${NILS_RELEASES:-https://github.com/kineuro/nils/releases}"
version=""
dir=""
run_setup=1
rest=""

for arg in "$@"; do
  case "$arg" in
    --dir=*) dir="${arg#--dir=}" ;;
    --version=*) version="${arg#--version=}" ;;
    --no-setup) run_setup=0 ;;
    -h|--help)
      printf '%s\n' "curl -fsSL https://nils.kineuro.se/get | sh" \
        "  --dir=DIR      where the binary goes" \
        "  --version=X    a version instead of the newest release" \
        "  --no-setup     install the binary and stop" \
        "  anything else is passed to 'nils setup' (--parts, --dir, --mode, --yes, --print)"
      exit 0 ;;
    *) rest="$rest $arg" ;;
  esac
done

die() { printf '%s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

have curl || die "curl is needed to install NILS"

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os" in
  linux) plat=linux ;;
  darwin) plat=macos ;;
  *) die "unsupported system: $os. On Windows, see https://kineuro.se/nils/docs/" ;;
esac
case "$arch" in
  x86_64|amd64) cpu=x86_64 ;;
  arm64|aarch64) cpu=arm64 ;;
  *) die "unsupported architecture: $arch" ;;
esac
target="$plat-$cpu"

[ -n "$dir" ] || { if [ "$(id -u)" = 0 ]; then dir=/usr/local/bin; else dir="$HOME/.local/bin"; fi; }
mkdir -p "$dir"

# The newest release, pre-release or not: GitHub's own `latest` skips a
# pre-release, and before 1.0.0 that is all there is.
if [ -z "$version" ]; then
  version=$(curl -fsSL --connect-timeout 15 --max-time 60 "$REL/latest/download/VERSION" 2>/dev/null | tr -d ' \r\n' || true)
fi
if [ -z "$version" ]; then
  version=$(curl -fsSL --connect-timeout 15 --max-time 60 -H 'accept: application/vnd.github+json' \
    "https://api.github.com/repos/kineuro/nils/releases?per_page=10" 2>/dev/null \
    | grep -o '"tag_name"[ ]*:[ ]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' | sed 's/^v//' || true)
fi
[ -n "$version" ] || die "no release found at $REL"

base="$REL/download/v$version"
tmp=$(mktemp)
printf 'NILS %s, for %s\n' "$version" "$target"
curl -fsSL --connect-timeout 15 --max-time 900 "$base/nils-$target" -o "$tmp" \
  || { rm -f "$tmp"; die "no binary for $target in release $version; build from source: https://kineuro.se/nils/docs/"; }

want=$(curl -fsSL --connect-timeout 15 --max-time 120 "$base/SHA256SUMS" 2>/dev/null | grep " nils-$target\$" | awk '{print $1}' || true)
if [ -n "$want" ]; then
  if have sha256sum; then got=$(sha256sum "$tmp" | awk '{print $1}'); else got=$(shasum -a 256 "$tmp" | awk '{print $1}'); fi
  [ "$got" = "$want" ] || { rm -f "$tmp"; die "checksum mismatch, nothing was installed"; }
fi

chmod 755 "$tmp"
mv -f "$tmp" "$dir/nils"
[ "$plat" = macos ] && xattr -d com.apple.quarantine "$dir/nils" 2>/dev/null || true
printf 'installed %s/nils\n' "$dir"

case ":$PATH:" in
  *":$dir:"*) ;;
  *) printf '\nadd this to your shell profile:\n  export PATH="%s:$PATH"\n\n' "$dir" ;;
esac

[ "$run_setup" = 1 ] || exit 0

# The wizard asks questions, so give it the terminal even though this script
# arrived through a pipe. Without one it takes the defaults and says so.
if [ -r /dev/tty ] && [ -c /dev/tty ]; then
  exec "$dir/nils" setup $rest < /dev/tty
else
  exec "$dir/nils" setup --yes $rest
fi
