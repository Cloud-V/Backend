module.exports = function () {
	const passport = require("passport");
	const LocalStrategy = require("passport-local").Strategy;
	const GoogleStrategy = require("passport-google-oauth2").Strategy;
	const User = require("../controllers/user");
	const Auth = require("./auth");

	passport.use(new LocalStrategy({
		usernameField: 'username'
	}, function (username, password, next) {
		return User.authUser(username, password, next);
	}));


	if ((typeof Auth.Google.clientId === 'string') && (typeof Auth.Google.clientSecret === 'string') && (Auth.Google.clientId.trim() !== '') && (Auth.Google.clientSecret.trim() !== '')) {
		passport.use(new GoogleStrategy({
				clientID: Auth.Google.clientId,
				clientSecret: Auth.Google.clientSecret,
				callbackURL: Auth.Google.callbackURL || '/auth/google/callback',
				passReqToCallback: true
			},
			function (req, accessToken, refreshToken, profile, next) {
				return process.nextTick(() => User.authGmail(accessToken, refreshToken, profile, next));
			})
		);
		console.log("Google authentication service active.");
	}

	passport.serializeUser((user, next) => next(null, user._id));

	return passport.deserializeUser((userId, next) => User.getIncompleteUser({
		_id: userId
	}, next));
};