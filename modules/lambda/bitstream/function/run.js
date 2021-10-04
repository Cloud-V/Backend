const prepareBitstream = require("./db/prepare").bitstream;
const wrapRun = require("./db/wrap-run");

const rmdir = require("rimraf");
const fs = require("fs-extra");


module.exports = async ({
	repository,
	bitstreamName,
	pcfId
}) => {
	return new Promise(async (resolve, reject) => {
		try {
			const commandData = await prepareBitstream(repository, {
				bitstreamName,
				pcfId
			});

			const validationErrors = [];
			const validationWanrings = [];

			await fs.writeFile(commandData.pcfFileName, commandData.pcfContent);
			await fs.writeFile(commandData.bitstreamMakefileName, commandData.bitstreamMakefile);
			const {
				stdout,
				stderr
			} = await wrapRun(commandData.bitstreamMakefileCommand, {
				cwd: commandData.repoPath
			});


			let report = '';
			const errorLines = (stderr || '').trim().split('\n');
			if (stderr) {
				if (/make[\s\S]+Error/gmi.test(errorLines[errorLines.length - 1])) {
					return resolve({
						synthLog: {
							errors: ['Failed to generate the bitstream.'].concat(errorLines).concat(validationErrors || []),
							warnings: validationWanrings || [],
							report
						},
					});
				} else {
					report = stderr;
				}
			}

			const bitstreamBin = await fs.readFile(commandData.projectBin);
			const bitstreamContent = Buffer.from(bitstreamBin).toString('base64');

			rmdir(commandData.wsPath, (err) => err && console.error(err));
			rmdir(commandData.buildPath, (err) => err && console.error(err));

			return resolve({
				synthLog: {
					errors: validationErrors || [],
					warnings: validationWanrings || [],
					report
				},
				bitstreamContent
			});
		} catch (err) {
			console.error(err);
			return reject(err);
		}
	})
}