"use strict";

const { Schema } = require("mongoose");

//Schema definition
const filesSchema = new Schema({
    filename: String,
    uploadDate: { type: Date, default: Date.now() },
    contentType: String,
    length: Number,
});

class Database {
    constructor(connection) {
        this.db = connection;
        this.db.on(
            "error",
            console.error.bind(console, "MongoDB connection error:")
        );

        this.File = this.db.model("files", filesSchema);
    }

    async createFile(path) {
        let file = new this.File(path);
        let entry = await file.save();
        return entry;
    }

    async getFile(id) {
        let entry = await this.File.findOne({ _id: id });
        return entry;
    }
}

module.exports = Database;
