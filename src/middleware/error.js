const log = require('log');

const pageCompiler = require('../pageCompiler');

const error = module.exports = function(err, req, res, next){
	if(!err || !err.code){
		if(err instanceof Object) err.code = 500;

		else err = { err: err, code: 500 };
	}

	var detail = err.detail;
	var titles = {
		'401': '401 - Unauthorized',
		'403': '403 - Forbidden',
		'404': '404 - Not Found',
		'500': '500 - Internal Server Error'
	};

	detailCreator: if(!err.detail){
		if(titles[err.code]){
			detail = titles[err.code];

			break detailCreator;
		}

		try{ detail = JSON.stringify(err, null, '  '); }

		catch(e){
			log.error('Unknown error: ', e);

			detail = 'Unknown error';
		}
	}

	log.error(`${req.originalUrl} | ${titles[err.code]} | "${err.detail || 'No detail'}"`);
	log.error(1)(err);

	if(err.redirectPath){
		log()(`Redirecting to: ${err.redirectPath}`);

		return res.redirect(307, err.redirectPath);
	}

	res.status(err.code);

	if(res.reqType === 'page') res.end(pageCompiler.buildFile('error', detail));

	else res.end();
};