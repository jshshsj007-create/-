/**
 * المهمة الأسبوعية: تشتغل في الخادم بلا جوال ولا متصفح مفتوح.
 * كل جمعة فجرًا تأخذ لقطة وترفع نسخة لدرايف صاحب التطبيق.
 */
import { getStore } from '@netlify/blobs';
import { runBackup } from '../lib/backup.mjs';

export const config = { schedule: '0 1 * * 5' };

export default async () => {
  const store = getStore({ name: 'faid-team', consistency: 'strong' });
  const r = await runBackup(store);
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
};
