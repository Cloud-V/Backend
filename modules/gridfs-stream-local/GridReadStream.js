const EventEmitter = require("events");
const fs = require("fs");

class GridReadStream extends EventEmitter {
    constructor(db, options = {}) {
        super(options);
        this.db = db;
        this._id = options._id || "";
    }

    run() {
        this.db
            .getFile(this._id)
            .then((file) => {
                fs.readFile(file.filename, (err, data) => {
                    if (err) {
                        this.emit("error", err);
                        this.emit("close");
                        return;
                    }
                    this.emit("data", data);
                    this.emit("close");
                });
            })
            .catch((err) => {
                this.emit("error", err);
                this.emit("close");
            });
    }
}

module.exports = exports = GridReadStream;
