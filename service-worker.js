const CACHE_NAME = 'telegram-web-app-v1';
const API_CACHE_NAME = 'telegram-web-app-api-v1';

// Файлы для кэширования
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js'
];

// Установка Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Установка');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Кэширование статических файлов');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Активация');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('Service Worker: Удаление старого кэша', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Обработка запросов
self.addEventListener('fetch', event => {
    // Пропускаем запросы к Telegram API и не-GET запросы
    if (!event.request.url.includes(self.location.origin) || 
        event.request.method !== 'GET') {
        return;
    }
    
    // Стратегия кэширования: Сначала сеть, потом кэш
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Клонируем ответ, так как он может быть использован только один раз
                const responseClone = response.clone();
                
                // Кэшируем успешные ответы от API
                if (event.request.url.includes('/odata/') || 
                    event.request.url.includes('/web-service/')) {
                    caches.open(API_CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseClone);
                        });
                }
                
                return response;
            })
            .catch(() => {
                // Если сеть недоступна, пытаемся получить из кэша
                return caches.match(event.request)
                    .then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Для API запросов возвращаем стандартный ответ об ошибке
                        if (event.request.url.includes('/odata/') || 
                            event.request.url.includes('/web-service/')) {
                            return new Response(JSON.stringify({
                                error: 'Нет подключения к интернету',
                                cached: true
                            }), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                    });
            })
    );
});