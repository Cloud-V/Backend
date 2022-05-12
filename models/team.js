const mongoose = require("../config/db");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const VisibiltyType = {
    Private: 0, // Only visisble to team members
    Internal: 1, // Visible to organization/team member
    Public: 2, // Visible to the public
};

const prohibitedNames = [
    "authorize",
    "new",
    "clone",
    "settings",
    "ws",
    "member",
    "members",
    "delete",
    "repo",
    "repository",
];

const teamSchema = new Schema(
    {
        name: {
            type: String,
            required: "You must provide a valid name for the team.",
            lowercase: true,
        },
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
        owner: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        organization: {
            type: ObjectId,
            required: true,
            ref: "Organization",
        },
        visibilty: {
            type: Number,
            required: true,
            default: VisibiltyType.Internal,
        },
        repoVisibilty: {
            type: Number,
            required: true,
            default: VisibiltyType.Internal,
        },
        enforcePrefix: {
            type: Boolean,
            required: true,
            default: false,
        },
        prefix: {
            type: String,
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

teamSchema
    .path("name")
    .validate(
        (name) => /^\w+$/gm.test(name),
        "The team name can only contain letters, numbers and underscores."
    );

teamSchema.path("name").validate(function (name) {
    let needle;
    return (
        typeof name === "string" &&
        name.length &&
        ((needle = name.toLowerCase()),
        !Array.from(prohibitedNames).includes(needle))
    );
}, "Invalid team name.");

teamSchema.methods.getRoleEntry = function (query, cb) {
    const Team = require("../controllers/team");
    query.team = this._id;
    return Team.getTeamRoleEntry(query, cb);
};

teamSchema.methods.getUser = function (cb) {
    const User = require("../controllers/user");
    const thisOwner = this.owner;
    return User.getUser(
        {
            _id: thisOwner,
        },
        function (err, user) {
            if (err) {
                return cb(err);
            } else if (!user) {
                return cb({
                    error: "Invalid team data.",
                });
            } else {
                return cb(null, user);
            }
        }
    );
};
teamSchema.methods.getMembers = function (cb) {
    const Team = require("../controllers/team");
    return Team.getTeamMembers(this, cb);
};

teamSchema.methods.authorize = function (username, authorizerLevel, level, cb) {
    const User = require("../controllers/user");
    const Team = require("../controllers/team");
    const teamId = this._id;
    const TeamAccessLevel = require("./organization_access").AccessLevel;
    const { UserType } = require("./user");
    return User.getUser(
        {
            username,
        },
        function (err, user) {
            if (err) {
                return cb(err);
            } else if (!user || user.type !== UserType.Regular) {
                return cb({
                    error: `User ${username} does not exist.`,
                });
            } else {
                return Team.getTeamRoleEntry(
                    {
                        team: teamId,
                        user: user._id,
                    },
                    function (err, role) {
                        if (err) {
                            return cb(err);
                        } else if (!role) {
                            return Team.assignRole(teamId, user._id, level, cb);
                        } else if (role.accessLevel === TeamAccessLevel.Owner) {
                            return cb({
                                error: "Cannot update owner's role.",
                            });
                        } else {
                            if (authorizerLevel < role.accessLevel) {
                                return cb({
                                    error: "Unauthorized to update this user's role",
                                });
                            }
                            return Team.updateUserRole(
                                teamId,
                                user._id,
                                level,
                                cb
                            );
                        }
                    }
                );
            }
        }
    );
};
teamSchema.methods.deauthorize = function (username, authorizerLevel, cb) {
    const User = require("../controllers/user");
    const Team = require("../controllers/team");
    const teamId = this._id;
    const TeamAccessLevel = require("./organization_access").AccessLevel;
    return User.getUser(
        {
            username,
        },
        function (err, user) {
            if (err) {
                return cb(err);
            } else if (!user) {
                return cb({
                    error: `User ${username} does not exist.`,
                });
            } else {
                return Team.getTeamRoleEntry(
                    {
                        team: teamId,
                        user: user._id,
                    },
                    function (err, role) {
                        if (err) {
                            return cb(err);
                        } else if (!role) {
                            return cb({
                                error: "Role does not exist.",
                            });
                        } else if (role.accessLevel === TeamAccessLevel.Owner) {
                            return cb({
                                error: "Cannot remove owner's role.",
                            });
                        } else {
                            if (authorizerLevel < role.accessLevel) {
                                return cb({
                                    error: "Unauthorized to update this user's role",
                                });
                            }
                            return Team.removeRole(role._id, cb);
                        }
                    }
                );
            }
        }
    );
};

module.exports = {
    model: mongoose.model("Team", teamSchema),
};
