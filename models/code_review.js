const mongoose = require("../config/db");

const { Schema } = require("mongoose");

const { ObjectId } = Schema;

const ReviewState = {
    Ignored: 0,
    Approved: 1,
    Disapproved: 2,
};

const autoIncrement = require("../modules/mongoose-auto-increment");
autoIncrement.initialize(mongoose);

const reviewSchema = new Schema(
    {
        repoEntry: {
            type: ObjectId,
            required: true,
            ref: "RepoEntry",
        },
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        state: {
            type: Number,
            required: true,
            default: ReviewState.Ignored,
        },
        title: {
            type: String,
            default: "",
        },
        content: {
            type: String,
            default: "",
        },
        code: {
            type: String,
            default: "",
        },
        seq: {
            type: Number,
            default: 0,
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

reviewSchema.path("state").validate(function (approved) {
    let needle;
    return (
        (needle = approved),
        Array.from(
            (() => {
                const result = [];
                for (let key in ReviewState) {
                    const value = ReviewState[key];
                    result.push(value);
                }
                return result;
            })()
        ).includes(needle)
    );
}, "Invalid state.");
reviewSchema.methods.getUser = function (cb) {
    const User = require("../controllers/user");
    return User.getUser(
        {
            _id: this.user,
        },
        function (err, user) {
            if (err) {
                return cb(err);
            } else {
                delete user.password;
                return cb(null, user);
            }
        }
    );
};

reviewSchema.methods.approve = function (cb) {
    const CodeReview = require("../controllers/code_review");
    return CodeReview.approveReview(this._id, cb);
};

reviewSchema.methods.disapprove = function (cb) {
    const CodeReview = require("../controllers/code_review");
    return CodeReview.disapproveReview(this._id, cb);
};

reviewSchema.methods.delete = function (cb) {
    const CodeReview = require("../controllers/code_review");
    return CodeReview.removeReview(this._id, cb);
};

reviewSchema.plugin(autoIncrement.plugin, {
    model: "CodeReview",
    field: "seq",
    startAt: 1,
    baseIdField: "repoEntry",
    unique: false,
});

module.exports = {
    model: mongoose.model("CodeReview", reviewSchema),
    ReviewState,
};
