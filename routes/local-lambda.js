const express = require("express");
const router = express.Router();
const lambdaList = require("../modules/lambda/list");

const path = require("path");

const handler = {};

const proxyLambda = (f, req, res) => {
	const event = {
		httpMethod: req.method,
		queryStringParameters: req.query,
		pathParameters: {
			proxy: req.params[0]
		},
		body: JSON.stringify(req.body)
	};
	return f(event, {}, (err, response) => {
		res.status(response.statusCode);
		res.set(response.headers);
		return res.json(JSON.parse(response.body));
	});
};

for (let endpoint of lambdaList) {
	let lambdaIndexPath = path.join(
		"..",
		"modules",
		"lambda",
		endpoint,
		"function",
		"index"
	);
	handler[endpoint] = require(lambdaIndexPath).handler;
	router.post(`/${endpoint}`, (req, res, next)=> {
		return proxyLambda(handler[endpoint], req ,res);
	});
}

module.exports = router;
