/**
 * المهمة الدورية: تشتغل في الخادم بلا جوال ولا متصفح مفتوح.
 *
 * تصحى كل ساعة وتسأل: هل هذي الساعة هي الموعد اللي اختاره صاحب التطبيق؟
 * لو لا، ترجع تنام. الموعد نفسه محفوظ مع البيانات، فيتغيّر من داخل التطبيق
 * بلا نشرة جديدة — لأن جدول Netlify ثابت لا يتعدّل إلا بنشر.
 */
import { getStore } from '@netlify/blobs';
import { runBackup, backupStatus } from '../lib/backup.mjs';
import { scheduleOf, dueNow } from '../../src/schedule.js';

export const config = { schedule: '0 * * * *' };

export default async () => {
  const store = getStore({ name: 'faid-team', consistency: 'strong' });
  const doc = await store.get('state', { type: 'json' });
  const schedule = scheduleOf(doc?.data);
  const last = await backupStatus(store);
  const now = Date.now();

  if (!dueNow(schedule, now, last?.at)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'مو وقتها', schedule }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const r = await runBackup(store, { now });
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
};
