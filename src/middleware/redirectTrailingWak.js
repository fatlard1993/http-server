const redirectTrailingWak = module.exports = function(req, res, next){
	var splitReqUrl = req.originalUrl.split('?');
	var reqSlug = splitReqUrl[0];

	if(reqSlug.slice(-1) !== '/') return next();
	reqSlug = reqSlug.slice(0, -1);

	var query = splitReqUrl[1];

	res.redirect(301, reqSlug ? (reqSlug + (query ? ('?'+ query) : '')) : '/');
};