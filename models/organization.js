const mongoose = require("../config/db");
const { Schema }  = require("mongoose");
const { ObjectId } = Schema;

const organizationSchema = new Schema({
	name: {
		type: String,
		required: 'You must provide a valid name for the organization.',
		lowercase: true
	},
	title: {
		type: String,
		required: true
	},
	description: {
		type: String,
		default: ''
	},
	owner: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	user: {
		type: ObjectId,
		required: true,
		ref: 'User'
	},
	enforcePrefix: {
		type: Boolean,
		required: true,
		default: false
	},
	prefix: {
		type: String,
		required: true
	},
	teamTitle: {
		type: String,
		default: 'Group'
	},
	teamTitleP: {
		type: String,
		default: 'Groups'
	},
	projectTitle: {
		type: String,
		default: 'Project'
	},
	projectTitleP: {
		type: String,
		default: 'Projects'
	},
	created: {
		type: Date,
		required: true,
		default: Date.now
	},
	deleted: {
		type: Boolean,
		required: true,
		default: false
	}
}, {
	timestamps: {
		createdAt: 'createdAt',
		updatedAt: 'updatedAt'
	}
});

organizationSchema.path('name').validate((name => /^\w+$/gm.test(name)),
	'The organization name can only contain letters, numbers and underscores.'
);

organizationSchema.methods.getRoleEntry = function (query, cb) {
	const Organization = require("../controllers/organization");
	query.organization = this._id;
	return Organization.getOrganizationRoleEntry(query, cb);
};

organizationSchema.methods.getUser = function (cb) {
	const User = require("../controllers/user");
	const thisOwner = this.owner;
	return User.getUser({
		_id: thisOwner
	}, function (err, user) {
		if (err) {
			return cb(err);
		} else if (!user) {
			return cb({
				error: 'Invalid organization data.'
			});
		} else {
			return cb(null, user);
		}
	});
};
organizationSchema.methods.getMembers = function (cb) {
	const Organization = require("../controllers/organization");
	return Organization.getOrganizationMembers(this, cb);
};

organizationSchema.methods.authorize = function (username, authorizerLevel, level, cb) {
	const User = require("../controllers/user");
	const Organization = require("../controllers/organization");
	const orgId = this._id;
	const OrganizationAccessLevel = require("./organization_access").AccessLevel;
	const {
		UserType
	} = require("./user");

	return User.getUser({
		username
	}, function (err, user) {
		if (err) {
			return cb(err);
		} else if (!user || (user.type !== UserType.Regular)) {
			return cb({
				error: `User ${username} does not exist.`
			});
		} else {
			return Organization.getOrganizationRoleEntry({
				organization: orgId,
				user: user._id
			}, function (err, role) {
				if (err) {
					return cb(err);
				} else if (!role) {
					return Organization.assignRole(orgId, user._id, level, cb);
				} else if (role.accessLevel === OrganizationAccessLevel.Owner) {
					return cb({
						error: "Cannot update owner's role."
					});
				} else {
					if (authorizerLevel < role.accessLevel) {
						return cb({
							error: 'Unauthorized to update this user\'s role'
						});
					}
					return Organization.updateUserRole(orgId, user._id, level, cb);
				}
			});
		}
	});
};
organizationSchema.methods.deauthorize = function (username, authorizerLevel, cb) {
	const User = require("../controllers/user");
	const Organization = require("../controllers/organization");
	const orgId = this._id;
	const OrganizationAccessLevel = require("./organization_access").AccessLevel;
	return User.getUser({
		username
	}, function (err, user) {
		if (err) {
			return cb(err);
		} else if (!user) {
			return cb({
				error: `User ${username} does not exist.`
			});
		} else {
			return Organization.getOrganizationRoleEntry({
				organization: orgId,
				user: user._id
			}, function (err, role) {
				if (err) {
					return cb(err);
				} else if (!role) {
					return cb({
						error: 'Role does not exist.'
					});
				} else if (role.accessLevel === OrganizationAccessLevel.Owner) {
					return cb({
						error: "Cannot remove owner's role."
					});
				} else {
					if (authorizerLevel < role.accessLevel) {
						return cb({
							error: 'Unauthorized to update this user\'s role'
						});
					}
					return Organization.removeRole(role._id, cb);
				}
			});
		}
	});
};
module.exports = {
	model: mongoose.model('Organization', organizationSchema)
};