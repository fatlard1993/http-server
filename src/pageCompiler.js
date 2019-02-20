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
	presets: ['@babel/env', ['minify', { builtIns: false }]]
};

const rootFolder = findRoot(process.cwd());

//todo support includes with includes
// add file names to a list to check if its already there first

//todo support reading the package.json to find which file to include

const pageCompiler = module.exports = {
	includesText: '// includes ',
	babelText: '// babel',
	startText: '<!DOCTYPE html><html><head>',
	headText: '<title>XXX</title>',
	openText: '</head><body>',
	closeText: '</body></html>',
	includesTag: {
		js: 'script>',
		css: 'style>'
	},
	cache: {},
	compile: function(name, dynamicContent){
		var start = now();

		var pageHtml = this.readCacheFile(name);

		var fullHTML = this.startText + this.readCacheFile('head').replace('XXX', name) + (this.cache[name].includesHTML ? this.cache[name].includesHTML : '') + this.openText + pageHtml + this.closeText;

		log(`Time to compile "${name}": ${((now() - start) / 1000).toFixed(2)}s`);

		return dynamicContent ? fullHTML.replace('YYY', dynamicContent) : fullHTML;
	},
	getFileWithIncludes: function(filePath){
		var text = '';

		this.loadFileCache(filePath);

		if(!this.cache[filePath].includes) return text;

		for(var x = 0, count = this.cache[filePath].includes.length; x < count; ++x){
			if(this.cache[filePath].dependencies[this.cache[filePath].includes[x]]) continue;

			this.cache[filePath].dependencies[this.cache[filePath].includes[x]] = 1;

			text = this.getFileWithIncludes(this.cache[filePath].includes[x]) + text;
		}

		return text;
	},
	loadFileCache: function(file_path){
		if(!file_path) return '';

		if(!process.env.DEV && this.cache[file_path]) return this.cache[file_path].cache;

		var toCache = !this.cache[file_path], mtime;

		if(!toCache){
			try{
				mtime = String(fs.statSync(this.cache[file_path].path).mtime);
			}

			catch(err){
				mtime = err;
			}

			toCache = this.cache[file_path].mtime !== mtime;
		}

		if(toCache){
			log(1)(`Caching ${file_path}`);

			this.cache[filePath] = this.cache[filePath] || {};
			this.cache[filePath].dependencies = {};

			var fileStats = /^(?:.*\/)?([^\.]*)\.?(.*)?$/.exec(file_path), fileExtension = fileStats[2], fileName = fileStats[1], filePath, fileText, includes;

			if(fileExtension === 'css'){
				fileText = fsExtended.catSync(file_path);
			}

			jsCache: if(fileExtension === 'js'){
				fileText = fsExtended.catSync(file_path);

				if(!fileText){
					log.error(file_path, 'does not exist');

					fileText = '';
					mtime = 'none';

					break jsCache;
				}

				this.cache[file_path].includes = this.readIncludes(fileText, fileExtension);

				if(!/^(.*)\n?(.*)\n?/.exec(fileText)[this.cache[file_path].includes ? 2 : 1].startsWith(this.babelText)) break jsCache;

				try{
					log(1)('Running babel on JS: ', file_path);

					fileText = babel.transformSync(fileText, babelOptions).code;
				}

				catch(err){
					log.error('Error running babel on JS: ', file_path, err);

					mtime = fileText = err;
				}
			}

			htmlCache: if(fileExtension === 'html'){
				filePath = path.join(rootFolder, 'client/html', fileName +'.html');

				fileText = fsExtended.catSync(filePath);

				if(!fileText){
					log.error(filePath, 'does not exist');

					if(fileName === 'head'){
						fileText = this.headText;
					}

					else fileText = '';

					mtime = 'none';
					break htmlCache;
				}

				includes = this.readIncludes(fileText, fileExtension);

				if(!includes) break htmlCache;

				var $selfIndex = includes.indexOf('$self.html');

				if($selfIndex >= 0){
					includes.splice($selfIndex, 1);
					includes.push(path.join(rootFolder, `client/js/${fileName}.js`), path.join(rootFolder, `client/css/${fileName}.css`));
				}

				this.cache[file_path].includes = includes;

				fileText = fileText.replace(/.*\n/, '');

				this.generateIncludesHTML(file_path);
			}

			if(!filePath) filePath = file_path;
			if(!mtime) mtime = String(fs.statSync(filePath).mtime);

			this.cache[file_path].path = filePath;
			this.cache[file_path].extension = fileExtension;
			this.cache[file_path].mtime = mtime;
			this.cache[file_path].text = fileText;

			log(1)(`Cached ${file_path}`);
		}

		else if(this.cache[file_path].extension === 'html' && this.cache[file_path].includes) this.generateIncludesHTML(file_path);

		return this.cache[file_path].text;
	},
	readCacheFile: function(file_path){
		if(!file_path) return '';

		if(!process.env.DEV && this.cache[file_path]) return this.cache[file_path].text;

		var toCache = !this.cache[file_path], mtime;

		if(!toCache){
			try{
				mtime = String(fs.statSync(this.cache[file_path].path).mtime);
			}

			catch(err){
				mtime = err;
			}

			toCache = this.cache[file_path].mtime !== mtime;
		}

		if(toCache){
			log(1)(`Caching ${file_path}`);

			this.cache[file_path] = this.cache[file_path] || {};

			var fileStats = /^(?:.*\/)?([^\.]*)\.?(.*)?$/.exec(file_path), fileExtension = fileStats[2] || 'html', fileName = fileStats[1], filePath, fileText, includes;

			cssCache: if(fileExtension === 'css'){
				fileText = fsExtended.catSync(file_path);

				if(!fileText){
					log.error(file_path, 'does not exist');

					fileText = '';
					mtime = 'none';

					break cssCache;
				}

				this.cache[file_path].includes = this.readIncludes(fileText, fileExtension);

				if(this.cache[file_path].includes) fileText = fileText.replace(/.*\n/, '');
			}

			jsCache: if(fileExtension === 'js'){
				fileText = fsExtended.catSync(file_path);

				if(!fileText){
					log.error(file_path, 'does not exist');

					fileText = '';
					mtime = 'none';

					break jsCache;
				}

				this.cache[file_path].includes = this.readIncludes(fileText, fileExtension);

				if(!/^(.*)\n?(.*)\n?/.exec(fileText)[this.cache[file_path].includes ? 2 : 1].startsWith(this.babelText)) break jsCache;

				try{
					log(1)('Running babel on JS: ', file_path);

					fileText = babel.transformSync(fileText, babelOptions).code;
				}

				catch(err){
					log.error('Error running babel on JS: ', file_path, err);

					mtime = fileText = err;
				}
			}

			htmlCache: if(fileExtension === 'html'){
				filePath = path.join(rootFolder, 'client/html', fileName +'.html');

				fileText = fsExtended.catSync(filePath);

				if(!fileText){
					log.error(filePath, 'does not exist');

					if(fileName === 'head'){
						fileText = this.headText;
					}

					else fileText = '';

					mtime = 'none';
					break htmlCache;
				}

				includes = this.readIncludes(fileText, fileExtension);

				if(!includes) break htmlCache;

				var $selfIndex = includes.indexOf('$self.html');

				if($selfIndex >= 0){
					includes.splice($selfIndex, 1);
					includes.push(path.join(rootFolder, `client/js/${fileName}.js`), path.join(rootFolder, `client/css/${fileName}.css`));
				}

				this.cache[file_path].includes = includes;

				fileText = fileText.replace(/.*\n/, '');

				this.generateIncludesHTML(file_path);
			}

			if(!filePath) filePath = file_path;
			if(!mtime) mtime = String(fs.statSync(filePath).mtime);

			this.cache[file_path].path = filePath;
			this.cache[file_path].extension = fileExtension;
			this.cache[file_path].mtime = mtime;
			this.cache[file_path].text = fileText;

			log(1)(`Cached ${file_path}`);
		}

		else if(this.cache[file_path].extension === 'html' && this.cache[file_path].includes) this.generateIncludesHTML(file_path);

		return this.cache[file_path].text;
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
	getIncludes: function(text, extension){
		var firstLine = /(.*)\n/.exec(text)[1];

		if(!firstLine.startsWith(this.includesText)) return;

		var includes = firstLine.substring(12).split(' ');

		for(var x = 0, count = includes.length, file, filePath, fileName, fileExtension; x < count; ++x){
			file = /^(.*\/)?([^\.]*)\.?(.*)?$/.exec(includes[x]);
			filePath = file[1];
			fileName = file[2];
			fileExtension = file[3] || extension;

			if(extension === 'html') includes[x] = `${filePath}${fileName}.${fileExtension}`;

			else includes[x] = this.findFile(fileName, fileExtension);
		}

		return includes;
	},
	findFile: function(name, extension){
		var filePath, checks = [`client/${extension}/${name}.${extension}`, `client/${extension}/_${name}.${extension}`, `node_modules/${name}/package.json`, `../node_modules/${name}/package.json`];

		for(var x = 0, count = checks.length; x < count; ++x){
			filePath = path.join(rootFolder, checks[x]);

			if(fs.existsSync(filePath)){
				log.info(1)(filePath, 'exists');

				if(x > 1){
					var pkg = JSON.parse(fs.readFileSync(filePath));

					filePath = path.join(rootFolder, checks[x].replace('package.json', ''), pkg.main);
				}

				break;
			}

			else{
				log.warn(1)(filePath, 'does not exist');

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
					fileText = postcss([postcssAutoprefixer(autoprefixerOptions), postcssNested(), postcssExtend(), postcssVariables()]).process(fileText);
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