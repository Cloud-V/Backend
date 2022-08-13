const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const repoFileSchema = new Schema(
    {
        repo: {
            type: ObjectId,
            required: true,
            ref: "Repo",
        },
        repoEntry: {
            type: ObjectId,
            required: true,
            ref: "RepoEntry",
        },
        baseName: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            default: "",
        },
        encoding: {
            type: String,
        },
        extension: {
            type: String,
        },
        fileName: {
            type: String,
            required: true,
        },
        fsId: {
            type: ObjectId,
        },
        created: {
            type: Date,
            required: true,
            default: Date.now,
        },
        deleted: {
            type: Boolean,
            required: true,
            default: false,
        },
    },
    {
        timestamps: {
            createdAt: "createdAt",
            updatedAt: "updatedAt",
        },
    }
);

repoFileSchema.method.getFullPath = function () {
    return require("path").join(this.filePath, this.basename);
};

module.exports = {
    model: mongoose.model("RepoFile", repoFileSchema),
};
