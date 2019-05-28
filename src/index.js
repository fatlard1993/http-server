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

const httpServer = module.exports = {
	app,
	pageCompiler,
	staticServer,
	sendPage,
	init: function(port, rootFolder, homePath = '/home'){
		log(`[http-server] Starting from ${rootFolder} @ port "${port}" with the home path "${homePath}"`);

		process.env.ROOT_FOLDER = rootFolder;

		app.use(responsePrepper, redirectTrailingWak(homePath), bodyParser.json(), bodyParser.urlencoded({ extended: false }), cookieParser());

		app.listen(port);

		return httpServer;
	}
};