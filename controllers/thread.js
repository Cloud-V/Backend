const Grid = require("gridfs-stream");
const mongoose = require("../config/db");
const dbfs = require("../config/dbfs");
const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const rmdir = require("rimraf");
const async = require("async");
const shortid = require("shortid");

const { Readable } = require("stream");

const getComments = (entryId, cb) => cb(null, []);

const getDiscussionThreads = function () {};

module.exports = {
    getComments,
    getDiscussionThreads,
};
