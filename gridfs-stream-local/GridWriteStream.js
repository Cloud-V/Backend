const db = require("./Database")
const EventEmitter = require("events");
const fs = require("fs");

class GridWriteStream extends EventEmitter {
  constructor(options = {}) {
    super(options);
    this.filename = "gridfs-files/" + options.filename || "untitled.txt";
  }
  write(chunck) {

    let self = this;
    console.log("run")
    db.createFile({ filename: this.filename, contentType: "text", length: 0 }).then((file) => {
      fs.writeFile(this.filename, chunck, err => {
        if (err) {
          //TODO: Remove file from database
          self.emit("error", err);
          return;
        }
        console.log("File Created 1: ", file)
        self.emit("close", file);
      });
    }).catch(err => {
      self.emit("error", err)
    });
  }
  end() {
    // console.log("ENDING")
  }
}

module.exports = exports = GridWriteStream;
