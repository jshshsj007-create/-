/**
 * ينسخ عاملَ pdf.js إلى `public/` قبل البناء.
 *
 * pdf.js يرسم الورقة في خيطٍ جانبي، وملفُ ذاك الخيط لازم يُخدَم بعنوانٍ ثابت.
 * ولا نضعه في المستودع بيدنا: ينسخ من الحزمة المثبَّتة كل بناء، فما يفترق عن
 * المكتبة لو رُفعت نسختُها يومًا.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const to = path.join(root, 'public/pdf.worker.min.mjs');

if (!fs.existsSync(from)) {
  console.error('ما لقينا عامل pdf.js في node_modules — شغّل npm install.');
  process.exit(1);
}
fs.copyFileSync(from, to);
console.log('pdf.worker.min.mjs → public/');
