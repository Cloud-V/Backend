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
			const synthName = body.name || 'synth.v';
			const stdcell = body.stdcell;
			const bodyOptions = body.options || {};
			if (!ownerName || !repoName || !stdcell) {
				return callback(null, {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Invalid request body.'
					})
				});
			}
			const synthOptions = {
				flatten: true,
				purge: true,
				proc: true,
				memorymap: true,
				clockPeriod: '1',
				drivingCell: 'DFFPOSX1',
				load: '0.1'
			};
			if (bodyOptions != null) {
				if (bodyOptions.flatten != null && !bodyOptions.flatten) {
					synthOptions.flatten = false;
				}
				if (bodyOptions.purge != null && !bodyOptions.purge) {
					synthOptions.purge = false;
				}
				if (bodyOptions.proc != null && !bodyOptions.proc) {
					synthOptions.proc = false;
				}
				if (bodyOptions.memorymap != null && !bodyOptions.memorymap) {
					synthOptions.memorymap = false;
				}

				if (bodyOptions.clockPeriod != null) {
					if (!/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/gmi.test(bodyOptions.clockPeriod)) {
						throw {
							error: 'Invalid value for clock period.'
						};
					}
					synthOptions.clockPeriod = bodyOptions.clockPeriod;
				}
				if (bodyOptions.load != null) {
					if (!/^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/gmi.test(bodyOptions.load)) {
						throw {
							error: 'Invalid value for cell load.'
						};
					}
					synthOptions.load = bodyOptions.load;
				}
				if (bodyOptions.drivingCell != null) {
					if (!/^\w+$/gmi.test(bodyOptions.drivingCell)) {
						throw {
							error: 'Invalid value for driving cell type.'
						};
					}
					synthOptions.drivingCell = bodyOptions.drivingCell;
				}
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
				reportErr,
				synthContent,
				synthLog
			} = await run({
				repository,
				stdcell,
				synthOptions,
				synthName
			});


			const response = {
				statusCode: 200,
				body: JSON.stringify({
					reportErr,
					synthContent,
					synthLog
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