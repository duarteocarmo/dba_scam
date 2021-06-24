/*
Usage
~~~~~

<html>
<head>
<!-- подключаем Jquery -->
<script type="text/javascript" src="js/jquery.js"></script>
<!-- подключаем библиотеку Waiter'а -->
<script type="text/javascript" src="js/cpg_waiter.js"></script>
</head>
<body>
<!-- настраиваем вейтер под наши нужды -->
<script>
var waiter = new CpgWaiter({
	onParamsError: function(errors) {},
	onServerError: function(data) {},
	onRedirect: function(url) {},
	onTimeout: function() {},
	onSuccess: function(data) {},
	submitUrl: 'http://127.0.0.1:3000/waiter/test',
	clockElement: 'waiter'
});
</script>
<!-- создаем форму -->
<form onsubmit="waiter.submit(this); return false;">
<!-- обязательно должна быть кнопка с типом submit -->
<input type="submit" />
</form>
<!-- создаем "часики" -->
<div id="waiter" style="display: none; border: solid 1px black;">wait</div>
</body>
</html>
*/

/*
Принцип работы
~~~~~~~~~~~~~~
При вызове метода submit вейтер отображает часики, блокирует кнопку submit, собирает данные формы (если не передан явно аргумент params) и отправляет их на сервер по адресу, указанному в submitUrl. В качестве результата от сервера ожидается JSON-объект с ключами:

* status - код результата. Может принимать значения: OK, ERR_ARGUMENTS, любой другой произвольный код ошибки.
* redirect - редирект на другой адрес. Обрабатывается вейтером только при status = OK
* message - описание ошибки. Может быть полезно коллбэку, который обрабатывает ошибки сервера (onServerError)
* errors - массив полей с ошибками. Обрабатывается вейтером при status = ERR_ARGUMENTS
* poll - URL для последующего запуска опроса. Обрабатывается вейтером только при status = OK и если не задан ключ redirect
* params - параметры запроса, которые в дальнейшем будут передаваться при поллинге. Если ключ не задан, то используются оригинальные параметры формы

При опросе сервера вейтер ожидает JSON-объект с ключами:

* status - код результата. Может принимать значения: OK_CONTINUE (продолжить опрос), OK_FINISH (финальный статус, прекратить опрос), ERR_ARGUMENTS (неправильные аргументы запроса, прекратить опрос), любой другой произвольный код ошибки
* redirect - редирект на другой адрес. Обрабатывается вейтером при получении статуса OK_FINISH. В случае, если сервер не передал ключ redirect, то будет вызван коллбэк onSuccess
* message - сообщение об ошибке

При любых ошибках вейтер скрывает часики и разблокирует кнопку submit.
*/
function CpgWaiter(settings) {
	/* Коллбэки */

	/* onParamsError - вызывается в случае, если вейтер получил от сервера ошибку ERR_ARGUMENTS.
	На вход функция получает массив полей с ошибками */
	this.onParamsError = settings.onParamsError;
	/* onServerError - ошибка сервера. В случае, если сервер вернул код ошибки,
	то на вход функции подается весь ответ сервера (json-объект, содержащий код
	и сообщение об ошибке). Если была ошибка взаимодействия с сервером или ответ
	не является валидным JSON, то коллбэк вызывается с параметрами null, textStatus (тип ошибки) */
	this.onServerError = settings.onServerError;
	/* onTimeout - коллбэк вызывается, когда исчерпан лимит опроса сервера */
	this.onTimeout = settings.onTimeout;
	/* onConfirm - коллэк вызывается, когда необходимо подтверждение транзакции пользователем до перехода на 3ds.
	На вход получает ответ сервера (JSON-объект) */
	this.onConfirm = settings.onConfirm;
	/* onSuccess - коллбэк вызывается, если в результате опроса получен финальный статус,
	но он не является редиректом. На вход коллбэк получает ответ сервера (JSON-объект) */
	this.onSuccess = settings.onSuccess;
	this.onError = settings.onError;
	/* onShow - опциональный коллбэк, который может вызываться перед показом "часиков" */
	this.onShow = settings.onShow;
	/* onHide - опциональный коллбэк, который может вызываться перед скрытием "часиков" */
	this.onHide = settings.onHide;
	/* onRedirect - если задан этот коллбэк, то он вызывается вместо редиректа при
	получении в ответе сервера команды redirect. На вход фукнция получает url для редиректа */
	this.onRedirect = settings.onRedirect;

	/* onBackUrlRedirect - если задан этот коллбэк, то он вызывается при получении ошибки сабмита формы, если ошибка
	не содержит адреса редиректа. Предполагается, что должна перенаправлять на back_url c выставленным флагом ошибки.
	На вход коллбэк получает ответ сервера (JSON-объект). */
	this.onBackUrlRedirect = settings.onBackUrlRedirect;

	/* requestMethod - метод запроса. По умолчанию POST */
	this.requestMethod = settings.requestMethod || 'POST';
	/* clockElement - id элемента, демонстрирующего "часики". По умолчанию "waiter" */
	this.clockElement = settings.clockElement || 'cpg_waiter';
	this.submitElement = settings.submitElement || 'cpg_submit';
	/* pollLimit - лимит попыток опроса сервера. По умолчанию 20 */
	this.pollLimit = settings.pollLimit || 20;
	/* pollInterval - интервал между попытками опроса сервера (в миллисекундах). По умолчанию - 1000 */
	this.pollInterval = settings.pollInterval || 1000;

	/* submitUrl - адрес для отправки формы */
	this.submitUrl = settings.submitUrl;
	/* pollUrl - опционально можно задать url для опроса на случай, если он не вернется
	в результате отправки формы */
	this.pollUrl = settings.pollUrl;

	/* fakeAjax - если true и подключен плагин jquery.ajax.fake - имитация запроса на сервер */
	this.fakeAjax = settings.fakeAjax;

	var pollTimer = 0;
	var pollCount = 0;
	var sourceForm = undefined;
	var ajaxParams = undefined;

	/* Отправка формы на сервер. Функция должна принимать на вход обязательный параметр - объект формы. Также допускается явная передача заранее собранных параметров. Если аргумент params не задан, то данные формы будут собраны с помощью метода jQuery serialize
	 */
	this.submit = function(form, params) {
		if (! params) {
			params = $(form).serialize();
		}

		/* почистим ошибки формы */
		if (this.onParamsError) {
			this.onParamsError(null, 1);
		}

		ajaxParams = params;
		sourceForm = form;

		pollCount = 0; /* обнуляем число попыток опроса */
		this.showClock(); /* показываем часики */
		var waiter = this;
		$.ajax({
			url: waiter.submitUrl,
			type: waiter.requestMethod,
			fake: waiter.fakeAjax,
			dataType: 'json',
			data: params
		}).done(function(data) {
			if (data.error) {
				if (data.error.error_fields) {
					if (waiter.onParamsError) {
						waiter.onParamsError(data.error.error_fields);
					}
					waiter.finish();
				} else if (data.url) {
					if (waiter.onRedirect) {
						waiter.onRedirect(data.url);
					} else {
						redirect(data.url);
					}
				} else {
					if (waiter.onBackUrlRedirect) {
						waiter.onBackUrlRedirect(data);
					}
					waiter.finish();
				}
			} else {
				if (waiter.onSubmitSuccess) {
					waiter.onSubmitSuccess(data);
				} else {
					waiter.startPoll(data.url, data.params);
				}
			}
		}).fail(function(jqXHR, textStatus, err) {
			/* Не достучались до сервера или не получили валидный JSON - вызываем коллбэк */
			if (waiter.onServerError) {
				waiter.onServerError(null, textStatus);
			}
			waiter.finish();
		});
	};

	this.resetPollCount = function() {
		pollCount = 0;
	}

	this.showClock = function() {
		if (this.onShow) {
			this.onShow();
		}
		$("#" + this.submitElement).prop('disabled', true);
		$('#' + this.clockElement).show();
	};

	this.finish = function() {
		if (this.onHide) {
			this.onHide();
		}
		$('#' + this.clockElement).hide();
		$("#" + this.submitElement).prop('disabled', false);
	};

	var redirect = function(url) {
		window.location.href = url;
	};

	this.startPoll = function(url, params) {
		/* С сервера могли прийти кастомные параметры для дальнешей отправки при опросе - сохраняем их */
		if (params) {
			ajaxParams = params;
		}
		clearTimeout(pollTimer);
		var waiter = this;
		pollCount++;
		if (pollCount > this.pollLimit) {
			if (this.onTimeout) {
				this.onTimeout();
			}
			return this.finish();
		}
		pollTimer = setTimeout(function() {
			$.ajax({
				url: url || waiter.pollUrl,
				type: waiter.requestMethod,
				fake: waiter.fakeAjax,
				dataType: 'json'
			}).done(function(data) {
				switch (data.status) {
					case 'OK_CONTINUE':
						/* Продолжаем опрос */
						waiter.startPoll(url);
						break;
					case 'OK_FINISH':
						/* Финальный статус */
						if (data.acs_url) {
							if ( waiter.on3DS ) {
								waiter.on3DS(data);
							} else {
								waiter.submit3DS(data);
							}
						} else if (data.confirm_data && waiter.onConfirm) {
							waiter.onConfirm(data);
						} else if (waiter.onSuccess) {
							waiter.onSuccess(data);
						} else if (data.url) {
							/* Пришел редирект - выполняем */
							if (waiter.onRedirect) {
								waiter.onRedirect(data.url);
							} else {
								redirect(data.url);
							}
						}
						waiter.finish();
						break;
					 case 'ERR_FINISH':
						if ( waiter.onError ) {
							waiter.onError(data);
						} else if (data.url) {
							if (waiter.onRedirect) {
								waiter.onRedirect(data.url)
							} else {
								redirect(data.url);
							}
						}
						waiter.finish();
						break;
					default:
						/* Произвольная ошибка - вызываем коллбэк, передаем туда весь ответ сервера */
						if (waiter.onServerError) {
							waiter.onServerError(data);
						}
						waiter.finish();
						break;
				}
			}).fail(function(jqXHR, textStatus, err) {
				/* Ошибка взаимодействия с сервером или невалидный JSON-объект */
				if (waiter.onServerError) {
					waiter.onServerError(null, textStatus);
				}
				waiter.finish();
			});
		}, waiter.pollInterval);
	};

	this.submit3DS = function(data) {
		this.create3DSform(data);
		document.getElementById('cpg_acs_form').submit();
	}

	this.create3DSform = function(data) {
		var tds = data.threeds_data;
		$('body').append('<form id="cpg_acs_form" action="' + data.acs_url + '"' + ( typeof(data.target) != 'undefined' ? ('target=' + data.target) : '' ) + ' method="POST">'
			+ '<input type="hidden" name="PaReq" value="' + tds.PaReq + '" />'
			+ '<input type="hidden" name="TermUrl" value="' + tds.TermUrl + '" />'
			+ '<input type="hidden" name="MD" value="' + tds.MD + '" />'
			+ '</form>');
	}
}

function getBaseUrl() {
	var url = document.URL;
	var re = /(https?:\/\/.+?)(\/|\?)/;
	var found = url.match(re);
	return found[1];
}

function createCpgWaiter() {
	var baseUrl = getBaseUrl();
	return new CpgWaiter({
		submitUrl: baseUrl + $("#cpg_form").attr('action'),
		clockElement: 'cpg_waiter',
		submitElement: 'cpg_submit',
		requestMethod: 'POST',
		onServerError: function(data) {
			$("#cpg_form").hide();
			$("#cpg_error").show();
		},
		onParamsError: function(errors, remove) {
			if (remove) {
				$("#cpg_form").find('label').removeClass('cpg_error');
			} else {
				for (var field in errors) {
					$('#' + errors[field]).addClass('cpg_error');
				}
				$("#cpg_form").find("input[type=submit]").removeAttr('disabled');
			}
		},
		onTimeout: function(data) {
			$('#cpg_error').show();
		},
		onBackUrlRedirect: function(data) {
			var code = data.error.code || "UNKNOWN_ERROR";

			var $holder = $('a#cpg_error_back_url');
			if ($holder.length) {
				var url = $holder.attr('src');
				if (url) {
					url += url.indexOf('?') < 0 ? '?' : '&';
					url += 'cpg_error_code=' + code;
					window.location.href = url;
				}
			} else if (this.onError) {
				this.onError(data);
			}
		}
	});
}
