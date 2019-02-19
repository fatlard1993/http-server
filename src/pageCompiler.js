const path = require('path');
const fs = require('fs');

const babel = require('@babel/core');
const postcss = require('postcss');
const postcssAutoprefixer = require('autoprefixer');
const postcssNested = require('postcss-nested');
const postCssExtend = require('postcss-extend-rule');
const postCssVariables = require('postcss-simple-vars');
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
	presets: ['@babel/env', ['minify', { builtIns: false }]]
};

const rootFolder = findRoot(process.cwd());

//todo support includes with includes
// add file names to a list to check if its already there first

//todo support checking node_modules at root and parent for named includes

const compilePage = module.exports = {
	includesText: '// includes ',
	babelText: '// babel',
	openText: '\n</head><body>',
	closeText: '\n</body></html>',
	includesTag: {
		js: 'script>',
		css: 'style>'
	},
	cache: {},
	compile: function(name, dynamicContent){
		var start = now();

		var pageHtml = this.readCacheFile(name);

		var fullHTML = this.readCacheFile('head').replace('XXX', name) + (this.cache[name].includesHTML ? this.cache[name].includesHTML : '') + this.openText + pageHtml + this.closeText;

		log(`Time to compile "${name}": ${now() - start}ms`);

		return dynamicContent ? fullHTML.replace('YYY', dynamicContent) : fullHTML;
	},
	readCacheFile: function(file){
		if(!process.env.DEV && this.cache[file]) return this.cache[file].text;

		var toCache = !this.cache[file], mtime;

		if(!toCache){
			mtime = String(fs.statSync(this.cache[file].path).mtime);

			toCache = this.cache[file].mtime !== mtime;
		}

		if(toCache){
			log(1)(`Caching ${file}`);

			this.cache[file] = this.cache[file] || {};

			var fileStats = /^(?:.*\/)?([^\.]*)\.?(.*)?$/.exec(file), fileExtension = fileStats[2] || 'html', fileName = fileStats[1], filePath, fileText, includes;

			cssCache: if(fileExtension === 'css'){
				filePath = path.join(rootFolder, 'client/css', file);

				fileText = fsExtended.catSync(filePath);

				if(!fileText){
					log.error(filePath, 'does not exist');

					break cssCache;
				}

				this.cache[file].includes = this.readIncludes(fileText, fileExtension);

				if(this.cache[file].includes) fileText = fileText.replace(/.*\n/, '');
			}

			jsCache: if(fileExtension === 'js'){
				filePath = path.join(rootFolder, 'client/js', file);

				fileText = fsExtended.catSync(filePath);

				if(!fileText){
					log.error(filePath, 'does not exist');

					break jsCache;
				}

				this.cache[file].includes = this.readIncludes(fileText, fileExtension);

				if(!/^(.*)\n?(.*)\n?/.exec(fileText)[this.cache[file].includes ? 2 : 1].startsWith(this.babelText)) break jsCache;

				try{
					log(1)('Running babel on JS: ', filePath);

					fileText = babel.transformSync(fileText, babelOptions).code;
				}

				catch(err){
					log.error('Error running babel on JS: ', filePath, err);

					mtime = fileText = err;
				}
			}

			htmlCache: if(fileExtension === 'html'){
				filePath = path.join(rootFolder, 'client/html', fileName +'.html');

				fileText = fsExtended.catSync(filePath);

				if(!fileText){
					log.error(filePath, 'does not exist');

					break htmlCache;
				}

				includes = this.readIncludes(fileText, fileExtension);

				if(!includes) break htmlCache;

				var $selfIndex = includes.indexOf('$self.html');

				if($selfIndex >= 0){
					includes.splice($selfIndex, 1);
					includes.push(`${fileName}.js`, `${fileName}.css`);
				}

				this.cache[file].includes = includes;

				fileText = fileText.replace(/.*\n/, '');

				this.generateIncludesHTML(file);
			}

			if(!filePath) filePath = file;
			if(!mtime) mtime = String(fs.statSync(filePath).mtime);
			if(!fileText) fileText = fsExtended.catSync(filePath);

			this.cache[file].path = filePath;
			this.cache[file].extension = fileExtension;
			this.cache[file].mtime = mtime;
			this.cache[file].text = fileText;

			log(`Cached ${file}`);
		}

		else if(this.cache[file].extension === 'html' && this.cache[file].includes) this.generateIncludesHTML(file);

		return this.cache[file].text;
	},
	readIncludes: function(text, extension){
		var firstLine = /(.*)\n/.exec(text)[1];

		if(!firstLine.startsWith(this.includesText)) return;

		var includes = firstLine.substring(12).split(' ');

		for(var x = 0, count = includes.length, file, filePath, fileName, fileExtension; x < count; ++x){
			file = /^(.*\/)?([^\.]*)\.?(.*)?$/.exec(includes[x]);
			filePath = file[1] || (extension === 'html' ? '' : '_');
			fileName = file[2];
			fileExtension = file[3] || extension;

			if(extension === 'html') includes[x] = `${filePath}${fileName}.${fileExtension}`;

			else includes[x] = this.findFile(fileName, fileExtension);
		}

		return includes;
	},
	findFile: function(name, extension){
		var filePath, checks = [`client/${extension}/_${name}.${extension}`, `node_modules/${name}/src/index.${extension}`, `../node_modules/${name}/src/index.${extension}`];

		for(var x = 0, count = checks.length; x < count; ++x){
			filePath = path.join(rootFolder, checks[x]);

			if(fs.existsSync(filePath)){
				log.info(filePath, 'exists');

				break;
			}

			else{
				log.warn(filePath, 'does not exist');

				filePath = null;
			}
		}

		if(!filePath) log.error(name, extension, 'does not exist');

		return filePath;
	},
	generateIncludesHTML: function(name){
		var includesHTML = '', fileName, fileExtension, fileText, htmlTag;

		for(var x = 0, y, count = this.cache[name].includes.length; x < count; ++x){
			fileName = this.cache[name].includes[x];

			if(!fileName) continue;

			fileText = this.readCacheFile(fileName);
			fileExtension = this.cache[fileName].extension;
			htmlTag = this.includesTag[fileExtension];

			if(this.cache[fileName].includes){
				for(y = this.cache[fileName].includes.length - 1; y >= 0; --y){
					fileText = `${this.readCacheFile(this.cache[fileName].includes[y])}\n${fileText}`;
				}
			}

			if(fileExtension === 'css'){
				log(`rendering ${fileName}`);

				try{
					fileText = postcss([postcssAutoprefixer(autoprefixerOptions), postcssNested(), postCssExtend(), postCssVariables()]).process(fileText);
				}

				catch(err){
					log.error('Error rendering CSS: ', fileName, err);

					fileText = err;
				}
			}

			includesHTML += `\n\t\t<${htmlTag}${fileText}</${htmlTag}`;
		}

		this.cache[name].includesHTML = includesHTML;
	}
};