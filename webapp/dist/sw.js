importScripts('/js/idb.js');
importScripts('/js/dbhelper.js');

const staticCacheName = ['restaurant-static-v345'];

const pageUrls = [
    '/',
    '/index.html',
    '/restaurant.html'
];
const scriptUrls = [
    '/js/app.js',
    '/js/restaurant.js',
    '/manifest.json'
];
const dataUrls = ['./data/restaurants.json'];
const stylesUrls = [
    '/css/all.css'
];
const imgsUrls = [
    '/img/1.jpg.webp',
    '/img/1_300.jpg.webp',
    '/img/1_400.jpg.webp',
    '/img/1_600.jpg.webp',
    '/img/2.jpg.webp',
    '/img/2_300.jpg.webp',
    '/img/2_400.jpg.webp',
    '/img/2_600.jpg.webp',
    '/img/3.jpg.webp',
    '/img/3_300.jpg.webp',
    '/img/3_400.jpg.webp',
    '/img/3_600.jpg.webp',
    '/img/4.jpg.webp',
    '/img/4_300.jpg.webp',
    '/img/4_400.jpg.webp',
    '/img/4_600.jpg.webp',
    '/img/5.jpg.webp',
    '/img/5_300.jpg.webp',
    '/img/5_400.jpg.webp',
    '/img/5_600.jpg.webp',
    '/img/6.jpg.webp',
    '/img/6_300.jpg.webp',
    '/img/6_400.jpg.webp',
    '/img/6_600.jpg.webp',
    '/img/7.jpg.webp',
    '/img/7_300.jpg.webp',
    '/img/7_400.jpg.webp',
    '/img/7_600.jpg.webp',
    '/img/8.jpg.webp',
    '/img/8_300.jpg.webp',
    '/img/8_400.jpg.webp',
    '/img/8_600.jpg.webp',
    '/img/9.jpg.webp',
    '/img/9_300.jpg.webp',
    '/img/9_400.jpg.webp',
    '/img/9_600.jpg.webp',
    '/img/10.jpg.webp',
    '/img/10_300.jpg.webp',
    '/img/10_400.jpg.webp',
    '/img/10_600.jpg.webp'
];

const icons = [
    '/favicon.svg',
    '/icons/favicon.ico',
    '/icons/favicon-16x16.png',
    '/icons/favicon-32x32.png',
    '/icons/favicon-70x70.png',
    '/icons/favicon-72x72.png',
    '/icons/favicon-144x144.png',
    '/icons/favicon-150x150.png',
    '/icons/favicon-180x180.png',
    '/icons/favicon-192x192.png',
    '/icons/favicon-196x196.png',
    '/icons/favicon-310x150.png',
    '/icons/favicon-310x310.png',
    '/icons/favicon-512x512.png'

]

const allCaches = [
    ...pageUrls
    , ...imgsUrls
    , ...icons
    , ...scriptUrls
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(staticCacheName).then(function (cache) {
            console.log('Cache oppend for install')
            return cache.addAll(allCaches);
        })
    );
});

// Delete resources from the cache that is not longer needed.
self.addEventListener('activate', event => {
    console.log(`activated`);
    event.waitUntil(
        console.log(`activated ${caches.keys()}`),
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (staticCacheName.indexOf(key) === -1) {
                    try {
                        console.log(`delete ${key}`);
                        return caches.delete(key);
                    }
                    catch (err) { console.log(err, event.request); }
                }
            })
        )).catch(err => console.log(err, event.request))
            .then(async () => {
                await clients.claim();
                console.log(staticCacheName[0] + ' now ready to handle fetches!');

            })
    );
});

self.addEventListener('fetch', event => {

    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
        return;
    }

    if (event.request.url.indexOf('https://maps.googleapis.com/') > -1) {
        event.respondWith(serveGoogleMap(event));
        return;
    }

    if (event.request.url.indexOf('/restaurants') > -1) {
        return;
    }
    if (event.request.url.indexOf('/reviews') > -1) {
        return;
    }


    let networkFetchRequest = event.request.clone();

    event.respondWith(
        caches.match(event.request, { 'ignoreSearch': true }).then(async response => {
            if (response) return response;

            return await fetch(networkFetchRequest).then(response => {
                if (!response) return response;
                let cacheResponse = response.clone();
                caches.open(staticCacheName).then(cache => {
                    cache.put(event.request, cacheResponse);
                });
                return response;
            });
        })
            .catch(err => console.log(err, event.request))
    );
    if (navigator.onLine) {
        if (networkFetchRequest.cache === 'only-if-cached') {
            networkFetchRequest.mode = 'same-origin';
        }

        event.waitUntil(
            fetch(networkFetchRequest).then(response => {
                if (!response) return response;
                let cacheResponse = response.clone();
                caches.open(staticCacheName).then(cache => {
                    cache.put(event.request, cacheResponse);
                });
                return response;
            }).catch(err => console.log(err, event.request))
        );
    }
});



self.addEventListener('message', function (event) {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
        this.console.log('Skip waiting');
    }
});

function serveGoogleMap(event) {
    return caches.match(event.request).then(async response => {
        if (response) return response;

        let networkFetchRequest = event.request.clone();
        return await fetch(networkFetchRequest).then(response => {
            if (!response) return response;
            let cacheResponse = response.clone();
            caches.open(staticCacheName).then(cache => {
                cache.put(event.request, cacheResponse);
            });
            return response;
        });
    })
        .catch((err) => {
            console.log(err, event.request);
        })
}

self.addEventListener('sync', function (event) {
    if (event.tag == 'post-reviews') {
        event.waitUntil(postNewReviewToServer());
    }
    else if (event.tag == 'post-favorites'){
        event.waitUntil(updateRestaurantFavoriteOnServer());
    }
    else {
        console.log(`sync ${event.tag} event fired`);
    }
});


function postNewReviewToServer() {
    return DBHelper.postNewReviewToServer();
}

function updateRestaurantFavoriteOnServer() {
    return DBHelper.updateRestaurantFavoriteOnServer();
}

