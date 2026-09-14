// SPDX-License-Identifier: AGPL-3.0-only
// The languages an answer's code is coloured in (the chat, slice 8), loaded
// together the first time an answer holds code. Each grammar brings its aliases
// (py, sh, ts, yml, toml, html and the like).

import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import julia from "highlight.js/lib/languages/julia";
import markdown from "highlight.js/lib/languages/markdown";
import matlab from "highlight.js/lib/languages/matlab";
import pgsql from "highlight.js/lib/languages/pgsql";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

export function grammars() {
  return createLowlight({
    bash,
    c,
    cpp,
    css,
    diff,
    dockerfile,
    go,
    ini,
    java,
    javascript,
    json,
    julia,
    markdown,
    matlab,
    pgsql,
    plaintext,
    python,
    r,
    rust,
    shell,
    sql,
    typescript,
    xml,
    yaml,
  });
}
