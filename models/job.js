const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const JobType = {
    Unknown: 0,
    Synthesis: 1,
    Simulation: 2,
    FileValidation: 3,
    ProjectValidation: 4,
};

const JobStatus = {
    Unknown: 0,
    Queued: 1,
    InProgress: 2,
    Completed: 3,
    Paused: 4,
    Cancelled: 5,
};

const jobSchema = new Schema(
    {
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        type: {
            type: Number,
            required: true,
            default: JobType.Unknown,
        },
        status: {
            type: Number,
            required: true,
            default: JobStatus.Unknown,
        },
        target: {
            type: ObjectId,
            required: true,
        },
        data: {
            type: String,
            default: "",
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

jobSchema.methods.getUser = function (cb) {
    const User = require("../controllers/user");
    return User.getUser(
        {
            _id: this.user,
        },
        cb
    );
};

jobSchema.virtual("typeName").get(function () {
    if (this.type === JobType.Synthesis) {
        return "synthesis";
    } else if (this.type === JobType.Simulation) {
        return "simulation";
    } else if (this.type === JobType.Validation) {
        return "validation";
    } else {
        return `unknown`;
    }
});
module.exports = {
    model: mongoose.model("Job", jobSchema),
    JobType,
    JobStatus,
};
