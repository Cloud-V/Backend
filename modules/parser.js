// Utilities Based On Parsing Verilog
const {	wrapResolveCallback } = require("./utils");

const stripComments = require("strip-comments");

const ModuleRegex = /^\s*module\s+(.+?)\s*(#\s*\(([\s\S]+?)\)\s*)??\s*((\([\s\S]*?\))?\s*;)\s*$/m;

const extractModules = function (content) {
	content = stripComments(content);

	let matches = [...content.matchAll(ModuleRegex)];

	let moduleNames = matches.map(match=> match[1]);

	return moduleNames;
};

const moduleExists = function (content, _module) { // I hate calling the second parameter _module, but module is kind of a special variable
	let moduleNames = extractModules(content);
	for (let moduleName of moduleNames) {
		if (moduleName === _module) {
			return true;
		}
	}
	return false;
};

const moduleExistsInFile = function (entryId, module, cb) {
	return new Promise(async (resolve, reject) => {
		const FileManager = require("../controllers/file_manager");
		const Repo = require("../controllers/repo");
		return Repo.getRepoEntry({
			_id: entryId
		}, function (err, entry) {
			if (err) {
				return reject(err);
			} else if (!entry) {
				return reject({
					error: 'Source file does not exist.'
				});
			} else {
				return FileManager.getFileContent(entry, function (err, content) {
					if (err) {
						return reject(err);
					} else {
						return resolve(moduleExists(content, module));
					}
				});
			}
		});
	}).then(wrapResolveCallback(cb)).catch(cb);
};




module.exports = {
	extractModules,
	moduleExists,
	moduleExistsInFile
};