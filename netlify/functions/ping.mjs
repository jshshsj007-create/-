/** فحص بسيط: يثبت أن دوال الخادم منشورة أصلًا، بلا أي تبعيات. */
export default async () =>
  new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
