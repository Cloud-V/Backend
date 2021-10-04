const {
	spawn
} = require("child_process");
const path = require("path");

const prepareSynthesis = require("./db/prepare").synthesis;
const wrapRun = require("./db/wrap-run");
const {
	processIVerilogValidation,
	processSynthesis
} = require("./db/output_parser");

const rmdir = require("rimraf");
const fs = require("fs-extra");


module.exports = async ({
	repository,
	stdcell,
	synthOptions,
	synthName
}) => {
	return new Promise(async (resolve, reject) => {
		try {
			const commandData = await prepareSynthesis(repository, {
				stdcell,
				synthOptions,
				synthName,
				includeTestbenches: false
			});

			const {
				stdout: iverilogStdout,
				stderr: iverilogStderr
			} = await wrapRun(commandData.iverilogValidationCommand, {
				cwd: commandData.repoPath
			});


			const {
				errors: validationErrors,
				warnings: validationWanrings
			} = await processIVerilogValidation(iverilogStdout, iverilogStderr, commandData);
			if (validationErrors.length > 0) {
				rmdir(commandData.wsPath, (err) => err && console.error(err));
				rmdir(commandData.buildPath, (err) => err && console.error(err));
				return resolve({
					synthLog: {
						errors: validationErrors,
						warnings: validationWanrings
					},
					reportErr: ''
				});
			}

			await fs.writeFile(commandData.synthScriptFileName, commandData.synthScript);
			const {
				stdout,
				stderr
			} = await wrapRun(commandData.synthScriptCommand, {
				cwd: commandData.repoPath
			});

			const {
				errors,
				warnings
			} = await processSynthesis(stdout, stderr);
			if (errors.length > 0) {
				rmdir(commandData.wsPath, (err) => err && console.error(err));
				rmdir(commandData.buildPath, (err) => err && console.error(err));
				return resolve({
					synthLog: {
						errors,
						warnings
					},
					reportErr: ''
				});
			}
			const netlistContent = await fs.readFile(commandData.synthPath, 'utf8');

			let reportContent = '';
			try {
				reportContent = await fs.readFile(commandData.reportPath, 'utf8')
			} catch (err) {
				console.error(err);
			}
			rmdir(commandData.wsPath, (err) => err && console.error(err));
			rmdir(commandData.buildPath, (err) => err && console.error(err));
			return resolve({
				synthLog: {
					errors,
					warnings,
					report: reportContent
				},
				reportErr: '',
				synthContent: netlistContent
			});
		} catch (err) {
			console.error(err);
			return reject(err);
		}
	})
}