const { spawn } = require("child_process");

async function run(cmd, opts = {}) {
	let stdout = "", stderr = "";

	if (!Array.isArray(cmd)) {
		cmd = [cmd];
	}

	const proc = spawn(cmd[0], cmd.slice(1), opts);

	proc.stdout.on('data', d=> {
		stdout += d;
	});
	proc.stderr.on('data', d=> {
		stderr += d;
	});

	return await new Promise((resolve, reject)=> {
		proc.on('error', (err)=> {
			console.error(err);
			return reject({
				error: "Process failed."
			});
		});

		proc.on('close', async (code) => {
			if (code != 0) {
				console.error(`Command ${cmd.join(' ')} had a non-zero exit code.`);
				console.error(stdout);
				console.error(stderr);
			}
			return resolve({
				code,
				stdout,
				stderr
			})
		});
	})
}
module.exports = run;