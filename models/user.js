const { prohibitedNames, emailRegex } = require("./utils");

const Error = require("../config/error");
const mongoose = require("../config/db");
const { wrapResolveCallback } = require("../modules/utils");

const _ = require("underscore");
const bcrypt = require("bcrypt");
const { Schema } = require("mongoose");

const AuthType = {
	Local: 0,
	Google: 1,
	Facebook: 2,
	GitHub: 3,
	LinkedIn: 3
};

const UserType = {
	Regular: 0,
	Bot: 1,
	Trial: 2
};

const userSchema = new Schema(
	{
		username: {
			type: String,
			required: Error.User.MissingUsername.msg,
			// unique: Error.User.AlreadyExists.msg,
			lowercase: true,
			trim: true,
			validate: {
				validator: async function(username) {
					if (Array.from(prohibitedNames).includes(username)) {
						throw Error.User.ProhibitedUsername.msg;
					}
					if (!/^\w+$/gm.test(username)) {
						throw Error.User.InvalidUsername.msg;
					}
					const User = require("../controllers/user");
					try {
						const user = await User.getUser({
							_id: {
								$ne: this._id
							},
							username
						});
						if (user) {
							throw Error.User.UsernameAlreadyInUse.msg;
						}
						return true;
					} catch (err) {
						return false;
					}
				},
				message: "Invalid username"
			}
		},
		email: {
			type: String,
			required: Error.User.MissingEmail.msg,
			// unique: true,
			lowercase: true,
			trim: true,
			validate: {
				validator: async function(email) {
					if (!emailRegex().test(email)) {
						return false;
					}
					const User = require("../controllers/user");
					try {
						const user = await User.getUser({
							_id: {
								$ne: this._id
							},
							email
						});
						if (user) {
							throw Error.User.EmailAlreadyInUse.msg;
						}
						return true;
					} catch (err) {
						return false;
					}
				},
				message: "Invalid e-mail address"
			}
		},
		password: {
			type: String,
			required: Error.User.MissingPassword.msg
		},
		activated: {
			type: Boolean,
			required: true,
			default: true
		},
		admin: {
			type: Boolean,
			required: true,
			default: false
		},
		superAdmin: {
			type: Boolean,
			required: false,
			default: false
		},
		authType: {
			type: Number,
			required: true,
			default: AuthType.Local
		},
		authComplete: {
			type: Boolean,
			required: true,
			default: false
		},
		type: {
			type: Number,
			required: true,
			default: UserType.Regular
		},
		visible: {
			type: Boolean,
			required: true,
			default: true
		},
		authComplete: {
			type: Boolean,
			required: true,
			default: false
		},
		google: {
			id: {
				type: String
			},
			token: {
				type: String
			}
		},
		facebook: {
			id: {
				type: String
			},
			token: {
				type: String
			}
		},
		github: {
			id: {
				type: String
			},
			token: {
				type: String
			}
		},
		workspaceSettings: {
			theme: {
				type: Number,
				default: 0
			},
			fontSize: {
				type: Number,
				default: 15
			}
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
	},
	{
		timestamps: {
			createdAt: "createdAt",
			updatedAt: "updatedAt"
		}
	}
);

userSchema.path("authType").validate(function(auth) {
	return _.values(AuthType).includes(auth);
}, Error.User.InvalidAuthentication.msg);

userSchema.path("type").validate(function(type) {
	return _.values(UserType).includes(type);
}, Error.User.InvalidType.msg);

userSchema
	.path("username")
	.validate(
		username => /^\w+$/gm.test(username),
		Error.User.InvalidUsername.msg
	);

userSchema.methods.updateWorkspaceSettings = function(
	themeIndex,
	fontSize,
	cb
) {
	const User = require("../controllers/user");
	return User.updateUserWorkspaceSettings(this._id, themeIndex, fontSize, cb);
};

userSchema.methods.getProfile = function(cb) {
	const User = require("../controllers/user");
	return User.getUserProfile(
		{
			user: this._id
		},
		cb
	);
};

userSchema.methods.isValidPassword = async function(password, cb) {
	return new Promise(async (resolve, reject) => {
		let same;
		try {
			same = await bcrypt.compare(password, this.password);
			if (!same) {
				return resolve(false);
			}
			return resolve(true);
		} catch (err) {
			console.error(err);
			return reject({
				error: Error.User.PasswordValidationFailed.msg
			});
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

module.exports = {
	model: mongoose.model("User", userSchema),
	AuthType,
	UserType
};
