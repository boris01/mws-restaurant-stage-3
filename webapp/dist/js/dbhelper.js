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

