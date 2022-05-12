const mongoose = require("../config/db");

const _ = require("underscore");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const AccessLevel = {
    NoAccess: 0,
    ReadOnly: 1,
    ReadWrite: 2,
    Owner: 3,
};

const repoAccessSchema = new Schema(
    {
        repo: {
            type: ObjectId,
            required: true,
            ref: "Repo",
        },
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        accessLevel: {
            type: Number,
            required: true,
            default: AccessLevel.NoAccess,
            enum: _.values(AccessLevel),
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

repoAccessSchema.virtual("levelName").get(function () {
    return _.invert(AccessLevel)[this.accessLevel] || "NoAccess";
});

module.exports = {
    model: mongoose.model("RepoAccess", repoAccessSchema),
    AccessLevel,
};
