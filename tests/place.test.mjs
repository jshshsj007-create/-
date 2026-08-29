/**
 * مكان اللقاء.
 *
 * المكان ثابت، فقيمته كلها في أنه يُكتب مرة ويجري على كل رابط ورسالة. فما
 * يُختبر هنا شكل السطر، بل الترجيح: متى يغلب مكان البرنامج، ومتى يرجع لمكان
 * الفريق — ولا يصير رابطٌ يدلّ ولي أمرٍ على جامعٍ غير الذي فيه ابنه.
 *
 * ويُختبر معه الرابط نفسه: يدخل `href` في صفحة عامة، فما يُقبل منه إلا الويب.
 */
import assert from 'node:assert/strict';
import { placeOf, mapHref, publicView, signupVars, varNames, fillTemplate } from '../src/signup.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const team = { name: 'جامع الأمير سلطان', map: 'https://maps.app.goo.gl/aaa' };
const prog = (place) => ({ id: 'p1', name: 'جمعة الرواد', signup: { place } });

/* ----------------------------- الترجيح ----------------------------- */

test('بلا مكانٍ للبرنامج يجري مكان الفريق', () => {
  assert.deepEqual(placeOf({ place: team }, prog()), team);
  assert.deepEqual(placeOf({ place: team }, prog({ name: '', map: '' })), team);
});

test('ومكان البرنامج يغلب عليه — في هذا البرنامج وحده', () => {
  const own = { name: 'جامع الرحمة', map: 'https://maps.app.goo.gl/bbb' };
  assert.deepEqual(placeOf({ place: team }, prog(own)), own);
  // والبرنامج الثاني ما تأثّر
  assert.deepEqual(placeOf({ place: team }, prog()), team);
});

test('واسمٌ فاضٍ لا يغلب ولو معه رابط — مكانٌ بلا اسمٍ ما يُقرأ', () => {
  const half = { name: '  ', map: 'https://maps.app.goo.gl/ccc' };
  assert.deepEqual(placeOf({ place: team }, prog(half)), team);
});

test('وبلا مكانٍ أصلًا يرجع فاضيًا، فما يظهر السطر', () => {
  assert.deepEqual(placeOf({}, prog()), { name: '', map: '' });
  assert.deepEqual(placeOf(undefined, undefined), { name: '', map: '' });
});

test('والفراغ حول الاسم ينشال — ما يُطبع على الصفحة', () => {
  assert.equal(placeOf({ place: { name: '  جامع النور  ' } }, prog()).name, 'جامع النور');
});

/* ------------------------------ الرابط ------------------------------ */

test('رابط الخريطة يُقبل بالبادئة وبدونها', () => {
  assert.equal(mapHref('https://maps.app.goo.gl/x'), 'https://maps.app.goo.gl/x');
  assert.equal(mapHref('http://maps.google.com/x'), 'http://maps.google.com/x');
  assert.equal(mapHref('maps.app.goo.gl/x'), 'https://maps.app.goo.gl/x', 'من لصق بلا بادئة نكمّلها له');
  assert.equal(mapHref('  maps.app.goo.gl/x  '), 'https://maps.app.goo.gl/x');
});

test('وما هو رابط ويب يُرَدّ — الصفحة عامة و`href` باب', () => {
  assert.equal(mapHref('javascript:alert(1)'), '');
  assert.equal(mapHref('JavaScript:alert(1)'), '');
  assert.equal(mapHref('data:text/html,<b>x'), '');
  assert.equal(mapHref('جامع الأمير سلطان'), '', 'اسمٌ كُتب في خانة الرابط غلطًا');
  assert.equal(mapHref(''), '');
  assert.equal(mapHref(null), '');
});

test('والرابط المردود ما يعبر إلى ما يُعرض', () => {
  const p = placeOf({ place: { name: 'جامع', map: 'javascript:alert(1)' } }, prog());
  assert.equal(p.name, 'جامع');
  assert.equal(p.map, '', 'الاسم يبقى والرابط ينشال — فيُقرأ ولا يُضغط');
});

/* --------------------------- في الصفحة --------------------------- */

const data = (place) => ({
  place,
  faidAccounts: [],
  signupFields: [],
  programs: [{ id: 'p1', name: 'جمعة الرواد', weeks: [{ id: 'w1', name: 'اليوم الأول' }] }],
});
const viewOf = (place, programPlace) => {
  const d = data(place);
  const p = { ...d.programs[0], signup: { openWeeks: ['w1'], place: programPlace } };
  return publicView(d, p);
};

test('المكان ينزل في صفحة ولي الأمر', () => {
  assert.deepEqual(viewOf(team).place, team);
});

test('ومكان البرنامج ينزل مكانه', () => {
  const own = { name: 'جامع الرحمة', map: '' };
  assert.deepEqual(viewOf(team, own).place, { name: 'جامع الرحمة', map: '' });
});

/* --------------------------- في الرسالة --------------------------- */

test('{المكان} و{رابط الخريطة} يمتلئان في رسالة واتساب', () => {
  const view = viewOf(team);
  const vars = signupVars(view, { kids: [{ name: 'محمد', days: ['w1'] }], answers: {} }, { ref: 'FA-1' });
  assert.equal(vars['المكان'], 'جامع الأمير سلطان');
  assert.equal(vars['رابط الخريطة'], 'https://maps.app.goo.gl/aaa');
  assert.equal(
    fillTemplate('المكان: {المكان}\n{رابط الخريطة}', vars),
    'المكان: جامع الأمير سلطان\nhttps://maps.app.goo.gl/aaa',
  );
});

test('وبلا مكانٍ ما يطلع نصّ المتغيّر على ولي الأمر', () => {
  const vars = signupVars(viewOf(undefined), { kids: [], answers: {} }, {});
  assert.equal(vars['المكان'], '');
  assert.equal(fillTemplate('{المكان}', vars), '');
});

test('والمتغيّران في القائمة المعروضة لصاحب البرنامج', () => {
  const names = varNames({ fields: [] });
  assert.ok(names.includes('المكان'), 'وإلا ما عرف إنه يقدر يضيفه');
  assert.ok(names.includes('رابط الخريطة'));
});

console.log(`\n✅ ${passed} اختبارًا لمكان اللقاء\n`);
