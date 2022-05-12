const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const AccessLevel = {
    NoAccess: 0, // No access
    ReadOnly: 1, // Can read all repositories
    ReadWrite: 2, // Can write to all repositories
    Admin: 3, // Can administer teams
    Owner: 4, // Organization owner
};

const organizationAccessSchema = new Schema(
    {
        organization: {
            type: ObjectId,
            required: true,
            ref: "Organization",
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

organizationAccessSchema.path("accessLevel").validate(function (access) {
    let needle;
    return (
        (needle = access),
        Array.from(
            (() => {
                const result = [];
                for (let key in AccessLevel) {
                    const value = AccessLevel[key];
                    result.push(value);
                }
                return result;
            })()
        ).includes(needle)
    );
}, "Invalid access level.");

module.exports = {
    model: mongoose.model("OrganizationAccess", organizationAccessSchema),
    AccessLevel,
};
