#!/bin/sh
# Installs NILS on Linux or macOS: the engine, its rule packs, and, with
# --with-desk, the desk as well.
#
#   curl -fsSL https://nils.kineuro.se/get | sh
#   curl -fsSL https://nils.kineuro.se/get | sh -s -- --with-desk
#
# The binaries go in ~/.local/bin (or /usr/local/bin when run as root) and the
# packs in ~/.local/share/nils/packs (or /usr/local/share/nils/packs). Run it
# again to update, or use `nils update`.
#
# Options:
#   --with-desk        install the desk beside the engine
#   --version=X        a version instead of the latest release
#   --from-source      build from source even when a binary exists
#   --no-rust          never install a Rust toolchain; stop instead
#   --dir=DIR          where the binaries go
#
# SPDX-License-Identifier: AGPL-3.0-only
set -eu

ENGINE_REL="${NILS_RELEASES:-https://github.com/kineuro/nils/releases}"
DESK_REL="${NILS_DESK_RELEASES:-https://github.com/kineuro/nils-desk/releases}"
with_desk=0
from_source=0
allow_rust=1
version=""
dir=""

for arg in "$@"; do
  case "$arg" in
    --with-desk) with_desk=1 ;;
    --from-source) from_source=1 ;;
    --no-rust) allow_rust=0 ;;
    --version=*) version="${arg#--version=}" ;;
    --dir=*) dir="${arg#--dir=}" ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

have curl || die "curl is needed to install NILS"
have tar || die "tar is needed to install NILS"

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os" in
  linux) plat=linux ;;
  darwin) plat=macos ;;
  *) die "unsupported system: $os. On Windows, follow https://kineuro.se/nils/docs/engine/install/" ;;
esac
case "$arch" in
  x86_64|amd64) cpu=x86_64 ;;
  arm64|aarch64) cpu=arm64 ;;
  *) die "unsupported architecture: $arch" ;;
esac
target="$plat-$cpu"

if [ -z "$dir" ]; then
  if [ "$(id -u)" = 0 ]; then dir=/usr/local/bin; else dir="$HOME/.local/bin"; fi
fi
if [ "$(id -u)" = 0 ]; then share=/usr/local/share/nils; else share="${XDG_DATA_HOME:-$HOME/.local/share}/nils"; fi
mkdir -p "$dir" "$share"

if [ -n "$version" ]; then base_engine="$ENGINE_REL/download/v$version"; base_desk="$DESK_REL/download/v$version"
else base_engine="$ENGINE_REL/latest/download"; base_desk="$DESK_REL/latest/download"; fi

sha256() { if have sha256sum; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }

# One file from a release, checked against that release's SHA256SUMS.
fetch() {   # fetch <base> <file> <into>
  _base=$1; _file=$2; _into=$3
  curl -fsSL --connect-timeout 15 --max-time 900 "$_base/$_file" -o "$_into" || return 1
  _want=$(curl -fsSL --connect-timeout 15 --max-time 120 "$_base/SHA256SUMS" 2>/dev/null | grep " $_file\$" | awk '{print $1}' || true)
  if [ -n "$_want" ]; then
    _have=$(sha256 "$_into")
    [ "$_have" = "$_want" ] || { rm -f "$_into"; die "checksum mismatch on $_file, nothing was installed"; }
  else
    say "  (that release publishes no checksums; the download was not verified)"
  fi
  return 0
}

install_file() {   # install_file <tmp> <name>
  chmod 755 "$1"
  mv -f "$1" "$dir/$2"
  [ "$plat" = macos ] && xattr -d com.apple.quarantine "$dir/$2" 2>/dev/null || true
  say "installed $dir/$2"
}

build_from_source() {   # build_from_source <repo> <package> <binary>
  _repo=$1; _pkg=$2; _bin=$3
  if ! have cargo; then
    [ "$allow_rust" = 1 ] || die "no Rust toolchain and --no-rust was given; install rustup and run this again"
    say "no Rust toolchain here; installing rustup (https://rustup.rs), which puts it in ~/.rustup and ~/.cargo"
    curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal
    . "$HOME/.cargo/env"
  fi
  have cc || have gcc || have clang || say "a C compiler is needed (build-essential on Debian and Ubuntu, base-devel on Arch, xcode-select --install on macOS)"
  have git || die "git is needed to build from source"
  _src=$(mktemp -d)
  say "cloning $_repo"
  git clone --depth 1 "https://github.com/kineuro/$_repo" "$_src/$_repo"
  if [ "$_repo" = nils-desk ]; then
    have npm || die "Node 22 and npm are needed to build the desk from source"
    ( cd "$_src/$_repo/web" && npm ci --no-audit --no-fund && npm run build )
    ( cd "$_src/$_repo/desk" && cargo build --release --locked )
    cp "$_src/$_repo/desk/target/release/$_bin" "$_src/out"
  else
    ( cd "$_src/$_repo/engine" && cargo build --release --locked -p "$_pkg" )
    cp "$_src/$_repo/engine/target/release/$_bin" "$_src/out"
    rm -rf "$share/packs" && cp -r "$_src/$_repo/packs" "$share/packs"
    say "installed $share/packs"
  fi
  install_file "$_src/out" "$_bin"
  rm -rf "$_src"
}

say "NILS, for $target"

# The engine, and the packs beside it.
tmp=$(mktemp)
if [ "$from_source" = 0 ] && fetch "$base_engine" "nils-$target" "$tmp"; then
  install_file "$tmp" nils
  ptmp=$(mktemp)
  if fetch "$base_engine" "packs.tar.gz" "$ptmp"; then
    rm -rf "$share/packs" && mkdir -p "$share/packs"
    tar xzf "$ptmp" -C "$share/packs" --strip-components=1
    rm -f "$ptmp"
    say "installed $share/packs"
  else
    rm -f "$ptmp"
    say "that release carries no packs; classification will need --pack-dir"
  fi
else
  rm -f "$tmp"
  [ "$from_source" = 1 ] || say "no release binary for $target; building from source"
  build_from_source nils nils nils
fi

# The desk, when asked for.
if [ "$with_desk" = 1 ]; then
  tmp=$(mktemp)
  if [ "$from_source" = 0 ] && fetch "$base_desk" "nils-desk-$target" "$tmp"; then
    install_file "$tmp" nils-desk
  else
    rm -f "$tmp"
    [ "$from_source" = 1 ] || say "no release binary of the desk for $target; building from source"
    build_from_source nils-desk nils-desk nils-desk
  fi
fi

say ""
"$dir/nils" --version 2>/dev/null || true
[ "$with_desk" = 1 ] && "$dir/nils-desk" --version 2>/dev/null || true

case ":$PATH:" in
  *":$dir:"*) ;;
  *) say ""; say "add this to your shell profile:"; say "  export PATH=\"$dir:\$PATH\"" ;;
esac

cat <<NEXT

next, a registry of your own:

  mkdir -p ~/nils/registry
  export NILS_REGISTRY=~/nils/registry
  nils key add nils            # a passphrase, one line, on stdin
  nils init --key nils
  nils serve                   # then http://127.0.0.1:8437/api/capabilities
NEXT

if [ "$with_desk" = 1 ]; then
  cat <<NEXTDESK
and the desk over it:

  mkdir -p ~/nils/desk && cd ~/nils/desk
  printf 'bind = "127.0.0.1:7200"\norigin = "http://127.0.0.1:7200"\nmode = "off"\nstore = "nils-desk.sqlite"\n\n[engine]\nurl = "http://127.0.0.1:8437"\n' > nils-desk.toml
  nils-desk serve --config nils-desk.toml     # then http://127.0.0.1:7200
NEXTDESK
fi

say "the documentation is at https://kineuro.se/nils/docs/ ; \`nils update\` takes the next version"
