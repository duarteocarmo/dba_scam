var isSubmitButtonClicked;
var isPasteDetected;

function removeCardIdFromSelect(cardId) {
	$('#CardSelectList option').each(function() {
		if ($(this).val() === cardId) {
			$(this).remove();
			if (typeof SelectCard === 'function') {
				SelectCard();
			}
		}
	});

	if ($('#CardSelectList option').length === 1) {
		$('#divAuthorizedCardList').hide();
	}
}

function removeCardRequest(cardId, sessionId, sessionSignature, callback, options) {
	var data = {
		card_id: cardId,
		all: 1,
		session_id: sessionId,
		signature: sessionSignature
	};
	if (!cardId || cardId === 'FreePay') {
		return false;
	}
	if (typeof (options) !== 'undefined') {
		if (options.hasOwnProperty('ts')) {
			data.ts = options.ts;
		}
	}
	return $.ajax({
		url: '/api/in/card/delete',
		type: 'POST',
		data: data,
		dataType: 'json'
	}).done(function(response) {
		switch (response.status) {
			case 'OK':
				window.parent.postMessage(JSON.stringify({
					type: 'billing',
					action: 'removeAddedCard',
					action_params: cardId
				}), '*');

				typeof callback === 'function' ? callback(cardId) : removeCardIdFromSelect(cardId);
				break;
			default:
				break;
		}
	});
}

function putSubmitButtonClickPixel() {
	cpg_context['rb'].putPixel('form_submit-button-click-all');
	if (!isSubmitButtonClicked) {
		cpg_context['rb'].putPixel('form_submit-button-click-first');
		isSubmitButtonClicked = true;
	}
}

function putCopyPasteFillPixel() {
	if (isPasteDetected) {
		cpg_context['rb'].putPixel('form_fill-copypaste-send');
	}
}

function sendFrameResizeMessage() {
	setTimeout(function() {
		window.parent.postMessage(JSON.stringify({
			type: 'billing',
			action: 'resizeFrame',
			action_params: {
				height: document.body.getBoundingClientRect().height
			}
		}), '*');
	}, 0);
}

function hidePayCardWrapper() {
	var payCardWrapper = document.getElementsByClassName('js-pay-card-wrapper')[0];

	if (payCardWrapper) {
		payCardWrapper.style.display = 'none';
	}
}

function showPayCardWrapper() {
	var payCardWrapper = document.getElementsByClassName('js-pay-card-wrapper')[0];
	var typeDisplay = '';

	if (payCardWrapper) {
		typeDisplay = typeof payCardWrapper.dataset.typeDisplay !== 'undefined' ? typeDisplay : 'block';
		payCardWrapper.style.display = typeDisplay;
	}
}