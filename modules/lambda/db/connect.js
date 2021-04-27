const mongoose = require("mongoose");
const Grid = require("gridfs-stream");


let usersConn = null;
let fsConn = null;

module.exports =
	async function connect(usersUri, fsUri) {
		return new Promise(async (resolve, reject) => {
			try {
				if (usersConn && fsConn) {
					return resolve({
						userConnection: usersConn,
						fsConnection: fsConn
					});
				}
				usersConn = await require("./config/db");
				fsConn = await require("./config/dbfs");
				Grid.mongo = mongoose.mongo;
				return resolve({
					userConnection: usersConn,
					fsConnection: fsConn
				});
			} catch (err) {
				return reject(err);
			}
		})
	}