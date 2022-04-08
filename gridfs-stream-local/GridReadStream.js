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
      console.log("Before Big Error:", file)
      fs.readFile(file.filename, (err, data) => {
        if (err) {
          self.emit("error", "Big Error 1" + err);
          self.emit("close");
          return;
        }
        self.emit("data", data);
        self.emit("close");
      })
    }).catch(err => {
      self.emit("error", "Big Error 2" + err);
      self.emit("close");
    })

  }
}

module.exports = exports = GridReadStream;
