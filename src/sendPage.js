const zlib = require('zlib');

const pageCompiler = require('./pageCompiler');

module.exports = function sendPage(name, status){
	return function(req, res){
    res.writeHead(status || 200, {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'});

		zlib.gzip(Buffer.from(pageCompiler.compile(name), 'utf8'), (_, result) => {
      res.end(result);
    });
	};
};