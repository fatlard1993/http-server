const zlib = require('zlib');

const now = require('performance-now');
const log = require('log');

const pageCompiler = require('./pageCompiler');

module.exports = function sendPage(name, status){
	return function(req, res){
		res.writeHead(status || 200, {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'});

		var start = now();

		zlib.gzip(Buffer.from(pageCompiler.compile(name), 'utf8'), (_, result) => {
			log(`Time to prepare "${name}": ${((now() - start) / 1000).toFixed(2)}s`);

			res.end(result);
		});
	};
};