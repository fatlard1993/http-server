const polka = require('polka');
const staticServer = require('serve-static');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const log = require('log');

const sendPage = require('./sendPage');
const pageCompiler = require('./pageCompiler');
const onError = require('./middleware/error');
const responsePrepper = require('./middleware/responsePrepper');
const redirectTrailingWak = require('./middleware/redirectTrailingWak');

const app = polka({ onError });

module.exports = function httpServer(port, homePath = '/home'){
	log(`Starting http-server @ port "${port}" with the home path "${homePath}"`);

	app.use(responsePrepper, redirectTrailingWak(homePath), bodyParser.json(), bodyParser.urlencoded({ extended: false }), cookieParser());

	app.listen(port);

	return { app, pageCompiler, staticServer, sendPage	};
};