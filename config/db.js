const uri = require(".").usersDBUri;

const mongoose = require("mongoose");

mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);

const catchFn = err => {
	console.error(err);
	process.exit(1);
};

let connection = mongoose.createConnection(uri, {
	connectTimeoutMS: 50000,
	useNewUrlParser: true
});

connection.catch(catchFn);

module.exports = connection;
