// مخزن في الذاكرة يحاكي ما يستعمله الخادم من @netlify/blobs
const mem = new Map();
export const getStore = () => ({
  async get(k, opts) { if (!mem.has(k)) return null; const v = mem.get(k); return opts?.type === 'json' ? JSON.parse(v) : v; },
  async set(k, v) { mem.set(k, typeof v === 'string' ? v : String(v)); },
  async setJSON(k, v) { mem.set(k, JSON.stringify(v)); },
  async delete(k) { mem.delete(k); },
  async list(o) { return { blobs: [...mem.keys()].filter((k) => !o?.prefix || k.startsWith(o.prefix)).map((key) => ({ key })) }; },
});
