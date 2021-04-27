const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.CLOUDV_GOOGLE_CLIENT_ID);

async function verify(token) {
try{
	const ticket = await client.verifyIdToken({
		idToken: token,
		audience: process.env.CLOUDV_GOOGLE_CLIENT_ID
	});
	const payload = ticket.getPayload();
	const {
		sub: id,
		name: displayName,
		picture: avatar,
		email,
	} = payload;
	const username = email.substr(0, email.lastIndexOf('@'));
	return resolve({
		id,
		displayName,
		avatar,
		email,
		username
	});
} catch (err) {
	console.error(err);
	return reject({ error: "Sign-in with Google failed." });
}
}

module.exports = {
	verify
}