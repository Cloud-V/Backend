const User = require("./user");

const Utils = require("../models/utils");
const mongoose = require("../config/db");
const { UserType } = require("../models/user");
const { AccessLevel } = require("../models/organization_access");

const _ = require("underscore");
const async = require("async");
const shortid = require("shortid");
const pluralize = require("pluralize");

const createOrganization = function (organization, cb) {
	const organizationModel = require("../models/organization").model;
	let newOrganization = new organizationModel();
	newOrganization.title = organization.title;
	if (newOrganization.title != null) {
		newOrganization.name = newOrganization.title.trim().toLowerCase();
	}
	newOrganization.owner = organization.owner;

	newOrganization.description = '';

	newOrganization = _.extend(newOrganization, _.pick(_.omit(organization, Utils.nonCloneable), _.pickSchema(organizationModel)));

	if ((typeof organization.prefix !== 'string') || (!organization.prefix.length)) {
		newOrganization.prefix = newOrganization.name;
	} else {
		newOrganization.prefix = organization.prefix;
	}


	const orgUser = {
		username: newOrganization.name,
		password: `Org_pa55_${shortid.generate()}${shortid.generate()}`,
		email: `${newOrganization.name}@cloudv-organization.io`,
		type: UserType.Organization
	};

	if (((organization.teamTitle == null)) || (!organization.teamTitle.length)) {
		newOrganization.teamTitle = 'Group';
	}
	if (((organization.teamTitleP == null)) || (!organization.teamTitleP.length)) {
		newOrganization.teamTitleP = pluralize.plural(newOrganization.teamTitle);
	}
	if (((organization.projectTitle == null)) || (!organization.projectTitle.length)) {
		newOrganization.projectTitle = 'Project';
	}
	if (((organization.projectTitleP == null)) || (!organization.projectTitleP.length)) {
		newOrganization.projectTitleP = pluralize.plural(newOrganization.projectTitle);
	}
	return User.createUser(orgUser, function (err, user) {
		if (err) {
			return cb(err);
		} else {
			newOrganization.user = user._id;
			return newOrganization.save(function (err, org) {
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
								error: 'An error occurred while creating the organization.'
							});
						}
					} else {
						console.error(err);
						return cb({
							error: 'An error occurred while creating the organization.'
						});
					}
				} else {
					return assignRole(newOrganization._id, newOrganization.owner, AccessLevel.Owner,
						function (err, role) {
							if (err) {
								cb(err);
								return newOrganization.remove(function (err) {
									if (err) {
										return console.error(err);
									}
								});
							} else {
								return cb(null, newOrganization);
							}
						});
				}
			});
		}
	});
};

var assignRole = function (organizationId, userId, level, cb) {
	const accessModel = require("../models/organization_access").model;
	const newRole = new accessModel();
	newRole.organization = organizationId;
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

const getOrganization = function (query, cb) {
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

	return mongoose.model('Organization').findOne(query).sort({
		created: -1
	}).exec(function (err, organization) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving the organization.'
			});
		} else {
			return cb(null, organization);
		}
	});
};
const getOrganizationRoleEntry = function (query, cb) {
	if (query == null) {
		query = {};
	}
	const roleModel = mongoose.model('OrganizationAccess');
	query.deleted = false;
	return roleModel.findOne(query, function (err, role) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieve organization permissions.'
			});
		} else {
			return cb(null, role);
		}
	});
};
const getOrganizationRoleEntries = function (query, cb) {
	if (query == null) {
		query = {};
	}
	const roleModel = mongoose.model('OrganizationAccess');
	query.deleted = false;
	return roleModel.find(query, function (err, role) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieve organization permissions.'
			});
		} else {
			return cb(null, role);
		}
	});
};

const getOrganizationMembers = function (org, cb) {
	User = require("./user");
	return org.getUser(function (err, owner) {
		if (err) {
			return cb(err);
		}
		const contributors = [];
		let contributor = {};
		contributor[owner.username] = 'Owner';
		contributors.push(contributor);
		return getOrganizationRoleEntries({
			organization: org._id
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

const updateUserRole = (organizationId, userId, level, cb) =>
	getOrganizationRoleEntry({
		organization: organizationId,
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
	getOrganizationRoleEntry({
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
	createOrganization,
	assignRole,
	getOrganization,
	getOrganizationRoleEntry,
	getOrganizationRoleEntries,
	getOrganizationMembers,
	updateUserRole,
	updateRole,
	removeRole
};