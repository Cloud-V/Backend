const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");

const config = require("../config");
const Parser = require("./parser");

const synthesize = async function (filesPath, topModule, topModuleEntryId, stdcell, synthOptions, synthName, cb) {
try {
	synthName = synthName ?? "synth.v";
	const Repo = require("../controllers/repo");

	let topModuleEntry = await Repo.getRepoEntry({ _id: topModuleEntryId });
	if (!topModuleEntry) {
		throw { error: "Cannot find the source file containing the top module." };
	}

	if (!(await Parser.moduleExistsInFile(topModuleEntry._id, topModule))) {
		throw { error: `Module '${topModule}' does not exist in '${topModuleEntry.title}'.` };
	}

	let files = await fs.readdir(filesPath).catch(err=> {
		console.error(err);
		throw { error: "Failed to read Verilog files." };
	});

	let reportPath = path.join(filesPath, `${synthName}_rpt.txt`);

	stdcell = stdcell ?? "";
	if (stdcell.trim() === "") {
		throw {
			error: `Cannot find the standard cell library ${stdcell}.`
		};
	}
	
	let stdcellPath = path.join(config.stdcellRepo, stdcell, 'cells.lib');
	try {
		const stat = fs.lstatSync(stdcellPath);
	} catch (err) {
		console.error(err);
		throw {
			error: `Cannot find the standard cell library ${stdcell}.`
		};
	}

	let yosysScript = `
		${files.map(file=> `read_verilog ${file}`).join("; ")}
		${synthOptions.proc ? "proc" : ""}
		hierarchy -check -top ${topModule}
		opt
		techmap
		opt
		dfflibmap -liberty ${stdcellPath}
		abc -liberty ${stdcellPath}
		clean
		${synthOptions.memorymap ? "memory_collect; memory_map" : ""}
		${synthOptions.flatten ? "flatten" : ""}
		${synthOptions.purge ? "opt_clean -purge" : ""}
		tee -o ${reportPath} stat -top ${topModule} -liberty ${stdcellPath}
		write_verilog -noattr -noexper ${synthName}
	`;

	await fs.writeFile(path.join(filesPath, "synth.tcl"), yosysScript);

	let { err, stdout, stderr } = await new Promise(resolve=> {
		spawn("yosys", [ "-q", "./synth.tcl" ], { cwd: filesPath, maxBuffer: 5000 * 1024, timeout: 30000 }, (err, stdout, stderr) => {
			return resolve({ err, stdout, stderr });
		})
	});

	if (err && !stderr) {
		console.error(err);
		throw {
			error: "An unexpected error has occurred while synthesizing."
		};
	}

	if (stdout) {
		if (process.env.NODE_ENV === 'development') {
			console.log('stdout:');
			console.log(stdout);
		}
	}

	const errors = [];
	const warnings = [];
	if (stderr) {
		const errorLines = stderr.split('\n');
		for (let line of Array.from(errorLines)) {
			if ((line.trim() === '') || /^i give up\.$/i.test(line.trim())) {
				continue;
			}
			if (/warning *\: *([\s\S]*)/im.test(line)) {
				const warningEntry = {};
				warningEntry.file = null;
				warningEntry.message = line;
				warningEntry.line = 0;
				warnings.push(warningEntry);
			} else {
				const errorEntry = {};
				errorEntry.file = null;
				errorEntry.message = line;
				errorEntry.line = 0;
				errors.push(errorEntry);
			}
		}
		if (errors.length > 0) {
			return cb(null, null, '', {
				errors,
				warnings
			});
		}
	}

	const synthPath = path.join(filesPath, synthName);

	let content = await fs.readFile(synthPath, 'utf8').catch(err=> {
		console.error(err);
		throw { error: "Failed to read final netlist." };
	});

	return cb(null, err, content, {
		errors,
		warnings,
		report: ''
	});
} catch (err) {
	return cb(err);
}
};

const validateFile = function (filesPath, fileName, nameMap, cb) {
	const errorParsingRegEx = () => new RegExp('(.+)\\s*\\:\\s*(\\d+)\\s*\\:\\s*(.+)', 'gm');
	const innerErrorRegEx = () => new RegExp('\\s*(\\w+)\\s*\\:\\s*(.+)', 'igm');
	const fullPath = path.join(filesPath, fileName);
	return fs.exists(fullPath, function (exists) {
		if (!exists) {
			return cb({
				error: 'Verilog file does not exists.'
			});
		} else {
			return fs.readdir(filesPath, function (err, files) {
				if (err) {
					console.error(err);
					return cb({
						error: 'Failed to read verilog files.'
					});
				} else {
					if (files.length === 0) {
						return cb({
							error: "No files detected for validation."
						});
					}

					let names = [files[0].replace(/\\/gm, '\\\\')];
					for (let i = 1, end = files.length, asc = 1 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
						names.push(files[i].replace(/\\/gm, '\\\\'));
					}

					const cmd = `iverilog -W all -t null ${names}`;

					return spawn(
						"iverilog",
						["-Wall", "-t", "null"].concat(names),
						
						{
							cwd: filesPath,
							maxBuffer: 5000 * 1024,
							timeout: 30000
						},
						function (err, stdout, stderr) {
							if (err) {
								if (!stderr) {
									console.error(err);
									return cb({
										error: "An error occurred while synthesizing."
									});
								}
							}
							if (stdout) {
								if (process.env.NODE_ENV === 'development') {
									console.log('stdout:');
									console.log(stdout);
									console.log('----end of stdout-----');
								}
							}

							const synthErrors = [];
							const synthWarnings = [];

							if (stderr) {
								const errorLines = stderr.trim().split('\n');
								for (let line of Array.from(errorLines)) {
									if ((line.trim() === '') || /^i give up\.$/i.test(line.trim())) {
										continue;
									}
									const logEntry = {
										message: line.trim()
									};
									const extractionRegEx = errorParsingRegEx();
									const errorMatches = extractionRegEx.exec(line);
									logEntry.file = null;
									logEntry.line = 0;
									if (errorMatches !== null) {
										var type;
										const file = errorMatches[1];
										line = errorMatches[2];
										let lineErr = errorMatches[3];
										if (innerErrorRegEx().test(lineErr)) {
											const typeMatches = innerErrorRegEx().exec(lineErr);
											type = typeMatches[1].toLowerCase();
											lineErr = innerErrorRegEx().exec(lineErr)[2];
										}

										lineErr = lineErr.charAt(0).toUpperCase() + lineErr.slice(1);
										logEntry.file = nameMap[file].sourceId;
										logEntry.line = Number.parseInt(line);
										if (!/error/i.test(type) && !/[\s\S]+\s*\:\s*syntax error/i.test(logEntry.message)) {
											synthWarnings.push(logEntry);
										} else {
											synthErrors.push(logEntry);
										}
									} else {
										synthErrors.push(logEntry);
									}
								}
							}
							if (err && !synthErrors.length) {
								synthErrors.push('Fatal error has occurred during simulation.');
							}
							return cb(null, {
								errors: synthErrors,
								warnings: synthWarnings
							});
						});
				}
			});
		}
	});
};

const validateFiles = function (filesPath, nameMap, cb) {
	const errorParsingRegEx = () => new RegExp('(.+)\\s*\\:\\s*(\\d+)\\s*\\:\\s*(.+)', 'gm');
	const innerErrorRegEx = () => new RegExp('\\s*(\\w+)\\s*\\:\\s*(.+)', 'igm');
	return fs.readdir(filesPath, function (err, files) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to read verilog files.'
			});
		} else {
			if (files.length === 0) {
				return cb({
					error: "No files detected for validation."
				});
			}

			let names = files[0].replace(/\\/gm, '\\\\');
			for (let i = 1, end = files.length, asc = 1 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
				names = `${names} ${files[i].replace(/\\/gm, '\\\\')}`;
			}
			const cmd = `iverilog -W all -t null ${names}`;
			return exec(cmd, {
					cwd: filesPath,
					maxBuffer: 5000 * 1024,
					timeout: 30000
				},
				function (err, stdout, stderr) {
					if (err) {
						if (!stderr) {
							console.error(err);
							return cb({
								error: "An error occurred while synthesizing."
							});
						}
					}
					if (stdout) {
						if (process.env.NODE_ENV === 'development') {
							console.log('stdout:');
							console.log(stdout);
							console.log('----end of stdout-----');
						}
					}

					const synthErrors = [];
					const synthWarnings = [];

					if (stderr) {
						const errorLines = stderr.trim().split('\n');
						for (let line of Array.from(errorLines)) {
							if ((line.trim() === '') || /^i give up\.$/i.test(line.trim())) {
								continue;
							}
							const logEntry = {
								message: line.trim()
							};
							const extractionRegEx = errorParsingRegEx();
							const errorMatches = extractionRegEx.exec(line);
							logEntry.file = null;
							logEntry.line = 0;
							if (errorMatches !== null) {
								var type;
								const file = errorMatches[1];
								line = errorMatches[2];
								let lineErr = errorMatches[3];
								if (innerErrorRegEx().test(lineErr)) {
									const typeMatches = innerErrorRegEx().exec(lineErr);
									type = typeMatches[1].toLowerCase();
									lineErr = innerErrorRegEx().exec(lineErr)[2];
								}
								lineErr = lineErr.charAt(0).toUpperCase() + lineErr.slice(1);
								logEntry.file = nameMap[file].sourceId;
								logEntry.line = Number.parseInt(line);
								if (!/error/i.test(type) && !/[\s\S]+\s*\:\s*syntax error/i.test(logEntry.message)) {
									synthWarnings.push(logEntry);
								} else {
									synthErrors.push(logEntry);
								}
							} else {
								synthErrors.push(logEntry);
							}
						}
					}
					if (err && !synthErrors.length) {
						synthErrors.push('Fatal error has occurred during simulation.');
					}
					return cb(null, {
						errors: synthErrors,
						warnings: synthWarnings
					});
				});
		}
	});
};

module.exports = {
	synthesize,
	validateFile,
	validateFiles
};
