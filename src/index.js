const polka = require('polka');
const staticServer = require('serve-static');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const log = require('log');

const sendPage = require('./sendPage');
const pageCompiler = require('page-compiler');
const onError = require('./error');
const responsePrepper = require('./responsePrepper');
const redirectTrailingWak = require('./redirectTrailingWak');

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