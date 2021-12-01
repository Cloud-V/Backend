'use strict';
const config = require("../../../config");

module.exports = config.lambda.local ? require("./local.js") : require("./online.js");