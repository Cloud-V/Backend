const {
	spawn
} = require("child_process");
const path = require("path");

const prepareSynthesis = require("../../db/prepare").synthesis;

const rmdir = require("rimraf");



module.exports = async ({
	repository
}) => {
	return new Promise(async (resolve, reject) => {
		let error = null;
		let data = '';
		try {
			const commandData = await prepareSynthesis(repository, {
				stdcell: null,
				noStdcell: true,
				synthOptions: {},
				synthName: 'synth.v',
				includeTestbenches: false
			});
			const iverilogProc = spawn(commandData.iverilogValidationCommand[0], commandData.iverilogValidationCommand.slice(1), {
				cwd: commandData.repoPath
			});
			iverilogProc.stdout.on('data', (newData) => {
				data += newData.toString();
			});

			iverilogProc.stderr.on('data', (data) => {
				error = error || '';
				error += data.toString();
			});
			iverilogProc.on('error', (err) => {
				console.error(err);
				return reject({
					error: 'Process failed'
				});
			})

			iverilogProc.on('close', (code) => {
				rmdir(commandData.wsPath, (err) => err && console.error(err));
				rmdir(commandData.buildPath, (err) => err && console.error(err));
				return resolve({
					data,
					error,
					code,
					commandData
				})
			});
		} catch (err) {
			console.error(err);
			return reject(err);
		}
	})

}