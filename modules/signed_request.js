
const config = require("../config");

const AWS = require("aws-sdk");
const aws4 = require("aws4");
const rp = require("request-promise");
const urlj = require("url-join");

const awsConfig = {
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: process.env.AWS_REGION || 'eu-central-1',
	signatureVersion: 'v4'
};
AWS.config.update(awsConfig);

async function signedRequest(opts, protocol=null, sign=null) {
	if (protocol === null) {
		protocol = config.lambda.local? 'http': 'https';
	}
	let url = urlj(`${protocol}://${opts.host}`, opts.path);

	let finalOpts = {
		method: 'POST',
		path: opts.path,
		host: opts.host,
		url,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify(opts.body || {}),
		transform: (body, response, resolveWithFullResponse) => {
			return JSON.parse(body);
		},
		region: awsConfig.region,
		service: "execute-api"
	};

	let signer = new aws4.RequestSigner(finalOpts, awsConfig);
	if (sign !== null) {
		sign && signer.sign();
	} else if (!config.lambda.local) {
		signer.sign();
	}
	return await rp(finalOpts);
}

module.exports = signedRequest;