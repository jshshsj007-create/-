#!/usr/bin/env bash
# تشغيل اختبارات المعادلة المالية.
# يحتاج esbuild فقط (npx يجيبه تلقائيًا) — ما فيه إعداد مشروع كامل.
set -euo pipefail
cd "$(dirname "$0")/.."

STUB=tests/.stubs
rm -rf "$STUB" tests/build
mkdir -p "$STUB/react" "$STUB/lucide-react" tests/build

# بدائل خفيفة لـ react و lucide-react عشان نقدر نستورد دوال الحساب في Node بدون DOM
cat > "$STUB/react/package.json" <<'JSON'
{"name":"react","version":"0.0.0-stub","type":"module","main":"index.mjs","exports":{".":"./index.mjs","./jsx-runtime":"./index.mjs"}}
JSON
cat > "$STUB/react/index.mjs" <<'JS'
const noop = () => {};
export const useState = (v) => [v, noop];
export const useEffect = noop;
export const useCallback = (f) => f;
export const useRef = (v) => ({ current: v });
export const Fragment = 'Fragment';
export const jsx = () => null;
export const jsxs = () => null;
export default { useState, useEffect, useCallback, useRef, Fragment };
JS
cat > "$STUB/lucide-react/package.json" <<'JSON'
{"name":"lucide-react","version":"0.0.0-stub","type":"module","main":"index.mjs","exports":{".":"./index.mjs"}}
JSON
node -e '
const names = require("fs").readFileSync("src/App.tsx","utf8")
  .match(/import \{([\s\S]*?)\} from .lucide-react.;/)[1]
  .split(",").map(s => s.trim().split(" as ")[0]).filter(Boolean);
require("fs").writeFileSync(process.argv[1] + "/lucide-react/index.mjs",
  "const I = () => null;\n" + names.map(n => `export const ${n} = I;`).join("\n"));
' "$STUB"

# نُمرّر البدائل عبر alias عشان esbuild يضمّنها في البندل،
# فما يحتاج Node يحلّ react/lucide وقت التشغيل.
npx --yes esbuild@0.25.0 --loader:.tsx=tsx --jsx=automatic --bundle --format=esm \
  --alias:react="./$STUB/react/index.mjs" \
  --alias:react/jsx-runtime="./$STUB/react/index.mjs" \
  --alias:lucide-react="./$STUB/lucide-react/index.mjs" \
  --outfile=tests/build/app.mjs src/App.tsx >/dev/null

node tests/ledger.test.mjs
node tests/auth.test.mjs
node tests/quick.test.mjs
node tests/club.test.mjs
node tests/faid.test.mjs
node tests/merge.test.mjs
node tests/people.test.mjs
node tests/signup.test.mjs
node tests/freshness.test.mjs
node tests/investment.test.mjs
node tests/seasons.test.mjs
node tests/faidterm.test.mjs
node tests/schedule.test.mjs
rm -rf "$STUB" tests/build
