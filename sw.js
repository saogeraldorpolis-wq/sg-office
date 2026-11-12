/* SG Office Mobile — Service Worker
 * Network-first no shell; NUNCA intercepta chamadas ao Supabase
 * (auth/rest/realtime passam direto, sem cache).
 */
const CACHE = 'sgo-mob-v24';
const SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './config.js',
    './manifest.webmanifest',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const host = new URL(e.request.url).hostname;
    if (host.endsWith('supabase.co')) return;          // nuvem: sempre direto
    e.respondWith(
        fetch(e.request).then(res => {
            if (res && res.ok) {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return res;
        }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
});
