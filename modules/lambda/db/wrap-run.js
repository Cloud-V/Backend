const { spawn } = require("child_process");
const config = require("./config");

async function run(cmd, opts = {}) {
	let stdout = "", stderr = "";

	if (!Array.isArray(cmd)) {
		cmd = [cmd];
	}

	const proc = spawn(cmd[0], cmd.slice(1), opts);

	proc.stdout.on('data', d => {
		stdout += d;
	});
	proc.stderr.on('data', d => {
		stderr += d;
	});

	console.log(`Running '${cmd.join(' ')}' as process ${proc.pid}...`);

	let killed = false;

	setTimeout(() => {
		try {
			process.kill(proc.pid, 'SIGKILL');
			killed = true;
		} catch (e) {
			if (e.code !== 'ESRCH') {
				console.error("Failed to kill long-running process:")
				console.error(e);
			}
		}
	}, config.timeout);

	return await new Promise((resolve, reject) => {
		proc.on('error', (err) => {
			console.error(err);
			return reject({
				error: "An unexpected failure has occurred. Please contact the administrator."
			});
		});

		proc.on('close', async (code) => {
			if (code != 0) {
				if (killed) {
					console.error(`Command '${cmd.join(' ')}' timed out.`);
					return reject({
						error: "Operation timed out."
					});
				}
				console.error(`Command '${cmd.join(' ')}' had a non-zero exit code.`);
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