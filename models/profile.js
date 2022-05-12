const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const profileSchema = new Schema(
    {
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        generatedAvatar: {
            type: String,
        },
        avatarFile: {
            type: ObjectId,
            ref: "MediaFile",
        },
        avatarURL: {
            type: String,
            default: "",
        },

        gravatarEmail: {
            type: String,
            required: false,
        },
        displayName: {
            type: String,
            default: "",
        },
        personalURL: {
            type: String,
            default: "",
        },
        location: {
            type: String,
            default: "",
        },
        timezone: {
            type: String,
            default: "Africa/Cairo",
        },
        about: {
            type: String,
            default: "",
        },
        dashboardTour: {
            type: Boolean,
            required: true,
            default: false,
        },
        repositoryTour: {
            type: Boolean,
            required: true,
            default: false,
        },
        workspaceTour: {
            type: Boolean,
            required: true,
            default: false,
        },
        allowNotificationsPrompted: {
            type: Boolean,
            required: true,
            default: false,
        },
        allowNotifications: {
            type: Boolean,
            required: true,
            default: false,
        },
        notificationEndpoints: {
            type: [
                {
                    endpointId: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    endpoint: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    valid: {
                        type: Boolean,
                        required: true,
                        default: false,
                    },
                    auth: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    p256dh: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                },
            ],
            default: [],
            required: true,
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

profileSchema.methods.getUser = function (cb) {
    const User = require("../controllers/user");
    return User.getUser(
        {
            _id: this.user,
        },
        cb
    );
};

module.exports = {
    model: mongoose.model("Profile", profileSchema),
};
