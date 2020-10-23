const fs = require('fs');
const zlib = require('zlib');

const log = new (require('log'))({ tag: 'http-server' });
const pageCompiler = require('page-compiler');
const now = require('performance-now');

module.exports = function responsePrepper(req, res, next){
	res.reqType = /^.*\.[^\\]{2,6}$/g.test(req.originalUrl) ? 'file' : 'page';

	log(`Req Url - ${req.originalUrl} | ${res.reqType}`);

	res.sendPage = function(name, status = 200){
		log(`Send page - ${name} - ${status}`);

		res.writeHead(status, {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'});

		var start = now();

		zlib.gzip(Buffer.from(pageCompiler.build(name), 'utf8'), (_, result) => {
			log(`Time to prepare "${name}": ${((now() - start) / 1000).toFixed(2)}s`);

			res.end(result);
		});
	};

	res.sendFile = function(path){
		log(`Send file - ${path}`);

		fs.readFile(path, function(err, file){
			res.end(file);
		});
	};

	res.json = function(json){
		log('Send JSON - ', json);

		res.writeHead(200, { 'Content-Type': 'application/json' });

		res.end(JSON.stringify(json));
	};

	res.redirect = function(code, path){
		log(`${code} redirect - ${path}`);

		res.writeHead(code, { 'Location': path });

		res.end();
	};

	res.send = function(string){
		log(`Send string - "${string}"`);

		res.end(string);
	};

	res.status = function(code){
		res.statusCode = code;

		return res;
	};

	next();
};