
var restaurants,
  neighborhoods,
  cuisines;
var map;
var markers = [];


/**
 * Fetch all neighborhoods and set their HTML.
 */
const fetchNeighborhoods = () => {
  DBHelper.fetchNeighborhoods((error, neighborhoods) => {
    if (error) { // Got an error
      console.error(error);
    } else {
      self.neighborhoods = neighborhoods;
      fillNeighborhoodsHTML();
    }
  });
}

/**
 * Set neighborhoods HTML.
 */
const fillNeighborhoodsHTML = (neighborhoods = self.neighborhoods) => {
  const select = document.getElementById('neighborhoods-select');
  neighborhoods.forEach(neighborhood => {
    const option = document.createElement('option');
    option.innerHTML = neighborhood;
    option.value = neighborhood;
    select.append(option);
  });
}

/**
 * Fetch all cuisines and set their HTML.
 */
const fetchCuisines = () => {
  DBHelper.fetchCuisines((error, cuisines) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.cuisines = cuisines;
      fillCuisinesHTML();
    }
  });
}

/**
 * Set cuisines HTML.
 */
const fillCuisinesHTML = (cuisines = self.cuisines) => {
  const select = document.getElementById('cuisines-select');

  cuisines.forEach(cuisine => {
    const option = document.createElement('option');
    option.innerHTML = cuisine;
    option.value = cuisine;
    select.append(option);
  });
}



/**
 * Update page and map for current restaurants.
 */
const updateRestaurants = () => {
  const cSelect = document.getElementById('cuisines-select');
  const nSelect = document.getElementById('neighborhoods-select');

  const cIndex = cSelect.selectedIndex;
  const nIndex = nSelect.selectedIndex;

  const cuisine = cSelect[cIndex].value;
  const neighborhood = nSelect[nIndex].value;

  DBHelper.fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, (error, restaurants) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      resetRestaurants(restaurants);
      fillRestaurantsHTML();
    }
  })
}

/**
 * Clear current restaurants, their HTML and remove their map markers.
 */
const resetRestaurants = (restaurants) => {
  // Remove all restaurants
  self.restaurants = [];
  const ul = document.getElementById('restaurants-list');
  ul.innerHTML = '';

  // Remove all map markers
  if (self.markers)
    self.markers.forEach(m => m.setMap(null));
  self.markers = [];
  self.restaurants = restaurants;
}

/**
 * Create all restaurants HTML and add them to the webpage.
 */
const fillRestaurantsHTML = (restaurants = self.restaurants) => {
  const ul = document.getElementById('restaurants-list');
  restaurants.forEach(restaurant => {
    ul.append(createRestaurantHTML(restaurant));
  });
  loadIntersectionObserver();
}

/**
 * Create restaurant HTML.
 */
const createRestaurantHTML = (restaurant) => {
  const li = document.createElement('li');

  const picture = document.createElement('picture');
  picture.className = 'restaurant-img';
  picture.setAttribute('role', 'img');
  picture.setAttribute('aria-label', 'restaurant '.concat(restaurant.name));

  const source360 = document.createElement('source');
  source360.setAttribute('media', '(max-width:360px)');
  source360.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_300.jpg.webp'));
  picture.appendChild(source360);

  const source460 = document.createElement('source');
  source460.setAttribute('media', '(max-width:460px)');
  source460.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_400.jpg.webp'));
  picture.appendChild(source460);

  const source800 = document.createElement('source');
  source800.setAttribute('media', '(max-width:744px)');
  source800.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant));
  picture.appendChild(source800);

  const source400 = document.createElement('source');
  source400.setAttribute('media', '(min-width:745px) and (max-width:1048px)');
  source400.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_400.jpg.webp'));
  picture.appendChild(source400);

  const source300 = document.createElement('source');
  source300.setAttribute('media', '(min-width:1049px)');
  source300.setAttribute('data-srcset', DBHelper.imageUrlForRestaurant(restaurant).replace('.jpg.webp', '_300.jpg.webp'));
  picture.appendChild(source300);

  const image = document.createElement('img');
  image.className = 'restaurant-img';
  //image.src = DBHelper.imageUrlForRestaurant(restaurant);
  image.setAttribute('data-src', DBHelper.imageUrlForRestaurant(restaurant));
  image.setAttribute('alt', 'restaurant '.concat(restaurant.name));
  picture.appendChild(image);
  li.append(picture);

  const name = document.createElement('h2');
  name.innerHTML = restaurant.name;
  li.append(name);

  const neighborhood = document.createElement('p');
  neighborhood.innerHTML = restaurant.neighborhood;
  li.append(neighborhood);

  const address = document.createElement('p');
  address.innerHTML = restaurant.address;
  li.append(address);

  const linkDiv = document.createElement('div');
  linkDiv.id = "linkDiv";

  const more = document.createElement('a');
  more.innerHTML = 'View Details';
  more.href = DBHelper.urlForRestaurant(restaurant);
  more.setAttribute('role', 'button');
  more.setAttribute('aria-label', 'View more details about restaurant '.concat(restaurant.name));

  linkDiv.appendChild(more);
  const svgContainer = document.createElement('span');
  svgContainer.className = "svgContainer";
  let starColor = "#EFCE4A";
  let is_favorite = restaurant.is_favorite || "false";
  if (is_favorite.toString() == 'true') {
    starColor = "#EFCE4A";
  }
  else {
    starColor = "#F3F3F3";
  }
  svgContainer.innerHTML = `<svg version="1.1"  viewBox="0 0 60 60" width="30" height="30" class="star" role="button" aria-label="favorite" style="flex:auto; align-self:center;">
  <polygon id="star-${restaurant.id}" style="fill:${starColor};stroke:black" points="26.934,1.318 35.256,18.182 53.867,20.887 40.4,34.013 43.579,52.549 26.934,43.798 
  10.288,52.549 13.467,34.013 0,20.887 18.611,18.182 "></polygon></svg>`;
  svgContainer.addEventListener('click', (event) => {
    favoriteMainRestaurant(restaurant);
  });
  linkDiv.appendChild(svgContainer);
  li.append(linkDiv);

  return li
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
      threshold: 0.5
    };

    let observer = new IntersectionObserver(onChange, config);
    images.forEach(img => observer.observe(img));
    observer.observe(map)
    function onChange(changes, observer) {
      changes.forEach(change => {
        if (change.intersectionRatio > 0) {
          // Stop watching and load the image
          if (change.target === map) {
            console.log(change.target);
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
 * Fetch neighborhoods and cuisines as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', (event) => {
  fetchNeighborhoods();
  fetchCuisines();
  updateRestaurants();

  //setTimeout(loadMaps(), 200);
});


/**
 * Initialize Google map, called from HTML.
 */

window.initMap = () => {
  let loc = {
    lat: 40.722216,
    lng: -73.987501
  };
  self.map = new google.maps.Map(document.getElementById('map'), {
    zoom: 12,
    center: loc,
    scrollwheel: false
  });
  //updateRestaurants();
  addMarkersToMap();
}

/**
 * Add markers for current restaurants to the map.
 */
const addMarkersToMap = (restaurants = self.restaurants) => {
  restaurants.forEach(restaurant => {
    // Add marker to the map
    const marker = DBHelper.mapMarkerForRestaurant(restaurant, self.map);
    google.maps.event.addListener(marker, 'click', () => {
      window.location.href = marker.url
    });
    self.markers.push(marker);
  });
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
 * Mark/Unmark favorite restaurant
 */
const favoriteMainRestaurant = async (restaurant) => {
  const star = document.getElementById(`star-${restaurant.id}`);
  let is_favorite = restaurant.is_favorite || "false";
  if (is_favorite.toString() == 'true')
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