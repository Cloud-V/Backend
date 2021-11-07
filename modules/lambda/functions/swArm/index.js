const connect = require("../../db/connect");
const run = require("./run");
const {
	processIVerilogValidation
} = require("../../db/output_parser");

exports.handler = (event, context, callback) => {
	(async () => {
		process.env.PATH = process.env.PATH + ':' + process.env.LAMBDA_TASK_ROOT;

		context.callbackWaitsForEmptyEventLoop = false;
		let error = null;
		let data = '';

		let body = event.body || {};

		if (typeof body === 'string') {
			try {
				body = JSON.parse(body);
			} catch (err) {
				console.error(err);
				return callback(null, {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Invalid request body.'
					})
				})
			}
		}
		try {
			const {
				userConnection,
				fsConnection
			} = await connect();
			await require("../../db")();
		} catch (err) {
			console.error(err);
			const response = {
				statusCode: 500,
				body: JSON.stringify({
					error: error
				})
			};
			callback(null, response);
		}

		try {
			const Repo = require("../../db/controllers/repo");
			const ownerName = body.username;
			const repoName = body.reponame;
			const startupFile = body.startup;
			const linkerFile = body.linker;
			const target = 'arm';
			const hexName = body.name || 'sw.hex';

			if (!ownerName || !repoName || !startupFile || !linkerFile) {
				return callback(null, {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Invalid request body.'
					})
				});
			}

			let repository;
			try {
				repository = await Repo.getRepo({
					repoName,
					ownerName
				});
				if (!repository) {
					throw {
						error: 'Repository not found.'
					}
				}
			} catch (err) {
				console.error(err);
				const response = {
					statusCode: 500,
					body: JSON.stringify({
						code: code,
						data: data,
						error: error
					})
				};
				callback(null, response);
			}

			const {
				hexContent,
				listContent,
				compilationLog
			} = await run({
				repository,
				startupFile,
				linkerFile,
				target,
				hexName
			});

			const response = {
				statusCode: 200,
				body: JSON.stringify({
					hexContent,
					listContent,
					compilationLog
				})
			};
			return callback(null, response);
		} catch (err) {
			const response = {
				statusCode: 500,
				body: JSON.stringify(err),
			};
			callback(null, response);
		}
	})();
}