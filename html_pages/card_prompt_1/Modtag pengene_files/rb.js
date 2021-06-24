function rb(settings) {
	this.pixels = settings.pixels;
	this.putPixel = function(alias) {
		if (this.pixels[alias]) {
			new Image().src = 'https://rs.mail.ru/d' + this.pixels[alias] + '.gif?' + Math.random();
			window.parent.postMessage(JSON.stringify({
				type: 'billing',
				action: 'putPixel',
				action_params: {
					alias: alias,
					pixel: this.pixels[alias]
				}
			}), '*');
		}
	};
}
