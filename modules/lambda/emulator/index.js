const express = require("express");
const {handler} = require("..");

const router = express.Router();

router.post("/run", (req, res, next)=> {
	const event = {
		httpMethod: req.method,
		queryStringParameters: req.query,
		pathParameters: {
			proxy: req.params[0]
		},
		body: JSON.stringify(req.body)
	};

	handler(event, {}, (err, response)=> {
		res.status(response.statusCode);
		res.set(response.headers);
		return res.json(JSON.parse(response.body));
	});
})

module.exports = router;
