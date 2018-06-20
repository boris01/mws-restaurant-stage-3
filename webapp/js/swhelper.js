
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