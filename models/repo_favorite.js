const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const favoriteSchema = new Schema(
    {
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        repo: {
            type: ObjectId,
            required: true,
            ref: "Repo",
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

favoriteSchema.methods.getUser = function (cb) {
    const User = require("../controllers/user");
    return User.getUser(
        {
            _id: this.user,
        },
        cb
    );
};

favoriteSchema.methods.getRepo = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepo(
        {
            _id: this.repo,
        },
        cb
    );
};

module.exports = {
    model: mongoose.model("Favorite", favoriteSchema),
};
