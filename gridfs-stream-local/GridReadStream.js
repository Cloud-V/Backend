const db = require("./Database")
const EventEmitter = require("events");
const fs = require("fs");

class GridReadStream extends EventEmitter {
  constructor(options = {}) {
    super(options);
    this._id = options._id || "";
  }

  run() {
    let self = this;
    db.getFile(this._id).then(file => {
      fs.readFile(file.filename, (err, data) => {
        if (err) {
          self.emit("error", err);
          return;
        }
        self.emit("data", data);
        self.emit("end");
      })
    }).catch(err => {
      self.emit("error", err);
    })


  }
}

module.exports = exports = GridReadStream;
