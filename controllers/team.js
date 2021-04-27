const Utils = require("../models/utils");
const mongoose = require("../config/db");
const { UserType } = require("../models/user");
const { AccessLevel } = require("../models/team_access");

const _ = require("underscore");
const async = require("async");
const shortid = require("shortid");

const createTeam = function (team, cb) {
	const teamModel = require("../models/team").model;
	let newTeam = new teamModel();
	newTeam.title = team.title;
	if (newTeam.title != null) {
		newTeam.name = newTeam.title.trim().toLowerCase();
	}
	newTeam.owner = team.owner;
	newTeam.organization = team.organization;


	if (team.visibilty) {
		newTeam.visibilty = team.visibilty;
	}
	if (team.repoVisibilty) {
		newTeam.repoVisibilty = team.repoVisibilty;
	}

	newTeam.description = '';

	newTeam = _.extend(newTeam, _.pick(_.omit(team, Utils.nonCloneable), _.pickSchema(teamModel)));

	if ((typeof team.prefix !== 'string') || (!team.prefix.length)) {
		newTeam.prefix = newTeam.name;
	} else {
		newTeam.prefix = team.prefix;
	}

	const teamUser = {
		username: newTeam.name,
		password: `Org_pa55_${shortid.generate()}${shortid.generate()}`,
		email: `${newTeam.name}@cloudv-team.io`,
		type: UserType.Team
	};
	return User.createUser(teamUser, function (err, user) {
		if (err) {
			return cb(err);
		} else {
			newTeam.user = user._id;
			return newTeam.save(function (err, team) {
				if (err) {
					if ((err.name != null) && (err.name === 'ValidationError') && (err.errors != null)) {
						let errorMessage = '';
						for (let validationPath in err.errors) {
							const validationError = err.errors[validationPath];
							errorMessage = `${errorMessage}${validationError.message}\n`;
						}
						if (errorMessage.trim() !== '') {
							return cb({
								error: errorMessage
							});
						} else {
							console.error(err);
							return cb({
								error: 'An error occurred while creating the team.'
							});
						}
					} else {
						console.error(err);
						return cb({
							error: 'An error occurred while creating the team.'
						});
					}
				} else {
					return assignRole(newTeam._id, newTeam.owner, AccessLevel.Owner,
						function (err, role) {
							if (err) {
								cb(err);
								return newTeam.remove(function (err) {
									if (err) {
										return console.error(err);
									}
								});
							} else {
								return cb(null, newTeam);
							}
						});
				}
			});
		}
	});
};

var assignRole = function (teamId, userId, level, cb) {
	const accessModel = require("../models/team_access").model;
	const newRole = new accessModel();
	newRole.team = teamId;
	newRole.user = userId;
	newRole.accessLevel = level;
	return newRole.save(function (err) {
		if (err) {
			if ((err.name != null) && (err.name === 'ValidationError') && (err.errors != null)) {
				let errorMessage = '';
				for (let validationPath in err.errors) {
					const validationError = err.errors[validationPath];
					errorMessage = `${errorMessage}${validationError.message}\n`;
				}
				if (errorMessage.trim() !== '') {
					return cb({
						error: errorMessage
					});
				} else {
					console.error(err);
					return cb({
						error: 'An error occurred while assigning the user role.'
					});
				}
			} else {
				console.error(err);
				return cb({
					error: 'An error occurred while assigning the user role.'
				});
			}
		} else {
			return cb(null, newRole);
		}
	});
};

const getTeam = function (query, cb) {
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	if (query.title != null) {
		if ((query.name == null)) {
			query.name = query.title;
		}
		query.title = query.title.trim();
	}
	if (query.name != null) {
		query.name = query.name.trim().toLowerCase();
	}

	return mongoose.model('Team').findOne(query).sort({
		created: -1
	}).exec(function (err, team) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving the team.'
			});
		} else {
			return cb(null, team);
		}
	});
};

const getTeams = function (query, cb) {
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	if (query.title != null) {
		if ((query.name == null)) {
			query.name = query.title;
		}
		query.title = query.title.trim();
	}
	if (query.name != null) {
		query.name = query.name.trim().toLowerCase();
	}

	return mongoose.model('Team').find(query).sort({
		created: -1
	}).exec(function (err, teams) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving the teams.'
			});
		} else {
			return cb(null, teams);
		}
	});
};

const getTeamRoleEntry = function (query, cb) {
	if (query == null) {
		query = {};
	}
	const roleModel = mongoose.model('TeamAccess');
	query.deleted = false;
	return roleModel.findOne(query, function (err, role) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieve team permissions.'
			});
		} else {
			return cb(null, role);
		}
	});
};
const getTeamRoleEntries = function (query, cb) {
	if (query == null) {
		query = {};
	}
	const roleModel = mongoose.model('TeamAccess');
	query.deleted = false;
	return roleModel.find(query, function (err, roles) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieve team permissions.'
			});
		} else {
			return cb(null, roles);
		}
	});
};

const getAccessibleTeams = function (query, userId, cb) {
	if (query.title != null) {
		if ((query.name == null)) {
			query.name = query.title;
		}
		query.title = query.title.trim();
	}
	if (query.name != null) {
		query.name = query.name.trim().toLowerCase();
	}
	return getTeams(query, cb);
};

const getTeamMembers = function (team, cb) {
	User = require("./user");
	return team.getUser(function (err, owner) {
		if (err) {
			return cb(err);
		}
		const contributors = [];
		let contributor = {};
		contributor[owner.username] = 'Owner';
		contributors.push(contributor);
		return getTeamRoleEntries({
			team: team._id
		}, function (err, roles) {
			if (err) {
				return cb(err);
			} else {
				return async.each(roles, (function (role, callback) {
					if (role.accessLevel === AccessLevel.Owner) {
						return callback();
					} else {
						return User.getUser({
							_id: role.user
						}, function (err, user) {
							if (err) {
								return callback(err);
							} else {
								contributor = {};
								if (role.accessLevel === AccessLevel.NoAccess) {
									contributor[user.username] = 'NoAccess';
									contributors.push(contributor);
									return callback();
								} else if (role.accessLevel === AccessLevel.ReadOnly) {
									contributor[user.username] = 'ReadOnly';
									contributors.push(contributor);
									return callback();
								} else if (role.accessLevel === AccessLevel.ReadWrite) {
									contributor[user.username] = 'ReadWrite';
									contributors.push(contributor);
									return callback();
								} else if (role.accessLevel === AccessLevel.Admin) {
									contributor[user.username] = 'Admin';
									contributors.push(contributor);
									return callback();
								}
							}
						});
					}
				}), err => cb(null, contributors));
			}
		});
	});
};

const updateUserRole = (teamId, userId, level, cb) =>
	getTeamRoleEntry({
		team: teamId,
		user: userId
	}, function (err, role) {
		if (err) {
			return cb(err);
		} else if (!role) {
			return cb({
				error: "Cannot find user role."
			});
		} else {
			return updateRole(role._id, {
				accessLevel: level
			}, cb);
		}
	});
var updateRole = (roleId, updates, cb) =>
	getTeamRoleEntry({
			_id: roleId
		},
		function (err, role) {
			if (err) {
				return cb(err);
			} else if (!role) {
				return cb({
					error: 'Cannot find targeted role.'
				});
			} else {
				if (updates.accessLevel != null) {
					let needle;
					if ((needle = updates.accessLevel, !Array.from(((() => {
							const result = [];
							for (let k in AccessLevel) {
								const vals = AccessLevel[k];
								result.push(vals);
							}
							return result;
						})())).includes(needle))) {
						return cb({
							error: 'Invalid role.'
						});
					} else {
						role.accessLevel = updates.accessLevel;
					}
				}
				if ((updates.deleted != null) && updates.deleted) {
					role.deleted = true;
				}
				return role.save(function (err, savedRole) {
					if (err) {
						if ((err.name != null) && (err.name === 'ValidationError') && (err.errors != null)) {
							let errorMessage = '';
							for (let validationPath in err.errors) {
								const validationError = err.errors[validationPath];
								errorMessage = `${errorMessage}${validationError.message}\n`;
							}
							if (errorMessage.trim() !== '') {
								return cb({
									error: errorMessage
								});
							} else {
								console.error(err);
								return cb({
									error: 'An error occurred while updating the permissions.'
								});
							}
						} else {
							console.error(err);
							return cb({
								error: 'An error occurred while updating the permissions.'
							});
						}
					} else {
						return cb(null, savedRole);
					}
				});
			}
		});
const removeRole = (roleId, cb) => updateRole(roleId, {
	deleted: true
}, cb);
module.exports = {
	createTeam,
	assignRole,
	getTeam,
	getTeamRoleEntry,
	getTeamRoleEntries,
	getAccessibleTeams,
	getTeamMembers,
	updateUserRole,
	updateRole,
	removeRole
};