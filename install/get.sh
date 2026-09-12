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
#   --bin-dir=DIR  where the `nils` binary goes (default ~/.local/bin, or
#                  /usr/local/bin as root)
#   --version=X    a version instead of the newest release
#   --no-setup     install the binary and stop
# Everything else is passed to `nils setup`, `--dir` among it, which is
# where the registry and the rest live rather than where the binary goes.
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
    --bin-dir=*) dir="${arg#--bin-dir=}" ;;
    --version=*) version="${arg#--version=}" ;;
    --no-setup) run_setup=0 ;;
    -h|--help)
      printf '%s\n' "curl -fsSL https://nils.kineuro.se/get | sh" \
        "  --bin-dir=DIR  where the nils binary goes" \
        "  --version=X    a version instead of the newest release" \
        "  --no-setup     install the binary and stop" \
        "  anything else is passed to 'nils setup' (--parts, --dir, --mode, --yes, --print)" \
        "" \
        "  --bin-dir is where the binary goes; --dir, which the wizard takes," \
        "  is where the registry and everything else lives."
      exit 0 ;;
    *) rest="$rest $arg" ;;
  esac
done

die() { printf '%s\n' "$*" >&2; exit 1; }

# A progress bar on one line: `bar <bytes so far> <bytes in all> <width>`.
bar() {
  awk -v got="$1" -v all="$2" -v w="$3" -v plum="$plum" -v dim="$dim" -v off="$off" 'BEGIN {
    if (all <= 0) all = 1
    if (got > all) got = all
    filled = int(w * got / all)
    line = ""
    for (i = 0; i < filled; i++) line = line "█"
    rest = ""
    for (i = filled; i < w; i++) rest = rest "░"
    printf "\r [%s%s%s%s%s] %3d%%  %s%d of %d MB%s ", plum, line, off, dim, rest, int(100 * got / all), dim, got / 1048576, all / 1048576, off
  }'
}
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

# The highest version on standard input, one per line. GitHub lists releases
# in no order a version can rely on: after 1.0.0-alpha.11 it put alpha.9
# first, so the first listed is not the newest.
newest() {
  awk '
    function key(v,    core, pre, c, num, lbl, k) {
      core = v; pre = ""
      if (index(v, "-")) { core = substr(v, 1, index(v, "-") - 1); pre = substr(v, index(v, "-") + 1) }
      split(core, c, ".")
      k = sprintf("%06d.%06d.%06d", c[1], c[2], c[3])
      if (pre == "") return k ".1"
      num = pre; lbl = pre
      sub(/.*\./, "", num); sub(/\.[0-9]+$/, "", lbl)
      if (num !~ /^[0-9]+$/) num = 0
      return k ".0." lbl "." sprintf("%06d", num)
    }
    NF { k = key($0); if (best == "" || k > bestk) { best = $0; bestk = k } }
    END { if (best != "") print best }
  '
}

# The newest release, pre-release or not: GitHub's own `latest` skips a
# pre-release, and before 1.0.0 that is all there is.
if [ -z "$version" ]; then
  version=$(curl -fsSL --connect-timeout 15 --max-time 60 "$REL/latest/download/VERSION" 2>/dev/null | tr -d ' \r\n' || true)
fi
if [ -z "$version" ]; then
  version=$(curl -fsSL --connect-timeout 15 --max-time 60 -H 'accept: application/vnd.github+json' \
    "https://api.github.com/repos/kineuro/nils/releases?per_page=30" 2>/dev/null \
    | grep -o '"tag_name"[ ]*:[ ]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | sed 's/^v//' | newest || true)
fi
[ -n "$version" ] || die "no release found at $REL"

base="$REL/download/v$version"
tmp=$(mktemp)

# The bar only on a terminal; colour only there too, and not when NO_COLOR
# is set, which asks for no colour and nothing more. Truecolor in plum and
# cream where the terminal says it has it, the nearest of the 256 otherwise.
live=0
[ -t 1 ] && [ "${TERM:-dumb}" != dumb ] && live=1
colour=0
[ "$live" = 1 ] && [ -z "${NO_COLOR:-}" ] && colour=1
if [ "$colour" = 1 ]; then
  case "${COLORTERM:-}" in
    truecolor|24bit) plum=$(printf '\033[38;2;196;120;168m'); cream=$(printf '\033[38;2;246;245;242m') ;;
    *) plum=$(printf '\033[38;5;175m'); cream=$(printf '\033[38;5;255m') ;;
  esac
  dim=$(printf '\033[2m'); bold=$(printf '\033[1m'); off=$(printf '\033[0m')
else
  plum=""; cream=""; dim=""; bold=""; off=""
fi

printf '\n'
printf ' %s╔╗╔ ╦ ╦   ╔═╗%s\n' "$plum$bold" "$off"
printf ' %s║║║ ║ ║   ╚═╗%s   %sNeuroimaging Intelligent Linked System%s\n' "$plum$bold" "$off" "$cream" "$off"
printf ' %s╝╚╝ ╩ ╩═╝ ╚═╝%s   %sKarolinska Institutet · kineuro.se/nils%s\n' "$plum$bold" "$off" "$dim" "$off"
printf '\n NILS %s for %s\n' "$version" "$target"

# The binary, with a bar when there is a terminal to draw it on: its size is
# asked first, and the file is measured as it arrives.
url="$base/nils-$target"
total=0
if [ "$live" = 1 ]; then
  total=$(curl -fsIL --connect-timeout 15 --max-time 60 "$url" 2>/dev/null \
    | tr -d '\r' | awk 'tolower($1)=="content-length:" {n=$2} END {print n+0}')
fi
if [ "$live" = 1 ] && [ "${total:-0}" -gt 0 ]; then
  curl -fsSL --connect-timeout 15 --max-time 900 "$url" -o "$tmp" &
  pid=$!
  width=28
  while kill -0 "$pid" 2>/dev/null; do
    got=$(wc -c < "$tmp" 2>/dev/null | tr -d ' ')
    bar "$got" "$total" "$width"
    sleep 0.2
  done
  if wait "$pid"; then
    bar "$total" "$total" "$width"
    printf '\n'
  else
    printf '\n'
    rm -f "$tmp"
    die "no binary for $target in release $version; build from source: https://kineuro.se/nils/docs/"
  fi
else
  curl -fsSL --connect-timeout 15 --max-time 900 "$url" -o "$tmp" \
    || { rm -f "$tmp"; die "no binary for $target in release $version; build from source: https://kineuro.se/nils/docs/"; }
fi

want=$(curl -fsSL --connect-timeout 15 --max-time 120 "$base/SHA256SUMS" 2>/dev/null | grep " nils-$target\$" | awk '{print $1}' || true)
if [ -n "$want" ]; then
  if have sha256sum; then got=$(sha256sum "$tmp" | awk '{print $1}'); else got=$(shasum -a 256 "$tmp" | awk '{print $1}'); fi
  [ "$got" = "$want" ] || { rm -f "$tmp"; die "checksum mismatch, nothing was installed"; }
fi

chmod 755 "$tmp"
mv -f "$tmp" "$dir/nils"
[ "$plat" = macos ] && xattr -d com.apple.quarantine "$dir/nils" 2>/dev/null || true
printf ' %s✓%s installed %s/nils\n' "$plum" "$off" "$dir"

case ":$PATH:" in
  *":$dir:"*) ;;
  *) printf '\nadd this to your shell profile:\n  export PATH="%s:$PATH"\n\n' "$dir" ;;
esac

[ "$run_setup" = 1 ] || exit 0

# The wizard asks questions, so give it the terminal even though this script
# arrived through a pipe. Without one it takes the defaults and says so.
#
# The test opens the terminal rather than asking whether the file is there.
# In a script with no controlling terminal, /dev/tty is still a character
# device that passes every test you can make of it and then refuses to
# open, and the install ended on "cannot open /dev/tty" instead of taking
# the defaults, which is the whole point of having a default path.
#
# The open is in a subshell because a redirection that fails on a special
# builtin ends the shell, and `set -e` is on.
if (exec < /dev/tty) 2>/dev/null; then
  exec "$dir/nils" setup $rest < /dev/tty
else
  exec "$dir/nils" setup --yes $rest
fi
