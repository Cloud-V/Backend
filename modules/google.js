const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.CLOUDV_GOOGLE_CLIENT_ID);

async function verify(token) {
	try {
		console.log("Verifying the token ")
		const ticket = await client.verifyIdToken({
			idToken: token,
			audience: process.env.CLOUDV_GOOGLE_CLIENT_ID
		});
		console.log("DONW")
		const payload = ticket.getPayload();
		const {
			sub: id,
			name: displayName,
			picture: avatar,
			email,
		} = payload;
		const username = email.substr(0, email.lastIndexOf('@'));
		return {
			id,
			displayName,
			avatar,
			email,
			username
		};
	} catch (err) {
		console.error(err);
		var ts = Math.round((new Date()).getTime() / 1000);
		console.error(ts);
		return reject({ error: "Sign-in with Google failed." });
	}
}

module.exports = {
	verify
}