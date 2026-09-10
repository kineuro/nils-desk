#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# The theme is one file (D53): no literal colour, face or third-party font
# anywhere else in the front end. Everything speaks in the --n-* tokens.
set -eu
cd "$(dirname "$0")/.."
bad=0
for f in $(git ls-files 'web/src/*.css' 'web/src/*.tsx' 'web/src/*.ts' 'web/index.html' | grep -v '^web/src/ui/theme.css$'); do
  if grep -nE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b|\brgba?\(|\bhsla?\(|color-mix\(|\bui-monospace\b|\bsystem-ui\b|fonts\.googleapis|font-family: *"' "$f" | grep -vE '^\s*[0-9]+:\s*//' ; then
    echo "a literal colour or face outside the theme: $f"; bad=1
  fi
done
exit $bad
