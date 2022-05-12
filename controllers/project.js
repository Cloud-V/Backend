const User = require("./user");
const Organization = require("./organization");

const Utils = require("../models/utils");
const mongoose = require("../config/db");
const { UserType } = require("../models/user");
let { AccessLevel } = require("../models/project_access");
const { AccessLevel } = require("../models/organization_access");
const { VisibilityType } = require("../models/project");

const _ = require("underscore");
const shortid = require("shortid");

const createProject = function (project, cb) {
    const projectModel = require("../models/project").model;
    let newProject = new projectModel();
    newProject.title = project.title;
    if (newProject.title != null) {
        newProject.name = newProject.title.trim().toLowerCase();
    }
    newProject.owner = project.owner;
    newProject.team = project.team;

    if (project.visibilty) {
        newProject.visibilty = project.visibilty;
    }
    if (project.repoVisibilty) {
        newProject.repoVisibilty = project.repoVisibilty;
    }

    newProject.description = "";

    newProject = _.extend(
        newProject,
        _.pick(_.omit(project, Utils.nonCloneable), _.pickSchema(projectModel))
    );

    if (typeof project.prefix !== "string" || !project.prefix.length) {
        newProject.prefix = newProject.name;
    } else {
        newProject.prefix = project.prefix;
    }

    const projectUser = {
        username: newProject.name,
        password: `Org_pa55_${shortid.generate()}${shortid.generate()}`,
        email: `${newProject.name}@cloudv-project.io`,
        type: UserType.Project,
    };
    return User.createUser(projectUser, function (err, user) {
        if (err) {
            return cb(err);
        } else {
            newProject.user = user._id;
            return newProject.save(function (err, project) {
                if (err) {
                    if (
                        err.name != null &&
                        err.name === "ValidationError" &&
                        err.errors != null
                    ) {
                        let errorMessage = "";
                        for (let validationPath in err.errors) {
                            const validationError = err.errors[validationPath];
                            errorMessage = `${errorMessage}${validationError.message}\n`;
                        }
                        if (errorMessage.trim() !== "") {
                            return cb({
                                error: errorMessage,
                            });
                        } else {
                            console.error(err);
                            return cb({
                                error: "An error occurred while creating the project.",
                            });
                        }
                    } else {
                        console.error(err);
                        return cb({
                            error: "An error occurred while creating the project.",
                        });
                    }
                } else {
                    return assignRole(
                        newProject._id,
                        newProject.owner,
                        AccessLevel.Owner,
                        function (err, role) {
                            if (err) {
                                cb(err);
                                return newProject.remove(function (err) {
                                    if (err) {
                                        return console.error(err);
                                    }
                                });
                            } else {
                                return cb(null, newProject);
                            }
                        }
                    );
                }
            });
        }
    });
};

var assignRole = function (projectId, userId, level, cb) {
    const accessModel = require("../models/project_access").model;
    const newRole = new accessModel();
    newRole.project = projectId;
    newRole.user = userId;
    newRole.accessLevel = level;
    return newRole.save(function (err) {
        if (err) {
            if (
                err.name != null &&
                err.name === "ValidationError" &&
                err.errors != null
            ) {
                let errorMessage = "";
                for (let validationPath in err.errors) {
                    const validationError = err.errors[validationPath];
                    errorMessage = `${errorMessage}${validationError.message}\n`;
                }
                if (errorMessage.trim() !== "") {
                    return cb({
                        error: errorMessage,
                    });
                } else {
                    console.error(err);
                    return cb({
                        error: "An error occurred while assigning the user role.",
                    });
                }
            } else {
                console.error(err);
                return cb({
                    error: "An error occurred while assigning the user role.",
                });
            }
        } else {
            return cb(null, newRole);
        }
    });
};

const getProject = function (query, cb) {
    if (query == null) {
        query = {};
    }
    query.deleted = false;

    if (query.title != null) {
        if (query.name == null) {
            query.name = query.title;
        }
        query.title = query.title.trim();
    }
    if (query.name != null) {
        query.name = query.name.trim().toLowerCase();
    }

    return mongoose
        .model("Project")
        .findOne(query)
        .sort({
            created: -1,
        })
        .exec(function (err, project) {
            if (err) {
                console.error(err);
                return cb({
                    error: "An error occurred while retrieving the project.",
                });
            } else {
                return cb(null, project);
            }
        });
};

const getProjects = function (query, cb) {
    if (query == null) {
        query = {};
    }
    query.deleted = false;

    if (query.title != null) {
        if (query.name == null) {
            query.name = query.title;
        }
        query.title = query.title.trim();
    }
    if (query.name != null) {
        query.name = query.name.trim().toLowerCase();
    }

    return mongoose
        .model("Project")
        .find(query)
        .sort({
            created: -1,
        })
        .exec(function (err, projects) {
            if (err) {
                console.error(err);
                return cb({
                    error: "An error occurred while retrieving the project.",
                });
            } else {
                return cb(null, projects);
            }
        });
};

const getProjectRoleEntry = function (query, cb) {
    if (query == null) {
        query = {};
    }
    const roleModel = mongoose.model("ProjectAccess");
    Organization = require("./organization");
    query.deleted = false;
    return roleModel.findOne(query, function (err, role) {
        if (err) {
            console.error(err);
            return cb({
                error: "An error occurred while retrieve project permissions.",
            });
        } else {
            return cb(null, role);
        }
    });
};

const getAccessibleProjects = function (query, userId, cb) {
    if (query.title != null) {
        if (query.name == null) {
            query.name = query.title;
        }
        query.title = query.title.trim();
    }
    if (query.name != null) {
        query.name = query.name.trim().toLowerCase();
    }
    return getProjects(query, cb);
};

module.exports = {
    createProject,
    getProject,
    getProjects,
    getAccessibleProjects,
};
