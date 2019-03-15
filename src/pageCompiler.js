const path = require('path');
const fs = require('fs');

const babel = require('@babel/core');
const postcss = require('postcss');
const postcssAutoprefixer = require('autoprefixer');
const postcssNested = require('postcss-nested');
const postcssExtend = require('postcss-extend-rule');
const postcssVariables = require('postcss-simple-vars');
const findRoot = require('find-root');
const fsExtended = require('fs-extended');
const log = require('log');
const util = require('js-util');

const autoprefixerOptions = {
	flexBox: 'no-2009',
	browsers: ['last 10 versions'],
	cascade: false
};

const babelOptions = {
	presets: ['@babel/env']//, ['minify', { builtIns: false }]
};

const rootFolder = findRoot(process.cwd());

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
	buildFile: function(name, dynamicContent){
		var fileLocation = this.findFile(name, 'html');
		var files = this.cacheFileAndIncludes(fileLocation);

		log(files);

		var file = {
			html: '',
			js: '',
			css: '',
			text: ''
		};

		for(var x = 0, count = files.length; x < count; ++x){
			if(!this.cache[files[x]]){
				log.warn(`No file cache: ${files[x]}`);

				continue;
			}

			file[this.cache[files[x]].extension] += `\n${this.cache[files[x]].text}`;
		}

		file.html += this.cache[fileLocation].text;

		this.headFileLocation = this.headFileLocation || this.findFile('head', 'html');
		this.cacheFile(this.headFileLocation);

		if(file.css.length){
			log()(`Rendering ${name} css`, file.css);

			file.css = postcss([postcssAutoprefixer(autoprefixerOptions), postcssNested(), postcssExtend(), postcssVariables()]).process(file.css);
		}

		file.text += `${this.startText}${this.cache[this.headFileLocation].text.replace('XXX', name)}`;
		file.text += `<script>${file.js}</script><style>${file.css}</style>`;
		file.text += `${this.openText}${dynamicContent ? file.html.replace('YYY', dynamicContent) : file.html}${this.closeText}`;

		//todo cache file text and invalidate on any includes changes

		return file.text;
	},
	cacheFileAndIncludes: function(fileLocation, files = []){
		this.cacheFile(fileLocation);

		if(!this.cache[fileLocation] || !this.cache[fileLocation].includes) return files;

		for(var x = this.cache[fileLocation].includes.length, includesLocation; x >= 0; --x){
			includesLocation = this.cache[fileLocation].includes[x];

			if(!includesLocation){
				log.warn(1)(`No location "${includesLocation}"`);

				continue;
			}

			var oldIndex = files.indexOf(includesLocation);

			if(oldIndex >= 0){
				if(oldIndex > 0) files = util.adjustArr(files, oldIndex, Math.max(0, oldIndex - 1));

				log.warn(1)(`Already included ${includesLocation} ${oldIndex}`);

				continue;
			}

			files.push(includesLocation);

			this.cacheFileAndIncludes(includesLocation, files);
		}

		return files;
	},
	cacheFile: function(fileLocation){
		if(!fileLocation) return;

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
				log.error(`Could not include "${fileLocation}", does not exist`);

				mtime = 'no file';

				fileText = (this.cache[fileLocation].name === 'head' && this.cache[fileLocation].extension === 'html') ? this.headText : '';
			}

			else{
				this.cache[fileLocation].mtime = String(fs.statSync(fileLocation).mtime);
				this.cache[fileLocation].includes = this.getIncludes(fileText, this.cache[fileLocation]);

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

			log()(`Cached ${fileLocation}`);
		}

		else log(1)(`${fileLocation} has valid cache`);
	},
	getIncludes: function(text, file){
		var firstLine = /(.*)\n?/.exec(text)[1];

		if(!firstLine.startsWith(this.includesText)) return;

		var includes = firstLine.substring(12).split(' '), parsedIncludes = [];

		for(var x = includes.length, fileStats, filePath, fileName, fileExtension; x >= 0; --x){
			fileStats = /^(.*\/)?([^\.]*)\.?(.*)?$/.exec(includes[x]);
			filePath = fileStats[1];
			fileName = fileStats[2];
			fileExtension = fileStats[3] || file.extension;

			if(!fileName || fileName === 'undefined') continue;

			includes[x] = `${filePath}${fileName}.${fileExtension}`;

			if(!fs.existsSync(includes[x])) includes[x] = this.findFile(fileName, fileExtension, file.path);

			if(includes[x] && fs.existsSync(includes[x])) parsedIncludes.push(includes[x]);
		}

		return parsedIncludes;
	},
	findFile: function(name, extension, filePath){
		if(filePath) filePath = findRoot(filePath);
		else filePath = rootFolder;

		log(3)(`Finding file: "${name}.${extension}" from: ${filePath}`);

		var fileLocation;
		var checks = [
			`client/${extension}/${name}.${extension}`,
			`client/${extension}/_${name}.${extension}`,
			`src/${name}.${extension}`,
			`node_modules/${name}/package.json`,
			`../node_modules/${name}/package.json`,
			`../../node_modules/${name}/package.json`
		];

		for(var x = 0, count = checks.length; x < count; ++x){
			fileLocation = path.join(filePath, checks[x]);

			if(fs.existsSync(fileLocation)){
				log.info(2)(fileLocation, 'exists');

				if(x > 2){ //reading location from package.json
					var pkg = JSON.parse(fs.readFileSync(fileLocation));

					fileLocation = path.join(filePath, checks[x].replace('package.json', ''), pkg['main'+ (extension  === 'css' ? 'Css' : '')]);
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