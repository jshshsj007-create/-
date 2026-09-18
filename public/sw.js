/**
 * عامل الخدمة — للإشعار وحده.
 *
 * **ولا يخزّن شيئًا، ولا يعترض طلبًا واحدًا.** لأن عامل الخدمة المخزِّن هو
 * الذي يُبقي النسخة القديمة عند الناس بعد النشر، وهذا عطبٌ وقع في هذا
 * التطبيق من قبل. فما فيه `fetch` أصلًا: كلُّ طلبٍ يمضي إلى الشبكة كما لو
 * لم يكن هذا الملف.
 *
 * ووظيفته اثنتان: يستقبل الإشعار فيعرضه، ويفتح التطبيق إذا ضُغط.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || 'فريق فيض السعودي', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-64.png',
    dir: 'rtl',
    lang: 'ar',
    // بوسمٍ واحد للتنبيه الواحد: لا يتكرّر على الشاشة لو وصل مرتين
    tag: d.tag || 'faydh',
    data: { url: d.url || '/' },
  }));
});

/**
 * الضغط يفتح التطبيق، ويرجع إلى نافذته المفتوحة إن كانت — فلا تُفتح نسخةٌ
 * ثانية فوق نسخة.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
