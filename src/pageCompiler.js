const path = require('path');
const fs = require('fs');

const babel = require('@babel/core');
const postcss = require('postcss');
const postcssAutoprefixer = require('autoprefixer');
const postcssNesting = require('postcss-nested');
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
	presets: ['@babel/env']
};

const pageCompiler = module.exports = {
	includesText: '// includes ',
	babelText: '// babel',
	startText: '<!DOCTYPE html><html lang="en"><head>',
	headText: '<title>XXX</title>',
	openText: '</head><body>',
	closeText: '</body></html>',
	prebuilt: {
		head: '<title>XXX</title>',
		error: `// includes error.js error.css
			<p>Server says...</p>
			<pre>YYY</pre>
			<button onClick="window.location.href = '/'">Back</button>
		`
	},
	cache: {},
	buildFile: function(name, dynamicContent){
		var fileLocation = this.findFile(name, 'html');
		var files = this.cacheFileAndIncludes(fileLocation);

		log(1)(`Building file "${name}" with: `, files);

		var file = {
			html: '',
			js: '',
			css: '',
			webmanifest: '',
			text: ''
		};

		for(var x = 0, count = files.length; x < count; ++x){
			if(!this.cache[files[x]]){
				log.warn(`No file cache: ${files[x]}`);

				continue;
			}

			file[this.cache[files[x]].extension] += `\n${this.cache[files[x]].text}`;
		}

		file.html += this.cache[fileLocation] ? this.cache[fileLocation].text : '';

		this.headFileLocation = this.headFileLocation || this.findFile('head', 'html');
		this.cacheFile(this.headFileLocation);

		if(file.css.length && !this.cache[fileLocation].postcss){
			log()(`Rendering ${name} css`);

			this.cache[fileLocation].postcss = postcss([postcssAutoprefixer(autoprefixerOptions), postcssNesting(), postcssExtend(), postcssVariables()]).process(file.css);
		}

		file.text += `${this.startText}${this.cache[this.headFileLocation].text.replace('XXX', name)}`;

		if(file.webmanifest) file.text += `<link rel="manifest" href='data:application/manifest+json,${JSON.stringify(JSON.parse(file.webmanifest))}'/>`;
		if(file.js) file.text += `<script>${file.js}</script>`;
		if(this.cache[fileLocation].postcss) file.text += `<style>${this.cache[fileLocation].postcss}</style>`;

		file.text += `${this.openText}${dynamicContent ? file.html.replace('YYY', dynamicContent) : file.html}${this.closeText}`;

		//todo cache entire file text and invalidate on any includes changes

		return file.text;
	},
	cacheFileAndIncludes: function(fileLocation, parentName, files = []){
		parentName = parentName || fileLocation;

		this.cacheFile(fileLocation, parentName);

		if(!this.cache[fileLocation] || !this.cache[fileLocation].includes) return files;

		for(var x = 0, count = this.cache[fileLocation].includes.length, includesLocation; x < count; ++x){
			includesLocation = this.cache[fileLocation].includes[x];

			if(!includesLocation){
				log.warn(1)(`No location "${includesLocation}"`);

				continue;
			}

			var oldIndex = files.indexOf(includesLocation);

			if(oldIndex >= 0){
				if(oldIndex > 0){
					files = util.adjustArr(files, oldIndex, 0);

					if(this.cache[includesLocation].includes){
						for(var y = 0, yCount = this.cache[includesLocation].includes.length; y < yCount; ++y){
							files = util.adjustArr(files, files.indexOf(this.cache[includesLocation].includes[y]), 0);
						}
					}
				}

				log.warn(1)(`Already included ${includesLocation} ${oldIndex}`);

				continue;
			}

			files.unshift(includesLocation);

			this.cacheFileAndIncludes(includesLocation, parentName, files);
		}

		return files;
	},
	cacheFile: function(fileLocation, parentName){
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
				mtime = 'no file';

				fileText = this.prebuilt[this.cache[fileLocation].name] || '';

				if(!fileText) log.error(`Could not include "${fileLocation}", does not exist`);
			}

			else this.cache[fileLocation].mtime = String(fs.statSync(fileLocation).mtime);

			this.cache[fileLocation].includes = this.getIncludes(fileText, this.cache[fileLocation]);

			if(this.cache[fileLocation].extension === 'css'){
				fileText = fileText.replace(/\/\/.*\n?/g, '');

				delete this.cache[parentName].postcss;
			}

			else if(this.cache[fileLocation].includes) fileText = fileText.replace(/.*\n/, '');

			if(this.cache[fileLocation].extension === 'js' && /^(.*)\n?(.*)\n?/.exec(fileText)[1].startsWith(this.babelText)){
				try{
					log()('Running babel on JS: ', fileLocation);

					fileText = babel.transformSync(fileText, babelOptions).code;

					fs.writeFileSync(fileLocation, this.cache[fileLocation].includesText +'\n'+ fileText);
				}

				catch(err){
					log.error('Error running babel on JS: ', fileLocation, err);

					fileText = err;
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

		file.includesText = firstLine;

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

		log(1)(`Parsed includes for ${file.name}${file.extension}`, parsedIncludes);

		return parsedIncludes;
	},
	findFile: function(name, extension, filePath){
		if(filePath) filePath = findRoot(filePath);

		else filePath = process.env.ROOT_FOLDER;

		log(3)(`Finding file: "${name}.${extension}" from: ${filePath}`);

		var fileLocation;
		var checks = [
			`src/${name}.${extension}`,
			`client/${extension}/${name}.${extension}`,
			`node_modules/${name}/src/index.${extension}`,
			`node_modules/${name}/package.json`,
			`client/resources/${name}.${extension}`,
			`../node_modules/${name}/package.json`,
			`../../node_modules/${name}/package.json`
		];

		for(var x = 0, count = checks.length; x < count; ++x){
			fileLocation = path.resolve(filePath, checks[x]);

			if(fs.existsSync(fileLocation)){
				log.info(3)(fileLocation, 'exists');

				if(fileLocation.includes('package.json')){
					var pkg = JSON.parse(fs.readFileSync(fileLocation));

					fileLocation = path.resolve(filePath, checks[x].replace('package.json', ''), pkg['main'+ (extension  === 'css' ? 'Css' : '')]);
				}

				break;
			}

			else{
				log.warn(3)(fileLocation, 'does not exist');

				fileLocation = null;
			}
		}

		if(!fileLocation) log.error(`Could not find file "${name}.${extension}" does not exist`);

		return fileLocation || `prebuilt/${name}.${extension}`;
	}
};