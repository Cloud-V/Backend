const fs = require("fs-extra");
const path = require("path");

module.exports = fs.readdirSync(path.join(__dirname, "functions"));