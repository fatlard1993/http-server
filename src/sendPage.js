const pageCompiler = require('./pageCompiler');

module.exports = function sendPage(name, status){
	return function(req, res){
		if(status) res.status(status);

		res.end(pageCompiler.compile(name));
	};
};