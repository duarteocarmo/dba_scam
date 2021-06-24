var restartPoll;
var hideWaiter;

function createCpgStandardWaiter(cpg_context, onErrorCardLimit) {
	var waiter = createCpgWaiter();
	var $cpgForm = $('.js-hidden-form');
	var $cardSelect = $('.js-card-selector');

	var defaultErrorMessage = (typeof cpg_context.locale !== 'undefined' && cpg_context.locale.waiterDefaultErrorMessage) ?
		cpg_context.locale.waiterDefaultErrorMessage :
		$('.js-credit-card .js-error-message').text();

	var defaultErrorMessageCVV = (typeof cpg_context.locale !== 'undefined' && cpg_context.locale.waiterDefaultCvvErrorMessage) ?
		cpg_context.locale.waiterDefaultCvvErrorMessage :
		'Пожалуйста, введите CVV - последние три цифры на полосе для подписи';

	var payCard = window.payCard;
	var clearCardFormErrorsList = [
		'ERR_NOT_ENOUGH_MONEY',
		'ERR_FRAUD',
		'ERR_AUTHENTICATION_FAILED',
		'ERR_CARD_AMOUNT',
		'ERR_AUTHORIZATION',
		'ERR_CARD_EXPIRED',
		'ERR_SECURITY',
		'ERR_VTERM_DISABLED',
		'ERR_ORDER_FETCH',
		'ERR_REJECTED_SUPPORT',
		'ERR_CARD_PARAM_PAN',
		'ERR_ARGUMENTS',
		'ERR_CARD_LOST',
		'ERR_CARD_LIMIT_3DS',
		'ERR_CARD_LIMIT_ONLINE_3DS'
	];

	var goToBackurlErrorsList = typeof cpg_context['is_redirect_to_backurl_on_error'] !== 'undefined' && cpg_context['is_redirect_to_backurl_on_error'] ? ['ERR_AUTHENTICATION_FAILED'] : [];

	// Custom settings for cpgWaiter
	waiter.pollLimit = 30;
	waiter.pollInterval = 2000;

	if (typeof onErrorCardLimit === 'undefined') {
		var onErrorCardLimit = function(error) {
			var selectedCardId = payCard.getSelectedCardId();

			if (cpg_context.json_cards[selectedCardId]) {
				cpg_context.json_cards[selectedCardId].nocvv = '0';
				$cardSelect.trigger('change');
				payCard.showCvvError();
				payCard.setErrorMessage(defaultErrorMessageCVV);
			}
			else {
				payCard.setErrorMessage(error ? error.descr : defaultErrorMessage);
			}
			payCard.showError();
		};
	}

	function selectNewCard() {
		payCard.setSelectedCardByID('FreePay');
	}

	function removeSelectedAddedCard() {
		var selectedCardId = payCard.getSelectedCardId();

		if (payCard.getSelectedCardByID[selectedCardId]) {
			payCard.removeAddedCardById(selectedCardId);
		}
	}

	waiter.onParamsError = function(errors, remove) {
		if (remove) {
			//	TODO: $('.js-hidden-form').find('label').removeClass('cpg_error');
			return;
		}

		cpg_context['rb'].putPixel('form_server-validation-error');

		if (errors.length) {
			if (errors.indexOf('pan') !== -1) {
				payCard.showNumberError();
			}
			if (errors.indexOf('exp_date') !== -1) {
				payCard.showExpiryError();
			}
			if (errors.indexOf('cvv') !== -1) {
				payCard.showCvvError();
			}
			if (errors.indexOf('cvv2') !== -1) {
				payCard.showCvvError();
			}
			if (errors.indexOf('cardholder') !== -1) {
				payCard.showCardholderError();
			}
			if (errors.indexOf('amount') !== -1 && typeof payCard.showAmountError === 'function') {
				payCard.showAmountError();
			}
		}

		if (typeof showPayCardWrapper === 'function') {
			showPayCardWrapper();
		}
	};

	waiter.onSuccess = function(data) {
		var actionParams = {
			payment_info: typeof data.payment_info !== 'undefined' ? data.payment_info : {}
		};

		if (Object.prototype.hasOwnProperty.call(data, 'card_id')) {
			actionParams.card_id = data.card_id;
		}
		cpg_context['rb'].putPixel('result_success');
		window.parent.postMessage(JSON.stringify({
			type: 'billing',
			action: 'paySuccess',
			action_params: actionParams
		}), '*');
		if (data.url) {
			if (typeof waiter.onRedirect === 'function') {
				waiter.onRedirect(data.url);
			}
			else {
				setTimeout(function() {
					window.location.href = data.url;
				}, 200);
			}
		}
	};

	waiter.onError = function(data) {
		cpg_context['rb'].putPixel('result_fail');

		try {
			window.parent.postMessage(JSON.stringify({
				type: 'billing',
				action: 'payError',
				action_params: data.error
			}), '*');

			if ($.inArray(data.error.code, goToBackurlErrorsList) !== -1) {
				// если передан параметр backurl - редиректим на него
				console.log('need to redirect to backurl', !!data.backurl);
				if (data.backurl) {
					if (typeof waiter.onRedirect === 'function') {
						waiter.onRedirect(data.backurl);
					}
					else {
						setTimeout(function() {
							window.location.href = data.backurl;
						}, 200);
					}
				}
			}

			if (data.error.code === 'ERR_CARD_LIMIT_CVV' || data.error.code === 'ERR_CARD_LIMIT_ONLINE_CVV') {
				// повторить сабмит для создания новой транзакции (с 3ds)
				setTimeout(function() {
					waiter.submit($cpgForm, $cpgForm.find('input, select').filter(function() {
						return this.value && this.value !== 'FreePay';
					}).serialize());
				});
				return;
			}

			if (data.error.code === 'ERR_CARD_LIMIT' || data.error.code === 'ERR_CARD_LIMIT_ONLINE' || data.error.code === 'ERR_PAY_NOCVV') {
				// потребовать ввод CVV для выбранной карты
				onErrorCardLimit(data.error);
				return;
			}

			if ($.inArray(data.error.code, clearCardFormErrorsList) !== -1) {
				// временно удалить привязку, выбрать новую карту, очистить форму
				removeSelectedAddedCard();
				selectNewCard();
			}

			payCard.setErrorMessage(data.error.descr);
		} catch (e) {
			payCard.setErrorMessage(defaultErrorMessage);
		}

		payCard.showError();
	};

	waiter.onTimeout = function() {
		var timeoutPopup = document.getElementsByClassName('js-cc-timeout-popup');
		window.parent.postMessage('{"type": "billing", "action": "timeoutError"}', '*');
		cpg_context['rb'].putPixel('status_fail');
		if (timeoutPopup.length) {
			payCard.showTimeoutError();
		}
		else {
			payCard.showError();
		}
	};

	waiter.onServerError = function(data, textStatus) {
		cpg_context['rb'].putPixel('ajax_' + textStatus);
		payCard.showError();
	};

	waiter.onConfirm = function(data) {
		cpg_context['rb'].putPixel('3ds_confirm');
		/** START TMP-11413
		 window.parent.postMessage(JSON.stringify({
			type:          'billing',
			action:        'payConfirm',
			action_params: data.confirm_data
		}), '*');
		 */
		waiter.on3DS(data.confirm_data);
		/**
		 * END TMP-11413
		 */
		setTimeout(function() {
			waiter.showClock();
		});
	};

	waiter.on3DS = function(data) {
		cpg_context['rb'].putPixel('3ds_start');
		setTimeout(function() {
			waiter.showClock();
		}, 0);
		setTimeout(function() {
			waiter.submit3DS(data);
			document.body.style.display = 'none';
			window.parent.postMessage('{"type": "billing", "action": "3dsPage"}', '*');
		}, 300);
	};

	waiter.onShow = function() {
		window.parent.postMessage('{"type": "billing", "action": "waiterStart"}', '*');

		if (typeof payCard.onShowWaiter === 'function') {
			payCard.onShowWaiter();
		}
		else {
			payCard.disableFormFields();
			payCard.disableSubmitButton();
			payCard.setSubmitButtonValue('Обработка');
		}
	};

	waiter.onHide = function() {
		if (typeof payCard.onHideWaiter === 'function') {
			payCard.onHideWaiter();
		}
		else {
			payCard.enableFormFields();
			payCard.enableSubmitButton();
			payCard.restoreSubmitButtonValue();
		}
	};

	waiter.onSubmitSuccess = function(data) {
		restartPoll = function() {
			waiter.showClock();
			waiter.resetPollCount();
			waiter.startPoll(data.url);
		};
		waiter.startPoll(data.url, data.params);
	};

	hideWaiter = function() {
		waiter.finish();
	};

	return waiter;
}

function assignFormHandlers(cpg_context, waiter) {
	var $cpgForm = $('.js-hidden-form');

	var payHandler = function(e) {
		cpg_context['rb'].putPixel('form_send');

		waiter.submit($cpgForm, $cpgForm.find('input, select').filter(function() {
			return this.value && this.value !== 'FreePay';
		}).serialize());
		return false;
	};

	$cpgForm.on('submit', payHandler);
}
