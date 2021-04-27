const config = require("../../config");

const { AuthType } = require("../../models/user");

const github = require("../../modules/github");
const google = require("../../modules/google");
const Mailer = require("../../modules/mailer");

const User = require("../../controllers/user");

const _ = require("underscore");
const express = require("express");
const shortid = require("shortid");

const { format: urlFormatter } = require("url");

const router = express.Router();

router.post('/google/callback', async (req, res, next) => {
	const {
		code
	} = req.body;
	if (!code) {
		return res.status(400).json({
			error: 'Bad Request'
		});
	}
	// return res.status(400).json({
	// 	error: 'Bad Request'
	// });
	try {
		const {
			id,
			displayName,
			avatar,
			email,
			username
		} = await google.verify(code);

		const existing = await User.getUser({
			email
		});
		if (existing) {
			const {
				user,
				token
			} = await User.getLoginUser({
				_id: existing._id
			});
			user.token = token;
			const profile = await User.getUserProfile({
				user: user._id
			});
			const merged =
				_.extend(profile.toJSON(),
					_.omit(user, ['password']));
			return res.status(200).json(merged);
		} else {
			const userData = {
				email,
				password: `1234Ab${shortid.generate()}`,
				username: `${username}_${id}_${shortid.generate()}`.replace(/[^\w]+/m, '_'),
				authType: AuthType.Google,
				google: {
					id,
					token: code
				},
				authComplete: false
			};
			const about = '';
			const personalURL = '';

			const {
				user,
				token
			} = await User.createUser(userData);
			delete user.password;
			user.token = token;

			let profile = await User.getUserProfile({
				user: user._id
			});
			if (displayName) {
				profile = await User.updateUserProfile(profile._id, {
					displayName,
					about,
					personalURL
				});
			}

			const merged =
				_.extend(profile.toJSON(),
					_.omit(user, ['password']));

			return res.status(200).json(merged);
		}
	} catch (err) {
		return res.status(500).json(err);
	}
});
router.post('/github/callback', async (req, res, next) => {
	const {
		code
	} = req.body;
	if (!code) {
		return res.status(400).json({
			error: 'Bad Request'
		});
	}
	try {
		const accessToken = await github.login({
			code
		});
		const githubUser = await github.getUser({
			accessToken
		});
		const {
			email,
			id,
			login,
			avatar_url: avatar,
			name,
			bio,
			blog
		} = githubUser;
		const displayName = name || email.split('@')[0];
		const existing = await User.getUser({
			email
		});
		if (existing) {
			const {
				user,
				token
			} = await User.getLoginUser({
				_id: existing._id
			});
			user.token = token;
			const profile = await User.getUserProfile({
				user: user._id
			});
			const merged =
				_.extend(profile.toJSON(),
					_.omit(user, ['password']));
			return res.status(200).json(merged);
		} else {
			const userData = {
				email,
				password: `1234Ab${shortid.generate()}`,
				username: `${login}_${id}_${shortid.generate()}`.replace(/[^\w]+/m, '_'),
				authType: AuthType.GitHub,
				github: {
					id,
					token: accessToken
				},
				authComplete: false
			};
			const about = bio || '';
			const personalURL = blog || '';

			const {
				user,
				token
			} = await User.createUser(userData);
			delete user.password;
			user.token = token;

			let profile = await User.getUserProfile({
				user: user._id
			});
			if (displayName) {
				profile = await User.updateUserProfile(profile._id, {
					displayName,
					about,
					personalURL
				});
			}

			const merged =
				_.extend(profile.toJSON(),
					_.omit(user, ['password']));

			return res.status(200).json(merged);
		}
	} catch (err) {
		return res.status(500).json(err);
	}

})

router.post('/reset', async (req, res, next) => {
	const {
		username,
		resetToken,
		password
	} = req.body;

	if (!username || !resetToken || !password) {
		return res.status(400).json({
			error: 'Bad request'
		});
	}
	try {
		const tagetUser = await User.getUser({
			$or: [{
					username
				},
				{
					email: username
				}
			]
		});
		if (!tagetUser) {
			return res.status(500).json({
				error: 'User not found'
			});
		}
		const {
			user,
			token
		} = await User.resetPassword(tagetUser, resetToken, password);
		user.token = token;
		const profile = await User.getUserProfile({
			user: user._id
		});
		const merged =
			_.extend(profile.toJSON(),
				_.omit(user, ['password', 'admin', 'superAdmin']));
		return res.json(merged);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.post('/forgot', async (req, res, next) => {
	const {
		username
	} = req.body;
	if (!username) {
		return res.status(400).json({
			error: 'Bad request'
		});
	}
	try {
		const tagetUser = await User.getUser({
			$or: [{
					username
				},
				{
					email: username
				}
			]
		});
		if (!tagetUser) {
			return res.status(500).json({
				error: 'User not found'
			});
		}
		const {
			user,
			resetToken
		} = await User.forgotPassword(tagetUser);
		const profile = await User.getUserProfile({
			user: user._id
		});
		const merged =
			_.extend(profile.toJSON(),
				_.omit(user, ['password', 'admin', 'superAdmin']));

		let resetUrl = 'https://cloudv.io';
		const origin = req.headers.origin;
		if (config.frontend.host) {
			resetUrl = urlFormatter({
				protocol: req.protocol,
				host: config.frontend.host,
				pathname: '/reset',
				query: {
					username: user.username,
					resetToken: resetToken.value
				}
			});
		} else if (origin && origin.length) {
			const parsedURL = new URL(origin);
			resetUrl = urlFormatter({
				protocol: req.protocol,
				host: parsedURL.host,
				pathname: '/reset',
				query: {
					username: user.username,
					resetToken: resetToken.value
				}
			});
		} else {
			console.error('Missing URL Configuration');
		}
		const sentMail = await Mailer.sendResetEmail({
			user: merged,
			url: resetUrl
		});
		return res.status(200).json({
			success: 1
		});
	} catch (err) {
		return res.status(500).json(err);
	}
});



router.post('/complete', async (req, res, next) => {
	const {
		body: {
			username
		}
	} = req;
	if (!username || !req.user || !req.user._id) {
		return res.status(401).json({
			error: 'Bad Request'
		});
	}
	try {
		const existing = await User.getUser({
			username
		});
		if (existing) {
			return res.status(500).json({
				error: 'Username already exists.'
			})
		}
		const updatedUser = await User.completeProfile(req.user._id, {
			username
		});
		const {
			user,
			token
		} = await User.getLoginUser({
			_id: updatedUser._id
		});
		user.token = token;
		const profile = await User.getUserProfile({
			user: user._id
		});
		const merged =
			_.extend(profile.toJSON(),
				_.omit(user, ['password']));

		return res.status(200).json(merged);
	} catch (err) {
		return res.status(500).json(err)
	}
})



module.exports = router;