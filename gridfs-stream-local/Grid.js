const db = require("./Database")
const GridWriteStream = require("./GridWriteStream");
const GridReadStream = require("./GridReadStream");
const fs = require("fs");
const EventEmitter = require("events");

function Grid() { }

Grid.prototype.createWriteStream = function (options) {
  return new GridWriteStream(options);
};

Grid.prototype.createReadStream = function (options) {
  return new GridReadStream(options);
}
Grid.prototype.remove = function (options, cb) {
  if (options._id) {
    db.getFile(options._id).then(file => {
      fs.unlink(file.filename, (err) => {
        if (err) {
          console.log("File could not be deleted", err)
          cb(err)
        }
      });
    }).catch(err => {
      console.log("Error removing file: ", err)
      cb(err)
      return err;
    })
  }
  cb(null)
  // return resolve({"File deleted successfully."});
}
module.exports = exports = Grid;