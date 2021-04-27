const {	wrapResolveCallback } = require("./utils");

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


var moduleExists = function (content, module) {
	const commentsRegEx = () => new RegExp('\\/\\/.*$', 'gm');
	const multiCommentsRegEx = () => new RegExp('\\/\\*(.|[\\r\\n])*?\\*\\/', 'gm');
	const moduleRegEx = () => new RegExp('^\\s*module\\s+(.+?)\\s*(#\\s*\\(([\\s\\S]+?)\\)\\s*)??\\s*((\\([\\s\\S]*?\\))?\\s*;)([\\s\\S]*?)endmodule', 'gm');

	content = content.replace(commentsRegEx(), '').replace(multiCommentsRegEx(), '');
	const extractionRegEx = moduleRegEx();
	let moduleMatches = extractionRegEx.exec(content);
	while (moduleMatches !== null) {
		const moduleName = moduleMatches[1];
		if (moduleName === module) {
			return true;
		}
		moduleMatches = extractionRegEx.exec(content);
	}
	return false;
};

const extractModules = function (content) {
	const commentsRegEx = () => new RegExp('\\/\\/.*$', 'gm');
	const multiCommentsRegEx = () => new RegExp('\\/\\*(.|[\\r\\n])*?\\*\\/', 'gm');
	const moduleRegEx = () => new RegExp('^\\s*module\\s+(.+?)\\s*(#\\s*\\(([\\s\\S]+?)\\)\\s*)??\\s*((\\([\\s\\S]*?\\))?\\s*;)\\s*$', 'gm');

	content = content.replace(commentsRegEx(), '').replace(multiCommentsRegEx(), '');
	const extractionRegEx = moduleRegEx();
	let moduleMatches = extractionRegEx.exec(content);
	const moduleNames = [];
	while (moduleMatches !== null) {
		if (moduleMatches[1] != null) {
			moduleNames.push(moduleMatches[1]);
		}
		moduleMatches = extractionRegEx.exec(content);
	}
	return moduleNames;
};

module.exports = {
	moduleExists,
	moduleExistsInFile,
	extractModules
};