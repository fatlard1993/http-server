module.exports = function redirectTrailingWak(homePath){
	return function(req, res, next){
		const splitReqUrl = req.originalUrl.split('?');
		const reqSlug = splitReqUrl[0], query = splitReqUrl[1];

		if(reqSlug === '/' || reqSlug.slice(-1) !== '/') return next();

		reqSlug = reqSlug.slice(0, -1);

		res.redirect(301, reqSlug ? (reqSlug + (query ? ('?'+ query) : '')) : homePath);
	};
};