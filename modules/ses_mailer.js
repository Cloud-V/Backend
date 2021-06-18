const AWS = require("aws-sdk");

AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: 'eu-central-1'
});
const sendMail = (template, dest, from = 'noreply@cloudv.io', params = {}) => {

	return new Promise(async (resolve, reject) => {
		const emailParams = {
			Destination: { /* required */
				ToAddresses: [
					dest
				]
			},
			Source: from,
			/* required */
			Template: template,
			/* required */
			TemplateData: JSON.stringify(params),
			/* required */
			ReplyToAddresses: [],
		};

		console.log(emailParams)
		try {
			const data = await new AWS.SES({}).sendTemplatedEmail(emailParams).promise();
			console.log(data)
			resolve(data);
		} catch (err) {
			console.error('Error', err)
			return reject({
				error: 'An error has occured while sending the e-mail'
			});
		}
	});
}
module.exports = sendMail;