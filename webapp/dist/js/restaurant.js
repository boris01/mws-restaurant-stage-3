//Taken from https://github.com/jakearchibald/idb/tree/master/lib
'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }

  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        },
        set: function(val) {
          this[targetProp][prop] = val;
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getKey',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
      idbTransaction.onabort = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var nativeObject = this._store || this._index;
        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      request.onupgradeneeded = function(event) {
        if (upgradeCallback) {
          upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
        }
      };

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
    module.exports.default = module.exports;
  }
  else {
    self.idb = exp;
  }
}());

//import {idb} from './idb.js'
//var idb = require('idb');
const indexDBVersion = 1;
const indexDBStoreName = 'restaurant-idb';
const indexDBStoreObjects = 'restaurants';
const indexDBReviewsStoreObjects = 'reviews';

/**
 * Common database helper functions.
 */
class DBHelper {

  /**
   * Database URL.
   * Change this to restaurants.json file location on your server.
   */
  static get DATABASE_URL() {
    const port = 1337; // Change this to your server port
    return `http://localhost:${port}/restaurants`;

  }

  static get DATABASE_REVIEWS_URL() {
    const port = 1337; // Change this to your server port
    return `http://localhost:${port}/reviews`;

  }

  static async openIndexDB() {
    // if (!('indexedDB' in window)) {
    //   console.log('This browser doesn\'t support IndexedDB');
    //   return;
    // }

    let db = await idb.open(indexDBStoreName, indexDBVersion, (upgradeDb) => {
      let store = upgradeDb.createObjectStore(indexDBStoreObjects, {
        keyPath: 'id'
      });
      store.createIndex('by-id', 'id');
      store.createIndex('by-isDirty', 'isDirty', { unique: false });
      let reviewStore = upgradeDb.createObjectStore(indexDBReviewsStoreObjects, {
        keyPath: 'id',
        autoIncrement: true
      });
      reviewStore.createIndex('by-restaurant_id', 'restaurant_id', { unique: false });
      reviewStore.createIndex('by-isNew', 'isNew', { unique: false });
      reviewStore.createIndex('by-id', 'id');

    });

    return db;
  }

  static async insertUpdateIndexDB(restaurants) {
    if (!restaurants) return;

    let db = await this.openIndexDB();
    if (!db) return;

    let tx = db.transaction(indexDBStoreObjects, 'readwrite');
    let store = tx.objectStore(indexDBStoreObjects);

    restaurants.forEach(async element => {
      element.isDirty = "false";
      await store.put(element);
      //let record = await store.get(element.id);
      //await store.put(record);
    });

    await db.close();

    return await this.getCacheFromIndexDB();
  }

  static async insertUpdateReviewIndexDB(restaurant_id, name, rating, comments) {
    if (!restaurant_id || !name || !rating || !comments) return;

    let db = await this.openIndexDB();
    if (!db) return;

    let reviewRecord = { 'restaurant_id': parseInt(restaurant_id), 'name': name, 'createdAt': new Date().getTime(), 'updatedAt': new Date().getTime(), 'rating': parseInt(rating), 'comments': comments, 'isNew': 'true' };

    let reviewTx = db.transaction(indexDBReviewsStoreObjects, 'readwrite');
    let reviewStore = reviewTx.objectStore(indexDBReviewsStoreObjects);

    await reviewStore.put(reviewRecord);

    await db.close();

    return await this.getCahedReviewFromIndexDBByID(restaurant_id);
  }

  static async insertUpdateReviewsIndexDB(restaurant_id, reviews) {
    if (!reviews || !restaurant_id) return;

    let db = await this.openIndexDB();
    if (!db) return;

    let tx = db.transaction(indexDBReviewsStoreObjects, 'readwrite');
    let store = tx.objectStore(indexDBReviewsStoreObjects);

    reviews.forEach(async element => {
      element.isNew = 'false';
      await store.put(element);
      //let record = await store.get(element.id);
      //await store.put(record);
    });

    await db.close();

    return await this.getCahedReviewFromIndexDBByID(restaurant_id);
  }

  static async deleteCahedNewReviewsInIndexDB(review_id) {
    let db = await this.openIndexDB();
    if (!db) return;
    let tx = await db.transaction(indexDBReviewsStoreObjects, 'readwrite');
    let store = await tx.objectStore(indexDBReviewsStoreObjects);
    return store.delete(review_id);

  }

  static async getCahedNewReviewsFromIndexDB() {
    let db = await this.openIndexDB();
    if (!db) return;

    let tx = await db.transaction(indexDBReviewsStoreObjects, 'readonly');
    let store = await tx.objectStore(indexDBReviewsStoreObjects);
    let reviewIndex = await store.index('by-isNew');
    let range = IDBKeyRange.only('true');
    let reviews = await reviewIndex.getAll(range);
    console.log(`Reviews: ${reviews}`);
    await db.close();
    return reviews;

  }

  static async getCahedReviewFromIndexDBByID(restaurant_id) {
    let db = await this.openIndexDB();
    if (!db) return;

    let tx = await db.transaction(indexDBReviewsStoreObjects, 'readonly');
    let store = await tx.objectStore(indexDBReviewsStoreObjects);
    let reviewIndex = await store.index('by-restaurant_id');
    let range = IDBKeyRange.only(parseInt(restaurant_id));
    let reviews = await reviewIndex.getAll(range);
    console.log(`Reviews: ${reviews}`);
    await db.close();
    return reviews;
  }

  static async getCahedFromIndexDBByID() {
    let db = await this.openIndexDB();
    if (!db) return;

    let tx = db.transaction(indexDBStoreObjects, 'readwrite');
    let store = tx.objectStore(indexDBStoreObjects);
    let restaurant = await store.get(element.id);
    console.log(restaurant);
    await db.close();
    return restaurant;
  }

  static async getCacheFromIndexDB() {
    let db = await this.openIndexDB();
    if (!db) return;

    let tx = db.transaction(indexDBStoreObjects, 'readonly');
    let store = tx.objectStore(indexDBStoreObjects);
    let restaurantsIndex = store.index('by-id');

    let restaurants = await restaurantsIndex.getAll();
    console.log(restaurants);
    await db.close();
    return restaurants;

  }
  static async getDirtyRestaurantsRecordsFromIndexDB() {
    let db = await this.openIndexDB();
    if (!db) return;

    let tx = db.transaction(indexDBStoreObjects, 'readonly');
    let store = tx.objectStore(indexDBStoreObjects);
    let restaurantsIndex = store.index('by-isDirty');
    let range = IDBKeyRange.only('true');

    let restaurants = await restaurantsIndex.getAll(range);
    console.log(restaurants);
    await db.close();
    return restaurants;

  }

  static async updateFavoriteRestarauntInIndexDB(restaurant) {
    if (!restaurant) return;

    let db = await this.openIndexDB();
    if (!db) return;

    let tx = db.transaction(indexDBStoreObjects, 'readwrite');
    let store = tx.objectStore(indexDBStoreObjects);
    await store.put(restaurant);
    await db.close();

    return;
  }

  /**
   * Fetch all restaurants.
   */
  static fetchRestaurants(callback) {


    fetch(DBHelper.DATABASE_URL, {
      method: 'GET'
    }).then(response => {
      if (response.ok) {
        return response.json();
      }
      else {
        return this.getCacheFromIndexDB();
      }
      //throw new Error(`Network response returned error. Status ${response.status}`);
    }).then(response => {
      this.insertUpdateIndexDB(response).then(res => {
        const restaurants = response;
        callback(null, restaurants);
      });
    }).catch(e => {
      this.getCacheFromIndexDB().then(response => {
        const restaurants = response;
        callback(null, restaurants);
      }).catch(e => {
        console.log(`fetchRestaurants:: error ${e.message}`);
      });
    });
  }

  static fetchRestaurantReviewsByID(restaurant_id, callback) {

    let url = `${DBHelper.DATABASE_REVIEWS_URL}/?restaurant_id=${restaurant_id}`;
    fetch(url, {
      method: 'GET',

    }).then(response => {
      if (response.ok) {
        return response.json();
      }
      else {
        return this.getCahedReviewFromIndexDBByID(restaurant_id);
      }
      //throw new Error(`Network response returned error. Status ${response.status}`);
    }).then(response => {
      this.insertUpdateReviewsIndexDB(restaurant_id, response).then(res => {
        const reviwes = res;
        callback(null, reviwes);
      });
    }).catch(e => {
      this.getCahedReviewFromIndexDBByID(restaurant_id).then(response => {
        const reviwes = response;
        callback(null, reviwes);
      }).catch(e => {
        console.log(`fetchRestaurantReviewsByID:: error ${e.message}`);
      });
    });
  }

  /**
   * Fetch a restaurant by its ID.
   */
  static fetchRestaurantById(id, callback) {
    // fetch all restaurants with proper error handling.
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        const restaurant = restaurants.find(r => r.id == id);
        if (restaurant) { // Got the restaurant
          callback(null, restaurant);
        } else { // Restaurant does not exist in the database
          callback('Restaurant does not exist', null);
        }
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   */
  static fetchRestaurantByCuisine(cuisine, callback) {
    // Fetch all restaurants  with proper error handling
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given cuisine type
        const results = restaurants.filter(r => r.cuisine_type == cuisine);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   */
  static fetchRestaurantByNeighborhood(neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given neighborhood
        const results = restaurants.filter(r => r.neighborhood == neighborhood);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
   */
  static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        let results = restaurants
        if (cuisine != 'all') { // filter by cuisine
          results = results.filter(r => r.cuisine_type == cuisine);
        }
        if (neighborhood != 'all') { // filter by neighborhood
          results = results.filter(r => r.neighborhood == neighborhood);
        }
        callback(null, results);
      }
    });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   */
  static fetchNeighborhoods(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all neighborhoods from all restaurants
        const neighborhoods = restaurants.map((v, i) => restaurants[i].neighborhood)
        // Remove duplicates from neighborhoods
        const uniqueNeighborhoods = neighborhoods.filter((v, i) => neighborhoods.indexOf(v) == i)
        callback(null, uniqueNeighborhoods);
      }
    });
  }

  /**
   * Fetch all cuisines with proper error handling.
   */
  static fetchCuisines(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all cuisines from all restaurants
        const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type)
        // Remove duplicates from cuisines
        const uniqueCuisines = cuisines.filter((v, i) => cuisines.indexOf(v) == i)
        callback(null, uniqueCuisines);
      }
    });
  }




  /**
   * Restaurant page URL.
   */
  static urlForRestaurant(restaurant) {
    return (`./restaurant.html?id=${restaurant.id}`);
  }

  /**
   * Restaurant image URL.
   */
  static imageUrlForRestaurant(restaurant) {
    if (!restaurant.photograph)
      return (`/img/undefined.svg`);
    return (`/img/${restaurant.photograph}.jpg.webp`);
  }

  /**
   * Map marker for a restaurant.
   */
  static mapMarkerForRestaurant(restaurant, map) {
    const marker = new google.maps.Marker({
      position: restaurant.latlng,
      title: restaurant.name,
      url: DBHelper.urlForRestaurant(restaurant),
      map: map,
      animation: google.maps.Animation.DROP
    }
    );
    return marker;
  }

  static postNewReviewToServer() {
    console.log('Uploading review to the server');
    return new Promise(async (resolve, reject) => {
      if (!navigator.onLine) return reject("application is offline");
      DBHelper.getCahedNewReviewsFromIndexDB().then((reviews) => {
        if (!reviews) return resolve();
        return Promise.all(reviews.map((review) => {
          return fetch(DBHelper.DATABASE_REVIEWS_URL, {
            method: 'POST',
            body: JSON.stringify({
              "restaurant_id": review.restaurant_id,
              "name": review.name,
              "rating": review.rating,
              "comments": review.comments
            }),
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }).then((response) => {
            return response.json();
          }).then(async (data) => {
            if (data) {
              await DBHelper.deleteCahedNewReviewsInIndexDB(review.id);
              return resolve();
            }
          })
        })).catch((error) => {
          console.error(error);
          return reject(Error(error));
        })
      }).catch((error) => {
        console.log(error);
        return reject(Error(error));
      });
    });
  }

  static updateRestaurantFavoriteOnServer() {
    console.log('Update favorite on the server');
    return new Promise(async (resolve, reject) => {
      if (!navigator.onLine) return reject("application is offline");
      DBHelper.getDirtyRestaurantsRecordsFromIndexDB().then((restaurants) => {
        if (!restaurants) return resolve();
        return Promise.all(restaurants.map((restaurant) => {
          let url = `${DBHelper.DATABASE_URL}/${restaurant.id}/?is_favorite=${restaurant.is_favorite}`;
          return fetch(url, {
            method: 'PUT'
          }).then((response) => {
            return response.json();
          }).then(async (data) => {
            if (data) {
              await this.updateFavoriteRestarauntInIndexDB(data);
              return resolve();
            }
          })
        })).catch((error) => {
          console.error(error);
          return reject(Error(error));
        })
      }).catch((error) => {
        console.log(error);
        return reject(Error(error));
      });
    });
  }

  static async favoriteRestaraunt(restaurant) {
    try {
      await this.updateFavoriteRestarauntInIndexDB(restaurant);

      if (!navigator.onLine) {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          let reg = await navigator.serviceWorker.ready;
          try {
            await reg.sync.register('post-favorites');
            console.log("post-favorites sync registerd");
          } catch (error) {

            console.log(`system was unable to register for a sync, this could be an OS-level restriction. ${error}`);
            await this.updateRestaurantFavoriteOnServer();
          }

        } else {
          // serviceworker/sync not supported
          console.log(`serviceworker/sync not supported`);
          await this.updateRestaurantFavoriteOnServer();
        }
      } else {
        await this.updateRestaurantFavoriteOnServer();
      }
    } catch (error) {
      console.log(error);
      return false;
    }

    return true;
  }
}


//Original code taken from: https://github.com/ireade/accessible-modal-dialog
function Dialog(dialogEl) {

	this.dialogEl = dialogEl;
	this.focusedElBeforeOpen;

	let focusableEls = this.dialogEl.querySelectorAll('a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]');
	this.focusableEls = Array.prototype.slice.call(focusableEls);

	this.firstFocusableEl = this.focusableEls[0];
	this.lastFocusableEl = this.focusableEls[this.focusableEls.length - 1];

	this.close(); // Reset
}


Dialog.prototype.open = function () {

	let Dialog = this;


	this.dialogEl.removeAttribute('aria-hidden');

	this.focusedElBeforeOpen = document.activeElement;

	this.dialogEl.addEventListener('keydown', function (e) {
		Dialog._handleKeyDown(e);
	});

	this.dialogEl.style.display = "block";
	this.firstFocusableEl.focus();
};

Dialog.prototype.close = function () {

	this.dialogEl.setAttribute('aria-hidden', true);

	if (this.focusedElBeforeOpen) {
		this.focusedElBeforeOpen.focus();
		console.log(this.focusedElBeforeOpen + ' button focused');
	}

	this.dialogEl.style.display = "none";
};


Dialog.prototype._handleKeyDown = function (e) {

	let Dialog = this;
	let KEY_TAB = 9;
	let KEY_ESC = 27;

	function handleBackwardTab() {
		if (document.activeElement === Dialog.firstFocusableEl) {
			e.preventDefault();
			Dialog.lastFocusableEl.focus();
			console.log('Dismiss button focused');
		}
		else {
			e.preventDefault();
			Dialog.firstFocusableEl.focus();
			console.log('Refresh button focused');
		}
	}
	function handleForwardTab() {
		if (document.activeElement === Dialog.lastFocusableEl) {
			e.preventDefault();
			Dialog.firstFocusableEl.focus();
			console.log('Refresh button focused');
		}
		else {
			e.preventDefault();
			Dialog.lastFocusableEl.focus();
			console.log('Dismiss button focused');
		}
	}

	switch (e.keyCode) {
		case KEY_TAB:
			if (Dialog.focusableEls.length === 1) {
				e.preventDefault();
				break;
			}
			if (e.shiftKey) {
				handleBackwardTab();
			} else {
				handleForwardTab();
			}
			break;
		case KEY_ESC:
			Dialog.close();
			break;
		default:
			break;
	}
};


Dialog.prototype.addEventListeners = function (openDialogSel, closeDialogSel) {

	let Dialog = this;

	let closeDialogEls = document.querySelectorAll(closeDialogSel);
	for (let i = 0; i < closeDialogEls.length; i++) {
		closeDialogEls[i].addEventListener('click', function () {
			Dialog.close();
		});
	}

};




var restaurant;
var reviews;
var map;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/**
 * Initialize Google map, called from HTML.
 */
window.initMap = () => {
  console.log('initMap');
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.error(error);
    } else {


      self.map = new google.maps.Map(document.getElementById('map'), {
        zoom: 16,
        center: restaurant.latlng,
        scrollwheel: false
      });
      DBHelper.mapMarkerForRestaurant(self.restaurant, self.map);
    }
  });
  fetchRestaurantReviewsFromURL((error, reviews) => {
    if (error) { // Got an error!
      console.error(error);
    }
  });
}

/**
 * Get current restaurant from page URL.
 */
const fetchRestaurantFromURL = (callback) => {
  if (self.restaurant) { // restaurant already fetched!
    callback(null, self.restaurant)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    let error = 'No restaurant id in URL';
    callback(error, null);
  } else {
    DBHelper.fetchRestaurantById(id, (error, restaurant) => {
      self.restaurant = restaurant;
      if (!restaurant) {
        console.error(error);
        return;
      }

      callback(null, restaurant)
    });
  }
}

/**
 * Get current restaurant reviews from page URL.
 */
const fetchRestaurantReviewsFromURL = (callback) => {
  if (self.reviews) { // reviews already fetched!
    callback(null, self.reviews)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    let error = 'No restaurant id in URL';
    callback(error, null);
  } else {
    DBHelper.fetchRestaurantReviewsByID(id, (error, reviews) => {
      self.reviews = reviews;
      if (!reviews) {
        console.error(error);
        return;
      }

      callback(null, reviews)
    });
  }
}


/**
 * Create restaurant HTML and add it to the webpage
 */
const fillRestaurantHTML = (restaurant = self.restaurant) => {
  const name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;
  let is_favorite = restaurant.is_favorite || "false";
  const star = document.getElementById('star');
  if (is_favorite.toString() != 'true') {
    star.style.fill = "#f3f3f3";
  }

  const address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;

  const picture = document.getElementById('restaurant-img');

  const source360 = document.createElement('source');
  source360.setAttribute('media', '(max-width:360px)');
  source360.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_300.jpg.webp'));
  picture.appendChild(source360);

  const source460 = document.createElement('source');
  source460.setAttribute('media', '(max-width:460px)');
  source460.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_400.jpg.webp'));
  picture.appendChild(source460);

  const source300 = document.createElement('source');
  source300.setAttribute('media', '(max-width:300px)');
  source300.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_300.jpg.webp'));
  picture.appendChild(source300);

  const source400 = document.createElement('source');
  source400.setAttribute('media', '(max-width:400px)');
  source400.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_400.jpg.webp'));
  picture.appendChild(source400);

  const source600 = document.createElement('source');
  source600.setAttribute('media', '(max-width:600px)');
  source600.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_600.jpg.webp'));
  picture.appendChild(source600);

  const source800 = document.createElement('source');
  source800.setAttribute('media', '(min-width:601px)');
  source800.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant));
  picture.appendChild(source800);

  const image = document.createElement('img');
  image.className = 'restaurant-img';
  image.setAttribute('data-src', DBHelper.imageUrlForRestaurant(restaurant));
  image.alt = 'Restaurant '.concat(restaurant.name);
  picture.appendChild(image);

  const cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type;

  // fill operating hours
  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  }
}

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
const fillRestaurantHoursHTML = (operatingHours = self.restaurant.operating_hours) => {
  const hours = document.getElementById('restaurant-hours');
  for (let key in operatingHours) {
    const row = document.createElement('tr');

    const day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);

    const time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);

    hours.appendChild(row);
  }
}

/**
 * Create all reviews HTML and add them to the webpage.
 */
const fillReviewsHTML = (reviews = self.reviews) => {
  const container = document.getElementById('reviews-container');

  const title = document.createElement('h3');
  title.innerHTML = 'Reviews';
  container.appendChild(title);
  let tabindex = 9;
  if (!reviews) {
    const noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    container.appendChild(createAddReviewFormHTML(tabindex));
    return;
  }
  const ul = document.getElementById('reviews-list');

  reviews.forEach(review => {
    ul.appendChild(createReviewHTML(review, tabindex));
    tabindex++;
  });
  ul.appendChild(container.appendChild(createAddReviewFormHTML(tabindex)));
  container.appendChild(ul);


}

/**
 * Create review HTML and add it to the webpage.
 */
const createReviewHTML = (review, tabindex) => {
  const li = document.createElement('li');
  li.setAttribute('tabindex', tabindex);
  const topDiv = document.createElement('div');
  topDiv.className = 'review-header';
  const name = document.createElement('p');
  name.className = 'review-name';
  name.innerHTML = review.name;
  topDiv.appendChild(name);
  const date = document.createElement('p');
  date.className = 'review-date';

  let d = new Date(review.updatedAt);
  date.innerHTML = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  topDiv.appendChild(date);
  li.appendChild(topDiv);


  const ratingDiv = document.createElement('div');
  ratingDiv.className = 'review-rating-div';

  const rating = document.createElement('p');
  rating.className = 'review-rating';
  rating.innerHTML = `Rating: ${review.rating}`;
  ratingDiv.appendChild(rating);
  li.appendChild(ratingDiv);

  const comments = document.createElement('p');
  comments.className = 'review-comment';
  comments.innerHTML = review.comments;
  li.appendChild(comments);

  return li;
}

/**
 * Create add review form HTML  and add it to the webpage.
 */
const createAddReviewFormHTML = (tabindex) => {


  const container = document.createElement('li');
  container.className = 'li-review-comment';
  const form = document.createElement('form');
  form.className = "review-comment-form";
  form.id = 'reviewForm';
  const topDiv = document.createElement('div');
  topDiv.className = 'review-header';
  const nameParagraph = document.createElement('p');
  nameParagraph.className = 'review-name';
  const name = document.createElement('input');
  name.tabIndex = tabindex++;
  name.id = 'reviewerName';
  name.placeholder = 'Name';
  name.required = true;
  name.setAttribute('type', 'text');
  name.setAttribute('aria-label', 'Reviewer name');
  nameParagraph.appendChild(name);
  topDiv.appendChild(nameParagraph);
  const date = document.createElement('p');
  date.className = 'review-date';
  let d = new Date();
  date.innerHTML = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  topDiv.appendChild(date);
  form.appendChild(topDiv);

  const ratingDiv = document.createElement('div');
  ratingDiv.className = 'review-rating-div';
  const ratingParagraph = document.createElement('p');
  ratingParagraph.className = 'review-rating';
  const ratingLabel = document.createElement('label');
  const rating = document.createElement('input');
  ratingLabel.setAttribute('for', 'rating');
  var t = document.createTextNode("Rating: ");
  ratingLabel.appendChild(t);
  rating.id = 'rating';
  rating.setAttribute('type', 'number');
  rating.setAttribute('min', '1');
  rating.setAttribute('max', '5');
  rating.setAttribute('aria-label', 'Rating of the review');
  rating.required = true;
  rating.tabIndex = tabindex++;
  rating.style.width = '30px';

  ratingParagraph.appendChild(ratingLabel);
  ratingParagraph.appendChild(rating);
  ratingDiv.appendChild(ratingParagraph);

  form.appendChild(ratingDiv);

  const comments = document.createElement('textarea');
  comments.className = 'review-comment-textarea';
  comments.id = 'comments';
  comments.required = true;
  comments.setAttribute('aria-label', 'Comment');
  comments.tabIndex = tabindex++;

  form.appendChild(comments);

  const btn = document.createElement('button');
  btn.innerHTML = "Submit";
  btn.tabIndex = tabindex++;
  btn.className = 'review-comment-button';
  btn.addEventListener("click", insertNewReview, false);
  form.appendChild(btn);
  container.appendChild(form);
  return container;
}

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
const fillBreadcrumb = (restaurant = self.restaurant) => {
  const breadcrumb = document.getElementById('breadcrumb');
  const li = document.createElement('li');
  const ahref = document.createElement('a');
  ahref.setAttribute('href', '#');
  ahref.setAttribute('aria-current', 'page');
  ahref.className = 'current-page-link';
  ahref.innerHTML = restaurant.name;
  ahref.tabIndex = 3;
  li.appendChild(ahref);
  breadcrumb.appendChild(li);
}

/**
 * Get a parameter by name from page URL.
 */
const getParameterByName = (name, url) => {
  if (!url)
    url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
    results = regex.exec(url);
  if (!results)
    return null;
  if (!results[2])
    return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}


/**
 * Load IntersectionObserver to load images they are needed.
 */
const loadIntersectionObserver = () => {


  let images = document.querySelectorAll('source, img');
  let map = document.getElementById('map');

  if ('IntersectionObserver' in window) {
    // IntersectionObserver Supported
    let config = {
      root: null,
      rootMargin: '0px',
      threshold: 1.0
    };

    let observer = new IntersectionObserver(onChange, config);
    images.forEach(img => observer.observe(img));
    observer.observe(map)
    function onChange(changes, observer) {
      changes.forEach(change => {
        if (change.intersectionRatio > 0.5) {
          // Stop watching and load the image
          if (change.target === map) {
            console.log(change.intersectionRatio);
            loadMaps();
          }
          else {
            loadImage(change.target);
          }

          observer.unobserve(change.target);
        }
      });
    }

  } else {
    // IntersectionObserver NOT Supported
    images.forEach(image => loadImage(image));
  }
}

/**
 * Load image - populate src attribute from the dataset attribute.
 */
const loadImage = (image) => {
  image.classList.add('fade-in');
  if (image.dataset && image.dataset.src) {
    image.src = image.dataset.src;
  }

  if (image.dataset && image.dataset.srcset) {
    image.srcset = image.dataset.srcset;
  }
}

/**
 * Load google maps.
 */
const loadMaps = () => {

  const scriptTag = document.createElement("script");
  scriptTag.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyBFeL_3upfjewT5kik74_YRMizmEuoBFnU&libraries=places&callback=initMap";
  document.getElementsByTagName("head")[0].appendChild(scriptTag);
}

/**
 * On DOM loaded.
 */

document.addEventListener('DOMContentLoaded', (event) => {
  let media = window.matchMedia("(max-width: 744px)");
  if (media.matches) {
    console.log('matched');
    injectMapsToDom(true);
  } else {
    console.log('not matched');
    injectMapsToDom(false);
  }
  media.addListener(matchMedia);

  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      fillRestaurantHTML();
      fetchRestaurantReviewsFromURL((error, reviews) => {
        if (error) { // Got an error!
          console.error(error);
        } else {
          fillReviewsHTML(reviews);
        }
      });
      loadIntersectionObserver();
      fillBreadcrumb();
    }
  });

});

/**
 * Check if map area is about to be visible and if it is - inject the map to the DOM.
 */
const matchMedia = (elem) => {
  if (elem.matches) {
    console.log('matched');
    injectMapsToDom(true);
  }
  else {
    console.log('not matched');
    injectMapsToDom(false);
  }

}

/**
 * Inject the map to the DOM
 */
const injectMapsToDom = (placeInTheBottom) => {

  let main = document.getElementById("maincontent");
  let topContainer = document.getElementById("top-container");
  let mapContainer = document.getElementById("map-container");
  if (placeInTheBottom) {
    topContainer.removeChild(mapContainer);
    main.appendChild(mapContainer);
  }
  else {
    if (mapContainer.parentNode === main) {
      main.removeChild(mapContainer);
      topContainer.appendChild(mapContainer);
    }
  }
}

/**
 * Insert new review for the restaurant
 */
const insertNewReview = (event) => {
  event.preventDefault();
  const reviewForm = document.getElementById('reviewForm');
  if (!reviewForm.checkValidity()) {
    const tmpSubmit = document.createElement('button')
    reviewForm.appendChild(tmpSubmit)
    tmpSubmit.click()
    reviewForm.removeChild(tmpSubmit)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    let error = 'No restaurant id in URL';
    console.log(error);
  } else {
    let name = document.getElementById('reviewerName').value;
    let rating = document.getElementById('rating').value;
    let comments = document.getElementById('comments').value
    DBHelper.insertUpdateReviewIndexDB(id, name, rating, comments).then(async (results) => {

      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        let reg = await navigator.serviceWorker.ready;
       
        try {
          await reg.sync.register('post-reviews');
          console.log("post-reviews sync registerd");
          window.location.href = "/";
        }
        catch (error) {

          console.log(`system was unable to register for a sync, this could be an OS-level restriction. ${error}`);
          await DBHelper.postNewReviewToServer();
          window.location.href = "/";
        }

      } else {
        // serviceworker/sync not supported
        console.log(`serviceworker/sync not supported`);
        await DBHelper.postNewReviewToServer();
        this.boris();
        window.location.href = "/";
      }
    });
  }
}

/**
 * Mark/Unmark favorite restaurant
 */
const favoriteRestaurant = async () => {
  const star = document.getElementById('star');
  if (restaurant.is_favorite.toString() == 'true')
    restaurant.is_favorite = 'false';
  else {
    restaurant.is_favorite = 'true'
  }

  restaurant.isDirty = 'true';

  if (await DBHelper.favoriteRestaraunt(restaurant)) {
    if (restaurant.is_favorite.toString() == 'true') {
      star.style.fill = "#EFCE4A";
    }
    else {
      star.style.fill = "#F3F3F3";
    }
  }
}




/**
 * Service worker
 */

(() => {
  return new Promise((resolve, reject) => {
    // if (navigator.serviceWorker) {
    if ('serviceWorker' in navigator) {
      createModalWindowsHtml();

      window.addEventListener('online', function (event) {
        console.log(`online event fired`);
        DBHelper.postNewReviewToServer();
        DBHelper.updateRestaurantFavoriteOnServer();
      });

      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          // if ('SyncManager' in window) {
          //   navigator.serviceWorker.ready.then(function (reg) {
          //     return reg.sync.register('post-reviews');
          //   }).catch(function (error) {
          //     // system was unable to register for a sync,
          //     // this could be an OS-level restriction
          //     console.log(`system was unable to register for a sync, this could be an OS-level restriction. ${error}`);
          //     //  postDataFromThePage();
          //   });
          // } else {
          //   // serviceworker/sync not supported
          //   console.log(`serviceworker/sync not supported`);
          //   //postDataFromThePage();
          // }

          if (!navigator.serviceWorker.controller) {
            return;
          }
          if (reg.waiting) {
            console.log('Waiting');
            updateReady(reg.waiting);
            return;
          }

          if (reg.installing) {
            console.log('Installing');
            trackInstalling(reg.installing);

            return;
          }

          reg.addEventListener('updatefound', function () {
            console.log('Update found');
            trackInstalling(reg.installing);

          });
          console.log('ServiceWorker successfuly registerd: ', reg.scope);
        });
      }, function (err) {
        console.log('ServiceWorker registration failed: ', err);
      });

      // Ensure refresh is only called once.
      // This works around a bug in "force update on reload".
      var refreshing;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        console.log('controllerchange');
        if (refreshing) return;
        window.location.reload();
        refreshing = true;
      });
    }
  });
})();

function trackInstalling(worker) {
  worker.addEventListener('statechange', function () {
    if (worker.state == 'installed') {
      updateReady(worker);
    }
  });
}

function updateReady(worker) {
  let modalWindow = document.getElementById('openModal');
  let refreshBtn = document.getElementById('btnRefresh');
  let dialog = new Dialog(modalWindow);
  dialog.addEventListeners('.modalWindow', '.cancel');
  dialog.open();

  refreshBtn.addEventListener('click', function () {
    worker.postMessage({ action: 'skipWaiting' });
    refreshBtn.removeEventListener('click', worker.postMessage({ action: 'skipWaiting' }));
  });
}

function createModalWindowsHtml() {
  //     <div id="openModal" class="modalWindow" role="alertdialog" aria-labelledby="modalHeader" tabindex="-1">
  //     <div>
  //       <div class="modalHeader">
  //         <h2 id="modalHeader">New version available</h2>
  //         <div class="modalButtons">
  //           <div>
  //             <button role="button" aria-label="Refresh application" title="Refresh" id="btnRefresh" class="ok" tabindex="-1">Refresh?</button>
  //           </div>
  //           <div>
  //             <button role="button" aria-label="Dismiss this alert" title="Dismiss" id="btnDismiss" class="cancel" tabindex="-1">Dismiss</button>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   </div>

  let body = document.getElementsByTagName('body').item(0);
  let modalWindow = document.createElement('div');
  modalWindow.className = 'modalWindow';
  modalWindow.id = 'openModal';
  modalWindow.setAttribute('role', 'alertdialog');
  modalWindow.setAttribute('aria-labelledby', 'modalHeader');
  modalWindow.setAttribute('tabindex', '-1');

  let modalWindowChildDiv = document.createElement('div');
  let modalHeader = document.createElement('div');
  modalHeader.className = 'modalHeader';
  let h2 = document.createElement('h2');
  h2.id = modalHeader;
  h2.innerHTML = "New version available";
  let modalButtons = document.createElement('div');
  modalButtons.className = 'modalButtons';

  let modalButtonsFirstChildDiv = document.createElement('div');
  let btnRefresh = document.createElement('button');
  btnRefresh.id = 'btnRefresh';
  btnRefresh.className = 'ok';
  btnRefresh.setAttribute('role', 'button');
  btnRefresh.setAttribute('aria-label', 'Refresh application');
  btnRefresh.setAttribute('title', 'Refresh');
  btnRefresh.setAttribute('tabindex', '-1');
  btnRefresh.innerHTML = 'Refresh?';

  modalButtonsFirstChildDiv.appendChild(btnRefresh);

  let modalButtonsSecondChildDiv = document.createElement('div');
  let btnDismiss = document.createElement('button');
  btnDismiss.id = 'btnDismiss';
  btnDismiss.className = 'cancel';
  btnDismiss.setAttribute('role', 'button');
  btnDismiss.setAttribute('aria-label', 'Dismiss this alert');
  btnDismiss.setAttribute('title', 'Dismiss');
  btnDismiss.setAttribute('tabindex', '-1');
  btnDismiss.innerHTML = 'Dismiss';

  modalButtonsSecondChildDiv.appendChild(btnDismiss);

  modalButtons.appendChild(modalButtonsFirstChildDiv);
  modalButtons.appendChild(modalButtonsSecondChildDiv);
  modalHeader.appendChild(h2);
  modalHeader.appendChild(modalButtons);
  modalWindowChildDiv.appendChild(modalHeader);
  modalWindow.appendChild(modalWindowChildDiv);
  body.appendChild(modalWindow);
}