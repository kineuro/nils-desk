#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Every source file starts with its SPDX header.
set -eu
cd "$(dirname "$0")/.."
bad=0
for f in $(git ls-files 'desk/src/*.rs' 'desk/tests/*.rs' 'web/src/*.ts' 'web/src/*.tsx' 'web/src/*.css' 'web/*.ts' 'scripts/*.sh'); do
  if ! head -3 "$f" | grep -q 'SPDX-License-Identifier: AGPL-3.0-only'; then
    echo "no SPDX header: $f"; bad=1
  fi
done
exit $bad
