const Promise = require("bluebird");

const generateJSON = (content, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	const wrappedCallback = () => {
		if (typeof cb !== 'function') {
			return null;
		}
		return function () {
			return cb(null, ...arguments);
		}
	}
	return new Promise((resolve, reject) => {
		const blocks = content.split(/\s*\$end\s/gm).map(line => line.replace(/[\n\t]/gm, ' '));
		const States = {
			Init: 0,
			Meta: 1,
			Def: 2,
			Dump: 3
		};
		let state = States.Init;
		let modules = [];
		const meta = {};
		const signals = [];
		const signalMap = {};
		let lastIndex;
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i].trim();
			if (block === '') {
				continue;
			}

			const scopeMatches = /\$(\w+?)\b/gm.exec(block);
			if (scopeMatches) {
				const scopeName = scopeMatches[1];
				if (scopeName === 'scope') {
					state = States.Def;
					const scopeDefMatches = /\$(\w+)\s+([\s\S]+)\s+([\s\S]+)/gm.exec(block);
					if (!scopeDefMatches) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					const scopeType = scopeDefMatches[2];
					const modName = scopeDefMatches[3];
					modules.push(modName);
				} else if (scopeName === 'enddefinitions') {
					state = States.Dump;
					lastIndex = i + 1;
					break;
				} else if (scopeName === 'upscope') {
					modules.pop();
				} else if (scopeName === 'var') {
					const varDefMatches = /\$(\w+)\s+([\s\S]+?)\s+(\d+)\s+([\s\S]+?)\s+([\s\S]+)\s*/gm.exec(block);
					const signalName = varDefMatches[5].replace(/\s+/, '');
					const refName = varDefMatches[4];
					if (!signalMap[refName]) {
						const signal = {
							type: varDefMatches[2],
							size: parseInt(varDefMatches[3]),
							refName,
							signalName,
							module: modules[modules.length - 1] || '',
							name: modules.concat(signalName).join('.'),
							wave: []
						};
						signals.push(signal);
						signalMap[refName] = signal;
					}
				} else {
					const contentMatches = /\$(\w+)\b\s*([\s\S]+)?\s*/gm.exec(block);
					if (contentMatches) {
						meta[contentMatches[1]] = contentMatches[2];
					}
				}
			} else {
				return reject({
					error: 'Invalid VCD data'
				});
			}
		}
		if (!lastIndex) {
			return reject({
				error: 'Invalid VCD data'
			});
		}
		let currentTime = 0;
		const rem = content.split(/\s*\$enddefinitions\s*/gm)[1];
		if (!rem) {
			return reject({
				error: 'Invalid VCD data'
			});
		}
		const lines = rem.split(/\s*\n\s*/gm);
		for (let i = 1; i < lines.length; i++) {
			const block = lines[i].trim();
			if (block === '') {
				continue;
			}
			const timingMatches = /^#(\d+)$/gm.exec(block);
			if (timingMatches) {
				const time = parseInt(timingMatches[1]);
				currentTime = time;
			} else if (block === '$dumpvars') {
				continue;
			} else if (block === '$end') {
				continue;
			} else {
				if (block.startsWith('x')) {
					const refName = block.substr(1).trim();
					if (!signalMap[refName]) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					const wave = signalMap[refName].wave;
					if (!opts.compress || !wave.length || (wave[wave.length - 1][1] !== 'x')) {
						signalMap[refName].wave.push([currentTime.toString(), 'x']);
					}
				} else if (block.startsWith('b')) {
					const matches = /b([01xz]+)\s+([\s\S]+)/gm.exec(block);
					if (!matches) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					const refName = matches[2]
					if (!signalMap[refName]) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					let value = matches[1];
					if (!opts.expandAmbigousBus) {
						if (/z/gm.test(value)) {
							value = "z";
						} else if (/x/gm.test(value)) {
							value = "x";
						}
					}
					const wave = signalMap[refName].wave;
					if (!opts.compress || !wave.length || (wave[wave.length - 1][1] !== value)) {
						signalMap[refName].wave.push([currentTime.toString(), value]);
					}
				} else if (block.startsWith('z')) {
					const refName = block.substr(1).trim();
					if (!signalMap[refName]) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					const wave = signalMap[refName].wave;
					if (!opts.compress || !wave.length || (wave[wave.length - 1][1] !== 'z')) {
						signalMap[refName].wave.push([currentTime.toString(), 'z']);
					}
				} else if (/^[01]([\s\S]+)/gm.test(block)) {
					const matches = /^([01])([\s\S]+)/gm.exec(block);
					const refName = matches[2];
					if (!signalMap[refName]) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					const converted = parseInt(matches[1], 10).toString(2);
					const wave = signalMap[refName].wave;
					if (!opts.compress || !wave.length || (wave[wave.length - 1][1] !== converted)) {
						signalMap[refName].wave.push([currentTime.toString(), converted]);
					}
				} else if (block.startsWith('r')) {
					const matches = /r((\d+\.?\d*)|(nan)|(x+)|(z+))\s+([\s\S]+)/gm.exec(block);
					if (!matches) {
						console.log('========');
						console.log(block);
						return reject({
							error: 'Invalid VCD data'
						});
					}
					let value;
					if (matches[1] === 'nan' || matches[1].charAt(0) === 'x') {
						value = 'x'
					} else if (matches[1].charAt(0) === 'z') {
						value = 'z';
					} else {
						value = parseFloat(matches[1]);
					}
					const refName = matches[6];
					if (!signalMap[refName]) {
						return reject({
							error: 'Invalid VCD data'
						});
					}
					const wave = signalMap[refName].wave;
					if (!opts.compress || !wave.length || (wave[wave.length - 1][1] !== converted)) {
						signalMap[refName].wave.push([currentTime.toString(), isNaN(value) ? 'x' : (value.toString())]);
					}
				} else {
					return reject({
						error: 'Invalid VCD data'
					});
				}
			}
		}
		meta.endtime = currentTime.toString();
		meta.scale = meta.timescale;
		return resolve({ ...meta,
			signal: signals
		})
	}).then(wrappedCallback()).catch(cb);
}
module.exports = generateJSON;