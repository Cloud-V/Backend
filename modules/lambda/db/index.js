const fs = require("fs-extra");
const _ = require("underscore");
const path = require("path");


module.exports = async () => {
	_.mixin({
		pickSchema(model, excluded) {
			const fields = [];
			const addedNests = {};
			model.schema.eachPath(function (path) {
				if (path.indexOf('.') !== -1) {
					const root = path.substr(0, path.indexOf('.'));
					if (addedNests[root] == null) {
						fields.push(root);
						addedNests[root] = 1;
					}
				}
				if (_.isArray(excluded)) {
					if (excluded.indexOf(path) < 0) {
						return fields.push(path);
					} else {
						return false;
					}
				} else if (path === excluded) {
					return false;
				} else {
					return fields.push(path);
				}
			});
			return fields;
		}
	});
	const dirs = await fs.readdir(path.join(__dirname, 'models'));
	dirs.forEach(elem => {
		require(`./${path.join('models', elem)}`).model;
	});
}