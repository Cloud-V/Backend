const mongoose = require("../config/db");

const { Schema } = require("mongoose");

const { ObjectId } = Schema;

const mediaFileSchema = new Schema(
    {
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
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
        fsId: {
            type: ObjectId,
            required: true,
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

mediaFileSchema.method.getFullPath = function () {
    return require("path").join(this.filePath, this.basename);
};

module.exports = {
    model: mongoose.model("MediaFile", mediaFileSchema),
};
