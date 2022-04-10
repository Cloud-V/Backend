const EventEmitter = require("events");
const fs = require("fs");

class GridWriteStream extends EventEmitter {
    constructor(db, options = {}) {
        super(options);
        this.db = db;
        this.filename = "gridfs-files/" + options.filename || "untitled.txt";
    }
    write(chunk) {
        this.db
            .createFile({
                filename: this.filename,
                contentType: "text",
                length: 0,
            })
            .then((file) => {
                fs.writeFile(this.filename, chunk, (err) => {
                    if (err) {
                        //TODO: Remove file from database
                        this.emit("error", err);
                        return;
                    }
                    this.emit("close", file);
                });
            })
            .catch((err) => {
                this.emit("error", err);
            });
    }
    end() {}
}

module.exports = exports = GridWriteStream;
