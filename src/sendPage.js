const compilePage = require('./compilePage');

module.exports = function sendPage(name, status){
	return function(req, res){
		if(status) res.status(status);

		res.end(compilePage(name));
	};
};