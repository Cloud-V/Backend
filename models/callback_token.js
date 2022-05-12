"use strict";

const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const shortid = require("shortid");
const _ = require("underscore");

const CallbackType = {
    Unknown: 0,
    Synthesis: 1,
    Validation: 2,
    Simulation: 3,
    SimulationNetlist: 4,
    Compilation: 5,
};

const defaultValidty = 43200; //12 hours

const callbackTokenSchema = new Schema(
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
        entry: {
            type: ObjectId,
            required: true,
            ref: "RepoEntry",
        },
        reportEntry: {
            type: ObjectId,
            required: true,
            ref: "RepoEntry",
        },
        value: {
            type: String,
            required: true,
            default: shortid.generate,
        },
        callbackUrl: {
            type: String,
        },
        jobType: {
            type: Number,
            default: CallbackType.Unknown,
            required: true,
        },
        resultBucket: {
            type: String,
            required: true,
        },
        resultPath: {
            type: String,
            required: true,
        },
        jobName: {
            type: String,
        },
        jobId: {
            type: String,
        },
        created: {
            type: Date,
            required: true,
            default: Date.now,
        },
        duration: {
            type: Number,
            required: true,
            default: defaultValidty,
        },
        consumed: {
            type: Boolean,
            required: true,
            default: false,
        },
        expired: {
            type: Boolean,
            required: true,
            default: false,
        },
        version: {
            type: Number,
            required: true,
            default: 0,
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

callbackTokenSchema.methods.isValid = function (cb) {
    if (this.consumed) {
        return cb(
            {
                error: "Token has already beeen used.",
            },
            false
        );
    } else if (
        this.expired ||
        (Date.now() - this.created) / 1000 > this.duration
    ) {
        return cb(
            {
                error: "This token has expired.",
            },
            false
        );
    } else {
        return cb(null, true);
    }
};

module.exports = {
    model: mongoose.model("CallbackToken", callbackTokenSchema),
    defaultValidty,
    CallbackType,
};
