const ModelUtils = require("../models/utils");
const config = require("../config");
const mongoose = require("../config/db");
const { AuthType } = require("../models/user");
const { UserType } = require("../models/user");
const {
	wrapResolveCallback,
	handleMongooseError,
	getMongooseId,
	getPaginationFacet
} = require("../modules/utils");

const _ = require("underscore");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const shortid = require("shortid");
const jdenticon = require("jdenticon");



const saltRounds = 10;

const signUser = user =>
	jwt.sign(
		{
			_id: getMongooseId(user)
		},
		config.jwtSecret,
		{
			expiresIn: config.jwtExpiry
		}
	);
const signTrialUser = user =>
	jwt.sign(
		{
			_id: getMongooseId(user),
			trial: true
		},
		config.jwtSecret,
		{
			expiresIn: config.jwtTrialExpiry || "1h"
		}
	);

const passwordValidator = () => ({
	test: password =>
		password.length >= 8 && /\w/.test(password) && /\d/.test(password)
});

const UsersPerPage = 12;

const createUser = async (user = {}, cb) => {
	const userModel = require("../models/user").model;
	return new Promise(async (resolve, reject) => {
		try {
			if (!passwordValidator().test(user.password)) {
				return reject({
					error:
						"New password should have at least 8 characters and contain at least one letter and one numeral."
				});
			}
			try {
				const hash = await bcrypt.hash(user.password, saltRounds);
				user.password = hash;
			} catch (err) {
				console.error(err);
				return reject({
					error: "An error has occurred while creating the user."
				});
			}
			const newUser = new userModel(user);
			try {
				const savedUser = (await newUser.save()).toJSON();
				const token = signUser(savedUser);
				return resolve({
					user: savedUser,
					token
				});
			} catch (err) {
				return reject(
					handleMongooseError(
						err,
						"An error has occurred while creating the user."
					)
				);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const createBotUser = function (user, cb) {
	if (typeof user !== "object") {
		return cb({
			error: "Invalid user data."
		});
	}

	const userModel = require("../models/user").model;

	return userModel.findOne(
		{
			username: user.username,
			deleted: false
		},
		function (err, existingUser) {
			if (err) {
				console.error('errors: ', err, 1);
				return cb({
					error: "An error occurred while creating the user."
				});
			} else if (existingUser) {
				return cb(null, {
					_id: existingUser._id,
					username: existingUser.username,
					email: existingUser.email
				});
			} else {
				const newUser = new userModel();
				newUser.username = user.username;
				if (newUser.username != null) {
					newUser.username = newUser.username.trim().toLowerCase();
				}
				newUser.email = user.email;
				if (newUser.email != null) {
					newUser.email = newUser.email.trim().toLowerCase();
				}

				newUser.authType = AuthType.Local;
				newUser.authComplete = true;
				newUser.type = UserType.Bot;
				newUser.visible = false;

				return bcrypt.hash(user.password, 10, function (err, hash) {
					if (err) {
						console.error(err);
						return cb({
							error: "An error occurred while creating the user."
						});
					}
					newUser.password = hash;
					return newUser.save(function (err) {
						if (err) {
							if (err.code === 11000 || err.code === 11001) {
								return cb({
									error: "Username already exists."
								});
							} else if (
								err.name != null &&
								err.name === "ValidationError" &&
								err.errors != null
							) {
								let errorMessage = "";
								for (let validationPath in err.errors) {
									const validationError =
										err.errors[validationPath];
									errorMessage = `${errorMessage}${validationError.message
										}\n`;
								}
								if (errorMessage.trim() !== "") {
									return cb({
										error: errorMessage
									});
								} else {
									console.error(err);
									return cb({
										error:
											"An error occurred while creating the new user."
									});
								}
							} else {
								console.error(err);
								return cb({
									error:
										"An error occurred while creating the new user."
								});
							}
						} else {
							return cb(null, {
								_id: newUser._id,
								username: newUser.username,
								email: newUser.email
							});
						}
					});
				});
			}
		}
	);
};

const authUser = async (username, password, cb) =>
	new Promise(async (resolve, reject) => {
		try {
			const user = await getUser({
				username,
				authComplete: true
			});
			if (!user) {
				return resolve(null);
			}
			const valid = await user.isValidPassword(password);
			if (!valid) {
				return resolve(null);
			}
			const profile = await user.getProfile();
			const merged = _.extend(
				profile.toJSON(),
				_.omit(user.toJSON(), ["password"])
			);
			return resolve(merged);
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);

const authGmail = function (accessToken, refreshToken, profile, cb) {
	const userModel = require("../models/user").model;
	return getIncompleteUser(
		{
			"google.id": profile.id,
			authType: AuthType.Google
		},
		function (err, user) {
			if (err) {
				return cb(err);
			} else if (user) {
				if (user.google.token === accessToken) {
					return cb(null, user);
				} else {
					// TODO: REFACTOR
					user.google.token = accessToken;
					return user.save(function (err, savedUser) {
						if (err) {
							console.log("HERE")
							console.error(err);
							return cb({
								error: "Could not update user authentication."
							});
						} else {
							return cb(null, savedUser);
						}
					});
				}
			} else {
				const newUser = new userModel();
				newUser.username = shortid.generate().replace(/-/gim, "_");
				newUser.email = profile.email;
				newUser.authType = AuthType.Google;
				newUser.authComplete = false;
				newUser.google = {
					id: profile.id,
					token: accessToken
				};
				newUser.password = shortid.generate();
				return newUser.save(function (err, savedUser) {
					if (err) {
						if (err.code === 11000 || err.code === 11001) {
							return cb({
								error: "E-mail address already exists."
							});
						} else if (
							err.name != null &&
							err.name === "ValidationError" &&
							err.errors != null
						) {
							let errorMessage = "";
							for (let validationPath in err.errors) {
								const validationError =
									err.errors[validationPath];
								errorMessage = `${errorMessage}${validationError.message
									}\n`;
							}
							if (errorMessage.trim() !== "") {
								return cb({
									error: errorMessage
								});
							} else {
								console.error(err);
								return cb({
									error:
										"An error occurred during authentication."
								});
							}
						} else {
							console.error(err);
							return cb({
								error:
									"An error occurred during authentication."
							});
						}
					} else {
						return cb(null, savedUser);
					}
				});
			}
		}
	);
};

/**
 * @deprecated
 */
const authFacebook = function (accessToken, refreshToken, profile, cb) {
	const userModel = require("../models/user").model;
	return getIncompleteUser(
		{
			"facebook.id": profile.id,
			authType: AuthType.Facebook
		},
		function (err, user) {
			if (err) {
				return cb(err);
			} else if (user) {
				if (user.facebook.token === accessToken) {
					return cb(null, user);
				} else {
					// TODO: REFACTOR
					user.facebook.token = accessToken;
					return user.save(function (err, savedUser) {
						if (err) {
							console.error(err);
							return cb({
								error: "Could not update user authentication."
							});
						} else {
							return cb(null, savedUser);
						}
					});
				}
			} else {
				const newUser = new userModel();
				newUser.username = shortid.generate().replace(/-/gim, "_");
				newUser.email = profile.emails[0].value;
				newUser.authType = AuthType.Facebook;
				newUser.authComplete = false;
				newUser.facebook = {
					id: profile.id,
					token: accessToken
				};
				newUser.password = shortid.generate();
				return newUser.save(function (err, savedUser) {
					if (err) {
						if (err.code === 11000 || err.code === 11001) {
							return cb({
								error: "E-mail address already exists."
							});
						} else if (
							err.name != null &&
							err.name === "ValidationError" &&
							err.errors != null
						) {
							let errorMessage = "";
							for (let validationPath in err.errors) {
								const validationError =
									err.errors[validationPath];
								errorMessage = `${errorMessage}${validationError.message
									}\n`;
							}
							if (errorMessage.trim() !== "") {
								return cb({
									error: errorMessage
								});
							} else {
								console.error(err);
								return cb({
									error:
										"An error occurred during authentication."
								});
							}
						} else {
							console.error(err);
							return cb({
								error:
									"An error occurred during authentication."
							});
						}
					} else {
						return cb(null, savedUser);
					}
				});
			}
		}
	);
};

const completeProfile = (userId, { username }, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			if (typeof username !== "string" || !username.length) {
				return reject({
					error: "Username is required"
				});
			}
			const user = await getUser({
				_id: userId,
				authComplete: false
			});
			if (!user) {
				return reject({
					error: "User not found"
				});
			}
			user.username = username;
			user.authComplete = true;
			try {
				const savedUser = await user.save();
				const profile = await getUserProfile({
					user: savedUser._id
				});
				const displayName =
					username.charAt(0).toUpperCase() + username.substr(1);
				const updatedProfile = await updateUserProfile(profile._id, {
					displayName
				});
				return resolve(savedUser);
			} catch (err) {
				return reject(
					handleMongooseError(
						err,
						"An error has occured while completing the signup."
					)
				);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};
var getIncompleteUser = function (query, cb) {
	if (query == null) {
		query = {};
	}
	query.deleted = false;
	return mongoose.model("User").findOne(query, function (err, user) {
		if (err) {
			console.error(err);
			return cb({
				error: "An error occurred while retrieving the user."
			});
		} else {
			return cb(null, user);
		}
	});
};

var getUser = async (query, visible, cb) => {
	if (query == null) {
		query = {};
	}
	query.deleted = false;
	if (typeof visible === "function") {
		cb = visible;
	} else if (visible != null) {
		query.visible = visible;
	}
	return new Promise(async (resolve, reject) => {
		const dbQuery = mongoose.model("User").findOne(query);
		try {
			return resolve(await dbQuery.exec());
		} catch (err) {
			console.error(err);
			return reject({
				error: "An error occurred while retrieving the user."
			});
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const getUsers = async (query, opts = {}, cb) => {
	const userModel = require("../models/user").model;
	if (typeof opts === "function") {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;
	query.authComplete = true;
	query.type = UserType.Regular;
	return new Promise(async (resolve, reject) => {
		const userPaths = _.pickSchema(userModel);
		const projection = _.reduce(
			userPaths,
			(accum, val) => {
				if (!/\./.test(val)) {
					accum[val] = 1;
				}
				return accum;
			},
			{}
		);
		const stages = [
			{
				$match: query
			},
			{
				$sort: opts.sort || {
					createdAt: -1
				}
			},
			{
				$project: {
					password: false,
					admin: false,
					superAdmin: false,
					workspaceSettings: false
				}
			},
			{
				$lookup: {
					from: "profiles",
					let: {
						userId: "$_id"
					},
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{
											$eq: ["$user", "$$userId"]
										},
										{
											$eq: ["$deleted", false]
										}
									]
								}
							}
						},
						{
							$project: {
								user: false,
								_id: false,
								created: false,
								deleted: false,
								createdAt: false,
								updatedAt: false
							}
						}
					],
					as: "profile"
				}
			},
			{
				$unwind: {
					path: "$profile",
					preserveNullAndEmptyArrays: true
				}
			},
			{
				$replaceRoot: {
					newRoot: {
						$mergeObjects: ["$profile", "$$ROOT"]
					}
				}
			},
			{
				$project: {
					profile: false
				}
			},
			getPaginationFacet(opts.page || 0, UsersPerPage, "users")
		];
		try {
			const {
				"0": {
					users,
					pageInfo: { "0": pageInfo }
				}
			} = await userModel.aggregate(stages);

			return resolve({
				users,
				pageInfo: pageInfo || {
					count: 0,
					pageSize: UsersPerPage,
					pageCount: 0
				}
			});
		} catch (err) {
			console.error(err);
			return reject({
				error: "An error occurred while retrieving the users."
			});
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const cleanupUsers = function (query, cb) {
	if (query == null) {
		query = {};
	}
	const Repo = require("./repo");
	query.deleted = true;
	const userModel = mongoose.model("User");
	return userModel.find(query, function (err, users) {
		if (err) {
			return cb(err);
		} else {
			users.forEach(user =>
				Repo.cleanupRepos(
					{
						owner: user._id
					},
					function (err) {
						if (err) {
							return console.error(err);
						}
					}
				)
			);
			return userModel.remove(query, cb);
		}
	});
};

const getSuggestions = function (term, opts = {}, cb) {
	const userModel = require("../models/user").model;
	return new Promise(async (resolve, reject) => {
		try {
			if (term.length < 3) {
				return resolve([]);
			}
			if (!/^\w+$/gm.test(term)) {
				return resolve([]);
			}
			const users = await userModel
				.find({
					username: new RegExp(term, "i"),
					deleted: false
				})
				.sort({
					username: 1
				})
				.limit(10)
				.exec();
			return resolve(_.map(users, "username"));
		} catch (err) {
			return reject(
				handleMongooseError(err, "Failed to get suggestions")
			);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const search = async (query, opts = {}, cb) => {
	const escapeStringRegexp = require("escape-regex-string");
	if (typeof opts === "function") {
		cb = opts;
		opts = {};
	}
	if (!query.length) {
		return new Promise(async (resolve, reject) => {
			return resolve({
				users: [],
				pageInfo: {
					count: 0,
					pageSize: UsersPerPage,
					pageCount: 0
				}
			});
		})
			.then(wrapResolveCallback(cb))
			.catch(cb);
	}
	return getUsers(
		{
			$or: [
				{
					username: {
						$regex: escapeStringRegexp(query),
						$options: "i"
					}
				}
			],
			authComplete: true
		},
		{
			sort: {
				username: 1
			}
		},
		cb
	);
};

const matchToken = (userId, resetTokenValue, cb) => {
	const resetTokenModel = require("../models/reset_token").model;
	return new Promise(async (resolve, reject) => {
		try {
			userId = getMongooseId(userId);
			const user = await getUser({
				_id: userId
			});
			if (!user) {
				return reject({
					error: "User not found"
				});
			}
			let resetToken;
			try {
				resetToken = await resetTokenModel.findOne({
					user: user._id,
					value: resetTokenValue
				});
				if (!resetToken) {
					return reject({
						error: "Invalid or expired password reset token"
					});
				}
			} catch (err) {
				console.error(err);
				return reject(
					handleMongooseError(
						err,
						"An error has occured while resetting the password"
					)
				);
			}
			const isValid = await resetToken.isValid();
			if (!isValid) {
				return reject({
					error: "Invalid or expired password reset token"
				});
			}
			return resolve(resetToken);
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const resetPassword = (userId, resetToken, password, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			userId = getMongooseId(userId);

			const user = await getUser({
				_id: userId
			});
			if (!user) {
				return reject({
					error: "User does not exist"
				});
			}
			const matchedToken = await matchToken(user, resetToken);
			const { user: updatedUser, token } = await updateUserPassword(
				user._id,
				password
			);
			matchedToken.consumed = true;
			try {
				await matchedToken.save();
			} catch (err) {
				console.error(err);
			}

			return resolve({
				user: updatedUser,
				token
			});
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};
const forgotPassword = (userId, cb) => {
	const resetTokenModel = require("../models/reset_token").model;
	const tokenRounds = 7;

	return new Promise(async (resolve, reject) => {
		try {
			userId = getMongooseId(userId);
			const user = await getUser({
				_id: userId
			});
			if (!user) {
				return reject({
					error: "User does not exist"
				});
			}
			let resetTokenValue = "";
			for (let i = 0; i < tokenRounds; i++) {
				resetTokenValue = `${resetTokenValue}${shortid.generate()}`;
			}
			const newResetToken = new resetTokenModel({
				user: user._id,
				value: resetTokenValue
			});
			try {
				await resetTokenModel.update(
					{
						user: user._id
					},
					{
						$set: {
							expired: true
						}
					},
					{
						multi: true
					}
				);
				const resetToken = await newResetToken.save();
				return resolve({
					resetToken,
					user
				});
			} catch (err) {
				return reject(
					err,
					"An error has occured while sending password reset e-mail"
				);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const countUsers = function (query, cb) {
	if (typeof query !== "object") {
		return cb({
			error: "Invalid query."
		});
	}

	query.deleted = false;
	query.authComplete = true;
	return new Promise(async (resolve, reject) => {
		try {
			return resolve(
				await mongoose
					.model("User")
					.countDocuments(query)
					.exec()
			);
		} catch (err) {
			return reject(
				handleMongooseError(
					err,
					"An error occurred while retrieving the count"
				)
			);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};
const updateUserPassword = (userId, password, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			userId = getMongooseId(userId);
			const user = await getUser({
				_id: userId
			});
			if (!user) {
				return reject({
					error: "User not found."
				});
			}
			if (!passwordValidator().test(password)) {
				return reject({
					error:
						"New password should have at least 8 characters and contain at least one letter and one numeral."
				});
			}
			try {
				const hash = await bcrypt.hash(password, saltRounds);
				user.password = hash;
			} catch (err) {
				console.error(err);
				return reject({
					error: "An error has occurred while update the password."
				});
			}
			try {
				const updatedUser = (await user.save()).toJSON();
				const token = signUser(updatedUser);
				return resolve({
					user: updatedUser,
					token
				});
			} catch (err) {
				return reject(
					handleMongooseError(
						err,
						"An error has occurred while update the password."
					)
				);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};
const updateUserWorkspaceSettings = (userId, themeIndex, fontSize, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			const user = await getUser({
				_id: userId
			});
			if (!user) {
				return reject({
					error: "Failed to update settings"
				});
			}
			user.workspaceSettings = user.workspaceSettings || {};
			user.workspaceSettings.theme = themeIndex;
			user.workspaceSettings.fontSize = fontSize;
			try {
				const savedUser = await user.save().exec();
				return resolve(savedUser.workspaceSettings);
			} catch (err) {
				return reject(
					handleMongooseError(err, "Failed to update user settings.")
				);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};
const generateDefaultUserProfile = async (user, cb) => {
	const profileModel = mongoose.model("Profile");
	const FileManager = require("../controllers/file_manager");
	return new Promise(async (resolve, reject) => {
		try {
			const { username } = user;
			console.log(username);
			const generatedAvatar = jdenticon.toPng(username, 200);
			const avatarFile = await FileManager.createMediaFile({ buffer: generatedAvatar }, {
				user: user._id,
				originalname: "generated",
				mimeType: "image/png",
				extension: ".png"
			});
			const displayName =
				username[0].toUpperCase() + username.substr(1).toLowerCase();
			const profile = new profileModel({
				user: user._id,
				avatarFile,
				displayName
			});
			let newProfile;
			try {
				newProfile = await profile.save();
			} catch (err) {
				return reject(
					handleMongooseError(
						err,
						"An error occurred while creating user profile."
					)
				);
			}
			return resolve(newProfile);
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const getUserProfile = async (query, cb) => {
	const profileModel = mongoose.model("Profile");
	return new Promise(async (resolve, reject) => {
		query.deleted = false;
		try {
			let profile;
			try {
				profile = await profileModel.findOne(query).exec();
			} catch (err) {
				return reject(
					handleMongooseError(err, "Failed to get user profile")
				);
			}
			if (profile) {
				return resolve(profile);
			} else {
				const userId = query.user;
				if (!userId) {
					return reject({
						error: "Failed to get user profile"
					});
				}
				const user = await getUser({
					_id: userId
				});

				const defaultUserProfile = await generateDefaultUserProfile(
					user
				);
				return resolve(defaultUserProfile);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const updateUserProfile = (profileId, updates, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			let profile = await getUserProfile({
				_id: getMongooseId(profileId)
			});
			if (!profile) {
				return reject({
					error: "Failed to get user profile"
				});
			}
			const validPaths = _.pickSchema(
				mongoose.model("Profile"),
				ModelUtils.nonCloneable
			);
			updates = _.pick(updates, validPaths);
			profile = _.extend(profile, updates);
			try {
				const updatedProfile = await profile.save();
				return resolve(updatedProfile);
			} catch (err) {
				return reject(
					handleMongooseError(
						err,
						"An error occurred while updating user profile."
					)
				);
			}
		} catch (err) {
			return reject(err);
		}
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};

const getLoginUser = (query, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			let user = await getUser(query);
			if (!user) {
				return reject({
					error: "User not found."
				});
			}
			const token = signUser(user);
			if (user.toJSON) {
				user = user.toJSON();
			}
			delete user.password;
			return resolve({
				token,
				user
			});
		} catch (err) {
			return reject(err);
		}
	});
};

const login = async ({ username, password }, cb) => {
	return new Promise(async (resolve, reject) => {
		if (!username) {
			return reject({
				error: "Missing username"
			});
		}
		if (!password) {
			return reject({
				error: "Missing password"
			});
		}
		let user;
		try {
			user = await authUser(username, password);
		} catch (err) {
			return reject(err);
		}
		if (!user) {
			return reject({
				error: "Incorrect username or password."
			});
		}
		const token = signUser(user);
		if (user.toJSON) {
			user = user.toJSON();
		}
		delete user.password;
		return resolve({
			user,
			token
		});
	})
		.then(wrapResolveCallback(cb))
		.catch(cb);
};
module.exports = {
	createUser,
	createBotUser,
	authUser,
	authGmail,
	authFacebook,
	completeProfile,
	countUsers,
	getUser,
	getUsers,
	getIncompleteUser,
	cleanupUsers,
	getSuggestions,
	search,
	matchToken,
	forgotPassword,
	resetPassword,
	updateUserWorkspaceSettings,
	getUserProfile,
	updateUserProfile,
	updateUserPassword,
	generateDefaultUserProfile,
	login,
	getLoginUser,
	signTrialUser
};
