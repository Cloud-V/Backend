const prepareSW = require("../../db/prepare").sw;
const wrapRun = require("../../db/wrap-run");
const { processCompilerOutput } = require("../../db/output_parser");

const rmdir = require("rimraf");
const fs = require("fs-extra");


module.exports = async ({
	repository,
	startupFile,
	linkerFile,
	target,
	hexName
}) => {
	return new Promise(async (resolve, reject) => {
		try {
			const commandData = await prepareSW(repository, {
				startupFile,
				linkerFile,
				target,
				hexName
			});
			await fs.writeFile(commandData.makefilePath, commandData.compilationMakefile);

			const {
				stdout,
				stderr
			} = await wrapRun(commandData.compilationMakefileCommand, {
				cwd: commandData.repoPath
			});

			const {
				errors,
				warnings
			} = await processCompilerOutput(stdout, stderr, commandData);

			let hexContent = null, listContent = null;

			if (!errors.length) {
				hexContent = await fs.readFile(commandData.compilationOutputPath, 'utf8');
				listContent = await fs.readFile(commandData.listOutputPath, 'utf8');
			}

			rmdir(commandData.wsPath, (err) => err && console.error(err));
			rmdir(commandData.buildPath, (err) => err && console.error(err));

			return resolve({
				compilationLog: {
					errors,
					warnings
				},
				hexContent,
				listContent
			});
		} catch (err) {
			console.error(err);
			return reject(err);
		}
	})
}