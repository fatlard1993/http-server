const path = require('path');

const polka = require('polka');
const staticServer = require('serve-static');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const log = require('log');

const compilePage = require('./compilePage');
const onError = require('./middleware/error');
const responsePrepper = require('./middleware/responsePrepper');
const redirectTrailingWak = require('./middleware/redirectTrailingWak');

const fontsPath = path.join(__dirname, '../client/fonts');

const app = polka({ onError });

app.use(responsePrepper, redirectTrailingWak, bodyParser.json(), bodyParser.urlencoded({ extended: false }), cookieParser());

app.get('/testj', function(req, res){
	log()('Testing JSON...');

	res.json({ test: 1 });
});

app.get('/test', function(req, res){
	log()('Testing...');

	res.send('test');
});

app.use('/fonts', staticServer(fontsPath));

app.get('/home', function(req, res){
	res.end(compilePage.compile('home'));
});

module.exports = {
	init: function(port){
		app.listen(port);

		return { app, compilePage };
	}
};