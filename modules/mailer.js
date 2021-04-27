const nodemailer = require("nodemailer");
const sesMailer = require("./ses_mailer");

const transporter = nodemailer.createTransport({
	host: "mail.privateemail.com",
	port: 465,
	secure: true,
	auth: {
		user: process.env.CLOUDV_NOREPLY_EMAIL,
		pass: process.env.CLOUDV_NOREPLY_PASSWORD
	}
});
const mailFrom = 'Cloud V <noreply@cloudv.io>';

const { wrapResolveCallback } = require("../modules/utils");

const sendEmailFromUser = function (target, subject, content, cb) {
	return new Promise(async (resolve, reject) => {
		const mailOptions = {
			from: mailFrom,
			to: target,
			subject,
			text: content
		};
		return resolve(1);

		return transporter.sendMail(mailOptions, function (err, info) {
			if (err) {
				console.error(err);
				return reject({
					error: 'An unexpected error has occurred.'
				});
			} else {
				return resolve(info.response);
			}
		});
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const sendEmailToUser = function (user, subject, content, cb) {
	return new Promise(async (resolve, reject) => {
		const mailOptions = {
			from: mailFrom,
			to: user.email,
			subject,
			text: content
		};
		return resolve(1);

		return transporter.sendMail(mailOptions, function (err, info) {
			if (err) {
				console.error(err);
				return reject({
					error: 'An unexpected error has occurred.'
				});
			} else {
				return resolve(info.response);
			}
		});
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const sendResetEmail = ({
	user,
	url
}, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			const email = user.email;
			const displayName = user.displayName || `@${user.username}`;
			sesMailer('PasswordReset', email, 'noreply@cloudv.io', {
				displayName,
				url,
			}).then(resolve).catch(reject);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}
const sendAccessEmail = ({
	from,
	to,
	level,
	url,
	granterUrl,
	repoTitle
}, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			const email = to.email;
			const displayName = to.displayName || `@${to.username}`;
			const granterName = from.displayName || `@${from.username}`;
			sesMailer('RepoAccess', email, 'noreply@cloudv.io', {
				displayName,
				granterName,
				granterUrl,
				level,
				url,
				repoTitle
			}).then(resolve).catch(reject);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}
const sendContactUsEmail = ({
	name,
	email,
	type,
	subject,
	content
}, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			sesMailer('ContactUs', 'support@cloudv.io', 'noreply@cloudv.io', {
				name,
				email,
				type,
				subject,
				content
			}).then(resolve).catch(reject);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

module.exports = {
	sendEmailToUser,
	sendEmailFromUser,
	sendResetEmail,
	sendAccessEmail,
	sendContactUsEmail
};