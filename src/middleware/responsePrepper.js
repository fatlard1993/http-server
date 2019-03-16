const fs = require('fs');

const log = require('log');

const responsePrepper = module.exports = function(req, res, next){
	res.reqType = /^.*\.[^\\]+$/g.test(req.originalUrl) ? 'file' : 'page';

	log()(`\nReq Url - ${req.originalUrl} | ${res.reqType}`);

	res.sendFile = function(path){
		log()(`Send file - ${path}`);

		fs.readFile(path, function(err, file){
			res.end(file);
		});
	};

	res.json = function(json){
		log()('Send JSON - ', json);

		res.writeHead(200, { 'Content-Type': 'application/json' });

		res.end(JSON.stringify(json));
	};

	res.redirect = function(code, path){
		log()(`${code} redirect - ${path}`);

		res.writeHead(code, { 'Location': path });

		res.end();
	};

	res.send = function(string){
		log()(`Send string - "${string}"`);

		res.end(string);
	};

	res.status = function(code){
		res.statusCode = code;

		return res;
	};

	next();
};