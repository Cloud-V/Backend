const uri = require(".").fsDBUri;
const mongoose = require("mongoose");


const catchFn = err => {
	console.error(err);
	process.exit(1);
}

let connection = mongoose.createConnection(uri, {
	useNewUrlParser: true
});

connection.catch(catchFn);

module.exports = connection;