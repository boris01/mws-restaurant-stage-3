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



