const rp = require("request-promise");


const URLs = {
	Login: 'https://github.com/login/oauth/access_token',
	GetUser: 'https://api.github.com/user',
	GetEmail: 'https://api.github.com/user/emails'
}
const login = ({
	code
}) => {
	return new Promise(async (resolve, reject) => {
		const options = {
			method: 'post',
			uri: URLs.Login,
			body: {
				code,
				client_id: process.env.CLOUDV_GITHUB_CLIENT_ID,
				client_secret: process.env.CLOUDV_GITHUB_CLIENT_SECRET,
			},
			json: true
		};
		try {
			const result = await rp(options);
			if (result.error) {
				console.error(result)
				return reject({
					error: 'Login failed.'
				});
			}
			resolve(result.access_token);
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Login failed.'
			})
		}
	});
}
const getUser = ({
	accessToken
}) => {
	return new Promise(async (resolve, reject) => {
		const options = {
			method: 'get',
			uri: URLs.GetUser,
			json: true,
			headers: {
				'User-Agent': 'Cloud V',
				'Authorization': `token ${accessToken}`
			}
		};
		const emailReqOptions = {
			method: 'get',
			uri: URLs.GetEmail,
			json: true,
			headers: {
				'User-Agent': 'Cloud V',
				'Authorization': `token ${accessToken}`
			}
		};
		try {
			const result = await rp(options);
			if (result.error) {
				console.error(result)
				return reject({
					error: 'Login failed.'
				});
			}
			if (!result.email) {
				const emailResult = await rp(emailReqOptions);
				if (emailResult.error || !emailResult.length) {
					console.error(emailResult)
					return reject({
						error: 'Login failed.'
					});
				}
				result.email = emailResult[0].email;
			}
			resolve(result);
		} catch (err) {
			console.error(err);
			return reject({
				error: 'Login failed.'
			})
		}
	});
}
module.exports = {
	login,
	getUser
}