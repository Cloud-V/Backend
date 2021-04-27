const connect = require("./db/connect");
const run = require("./run");
const {
	processIVerilogValidation
} = require("./db/output_parser");


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
			await require("./db")();
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
		const {
			EntryType
		} = require("./db/models/repo_entry");


		try {
			const Repo = require("./db/controllers/repo");
			const ownerName = body.username;
			const repoName = body.reponame;
			const itemId = body.item;
			const {
				netlistId,
				stdcell
			} = body;

			let level = parseInt(body.level || 0) || 0;
			level = Math.max(Math.min(level, 4), 0);

			let simulationTime = parseInt(body.time || 1000);
			if (isNaN(simulationTime)) {
				simulationTime = 1000;
			}

			if (!ownerName || !repoName || !itemId || !netlistId || !stdcell) {
				return callback(null, {
					statusCode: 500,
					body: JSON.stringify({
						error: 'Invalid request body.'
					})
				});
			}

			let repository, item, netlist;
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
				item = await repository.getEntry({
					_id: itemId
				});
				if (!item) {
					throw {
						error: 'Testbench not found.'
					}
				}
				netlist = await repository.getEntry({
					_id: netlistId
				});
				if (!netlist) {
					throw {
						error: 'Testbench not found.'
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
				simulationErrors,
				simulationWarnings,
				simulationLog,
				vcd
			} = await run({
				repository,
				item,
				level,
				simulationTime,
				netlist,
				stdcell
			});

			const response = {
				statusCode: 200,
				body: JSON.stringify({
					simulationErrors,
					simulationWarnings,
					simulationLog,
					vcd
				}),
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