const path = require('path');
const fs = require('fs');

const babel = require('@babel/core');
const postcss = require('postcss');
const postcssAutoprefixer = require('autoprefixer');
const postcssNested = require('postcss-nested');
const postcssExtend = require('postcss-extend-rule');
const postcssVariables = require('postcss-simple-vars');
const findRoot = require('find-root');
const now = require('performance-now');
const fsExtended = require('fs-extended');
const log = require('log');

const autoprefixerOptions = {
	flexBox: 'no-2009',
	browsers: ['last 10 versions'],
	cascade: false
};

const babelOptions = {
	presets: ['@babel/env']//, ['minify', { builtIns: false }]
};

const rootFolder = findRoot(process.cwd());

//todo look into caching rendered css
//todo inline manifest file: <link rel="manifest" href='data:application/manifest+json,{}'/>

const pageCompiler = module.exports = {
	includesText: '// includes ',
	babelText: '// babel',
	startText: '<!DOCTYPE html><html lang="en"><head>',
	headText: '<title>XXX</title>',
	openText: '</head><body>',
	closeText: '</body></html>',
	includesTag: {
		js: 'script>',
		css: 'style>'
	},
	cache: {},
	compile: function(name, dynamicContent){
		var headHtml = this.getFileWithIncludes(this.findFile('head', 'html'));
		var pageHtml = this.getFileWithIncludes(this.findFile(name, 'html'));

		var fullHTML = this.startText + headHtml.replace('XXX', name) + pageHtml + this.closeText;

		return dynamicContent ? fullHTML.replace('YYY', dynamicContent) : fullHTML;
	},
	getFileWithIncludes: function(fileLocation, parentFileLocation, included = {}){
		this.loadFileCache(fileLocation);

		if(!this.cache[fileLocation]){
			log.warn(`${fileLocation} has no valid cache entry`);

			return '';
		}

		var text = this.cache[fileLocation].text;

		if(!this.cache[fileLocation].includes){
			log.info(1)(parentFileLocation ? `Included ${fileLocation} into ${parentFileLocation}` : `Built ${fileLocation}`);

			return text;
		}

		var newParentFileLocation = parentFileLocation ? (this.cache[parentFileLocation].extension === 'html' && this.cache[fileLocation].extension !== 'html' ? fileLocation : parentFileLocation) : fileLocation;

		for(var x = 0, count = this.cache[fileLocation].includes.length, includesLocation; x < count; ++x){
			includesLocation = this.cache[fileLocation].includes[x];

			if(included[includesLocation]){
				log.warn(1)(`Already included ${includesLocation}`);

				continue;
			}

			included[includesLocation] = 1;

			var fileStats = /^(.*\/)?([^\.]*)\.?(.*)?$/.exec(includesLocation);
			var fileExtension = fileStats[3];
			var htmlTag = this.includesTag[fileExtension];
			var newText = this.getFileWithIncludes(includesLocation, newParentFileLocation, included);

			if(this.cache[fileLocation].extension === 'html' && fileExtension !== 'html'){
				text = `<${htmlTag}${newText}</${htmlTag}${x === 0 ? this.openText : ''}${text}`;
			}

			else text = newText + text;
		}

		if(parentFileLocation && this.cache[parentFileLocation].extension === 'html' && this.cache[fileLocation].extension === 'css'){
			log(1)(`Rendering ${this.cache[fileLocation].name} css`);

			try{
				text = postcss([postcssAutoprefixer(autoprefixerOptions), postcssNested(), postcssExtend(), postcssVariables()]).process(text);
			}

			catch(err){
				log.error('Error rendering CSS: ', this.cache[fileLocation].name, err);

				text = err;
			}
		}

		log.info(1)(parentFileLocation ? `Included ${fileLocation} into ${parentFileLocation}` : `Built ${fileLocation}`);

		return text;
	},
	loadFileCache: function(fileLocation){
		if(!fileLocation) return;

		if(!process.env.DEV && this.cache[fileLocation]) return;

		var toCache = !this.cache[fileLocation], mtime;

		if(!toCache){
			try{
				mtime = String(fs.statSync(fileLocation).mtime);
			}

			catch(err){
				mtime = err;
			}

			toCache = this.cache[fileLocation].mtime !== mtime;
		}

		if(toCache){
			log(2)(`Caching ${fileLocation}`);

			this.cache[fileLocation] = this.cache[fileLocation] || {};

			var fileStats = /^(.*\/)?([^\.]*)\.?(.*)?$/.exec(fileLocation);
			var fileText = fsExtended.catSync(fileLocation);

			this.cache[fileLocation].path = fileStats[1];
			this.cache[fileLocation].name = fileStats[2];
			this.cache[fileLocation].extension = fileStats[3];

			if(!fileText){
				log.error(fileLocation, 'does not exist');

				mtime = 'no file';

				fileText = (this.cache[fileLocation].name === 'head' && this.cache[fileLocation].extension === 'html') ? this.headText : '';
			}

			else{
				this.cache[fileLocation].mtime = String(fs.statSync(fileLocation).mtime);
				this.cache[fileLocation].includes = this.getIncludes(fileText, this.cache[fileLocation].extension);

				if(this.cache[fileLocation].includes) fileText = fileText.replace(/.*\n/, '');

				if(this.cache[fileLocation].extension === 'js' && /^(.*)\n?(.*)\n?/.exec(fileText)[1].startsWith(this.babelText)){
					try{
						log(2)('Running babel on JS: ', fileLocation);

						fileText = babel.transformSync(fileText, babelOptions).code;
					}

					catch(err){
						log.error('Error running babel on JS: ', fileLocation, err);

						fileText = err;
					}
				}
			}

			this.cache[fileLocation].text = fileText;

			log(1)(`Cached ${fileLocation}`);
		}

		else log(1)(`${fileLocation} has valid cache`);
	},
	getIncludes: function(text, extension){
		var firstLine = /(.*)\n/.exec(text)[1];

		if(!firstLine.startsWith(this.includesText)) return;

		var includes = firstLine.substring(12).split(' '), parsedIncludes = [];

		for(var x = includes.length, fileStats, filePath, fileName, fileExtension; x >= 0; --x){
			fileStats = /^(.*\/)?([^\.]*)\.?(.*)?$/.exec(includes[x]);
			filePath = fileStats[1];
			fileName = fileStats[2];
			fileExtension = fileStats[3] || extension;

			if(!fileName || fileName === 'undefined') continue;

			includes[x] = `${filePath}${fileName}.${fileExtension}`;

			if(!fs.existsSync(includes[x])) includes[x] = this.findFile(fileName, fileExtension);

			if(includes[x] && fs.existsSync(includes[x])) parsedIncludes.push(includes[x]);
		}

		return parsedIncludes;
	},
	findFile: function(name, extension){
		var fileLocation, checks = [`client/${extension}/${name}.${extension}`, `client/${extension}/_${name}.${extension}`, `node_modules/${name}/package.json`, `../node_modules/${name}/package.json`];

		for(var x = 0, count = checks.length; x < count; ++x){
			fileLocation = path.join(rootFolder, checks[x]);

			if(fs.existsSync(fileLocation)){
				log.info(2)(fileLocation, 'exists');

				if(x > 1){
					var pkg = JSON.parse(fs.readFileSync(fileLocation));

					fileLocation = path.join(rootFolder, checks[x].replace('package.json', ''), pkg.main);
				}

				break;
			}

			else{
				log.warn(2)(fileLocation, 'does not exist');

				fileLocation = null;
			}
		}

		if(!fileLocation) log.error(name, extension, 'does not exist');

		return fileLocation;
	}
};