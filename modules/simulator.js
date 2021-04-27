const Parser = require("./parser");
const VCD2JSON = require("./vcd-to-json");

const fs = require("fs");
const path = require("path");
const { exec, execFile } = require("child_process");

const generateWave = function (vcdContent, cb) {
	return VCD2JSON(vcdContent, cb);
};

const simulate = function (filesPath, fileName, nameMap, dumpName, cb) {
	const errorParsingRegEx = () => new RegExp('(.+)\\s*\\:\\s*(\\d+)\\s*\\:\\s*(.+)', 'gm');
	const innerErrorRegEx = () => new RegExp('\\s*(\\w+)\\s*\\:\\s*(.+)', 'igm');
	const fullPath = path.join(filesPath, fileName);

	const vvpName = `${Date.now()}.vvp`;
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
							error: "No files detected for simulation."
						});
					}


					return fs.readFile(fullPath, 'UTF-8', function (err, content) {
						if (err) {
							console.error(err);
							return cb({
								error: 'Failed to read testbench file.'
							});
						} else {
							let simulatorProc;
							const tbModules = Parser.extractModules(content);
							if (tbModules.length === 0) {
								return cb({
									error: 'Cannot extract top module.'
								});
							}
							if (tbModules.length > 1) {
								return cb({
									error: 'Only one top module per testbench is supported.'
								});
							}
							const topModule = tbModules[0];

							let names = files[0].replace(/\\/gm, '\\\\');

							for (let i = 1, end = files.length, asc = 1 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
								names = `${names} ${files[i].replace(/\\/gm, '\\\\')}`;
							}

							const cmd = `iverilog -s ${topModule} -Wall -Wno-timescale -o ${vvpName} ${names}`;

							return simulatorProc = exec(cmd, {
									cwd: filesPath,
									maxBuffer: 5000 * 1024,
									timeout: 10000
								},
								function (err, stdout, stderr) {
									let errorLines, errorMatches, extractionRegEx, file, line, lineErr, logEntry, type, typeMatches, vvpProc;
									if (err) {
										if (!stderr) {
											console.error(err);
											return cb({
												error: "An error occurred while building."
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
										errorLines = stderr.trim().split('\n');
										for (line of Array.from(errorLines)) {
											if ((line.trim() === '') || /^i give up\.$/i.test(line.trim())) {
												continue;
											}
											if (/\.lib\.v/gm.test(line) && /warning/gm.test(line)) {
												continue;
											}
											logEntry = {
												message: line.trim()
											};
											extractionRegEx = errorParsingRegEx();
											errorMatches = extractionRegEx.exec(line);
											logEntry.file = null;
											logEntry.line = 0;
											if (errorMatches !== null) {
												file = errorMatches[1];
												line = errorMatches[2];
												lineErr = errorMatches[3];
												if (innerErrorRegEx().test(lineErr)) {
													typeMatches = innerErrorRegEx().exec(lineErr);
													type = typeMatches[1].toLowerCase();
													lineErr = innerErrorRegEx().exec(lineErr)[2];
												}
												lineErr = lineErr.charAt(0).toUpperCase() + lineErr.slice(1);

												if (nameMap[file] != null) {
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
											} else {
												synthErrors.push(logEntry);
											}
										}
										if (err && !synthErrors.length) {
											synthErrors.push('Fatal error has occurred during simulation.');
										}
										if (synthErrors.length > 0) {
											return cb(null, synthErrors, synthWarnings, []);
										}
									}
									return vvpProc = execFile('vvp', [vvpName], {
											cwd: filesPath,
											maxBuffer: 5000 * 1024,
											timeout: 10000
										},
										function (err, stdout, stderr) {
											if (err) {
												if (!stderr) {
													console.error(err);
													return cb({
														error: "An error occurred while simulating."
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

											const simErrors = [];
											const simWarnings = [];

											if (stderr) {
												errorLines = stderr.trim().split('\n');
												for (line of Array.from(errorLines)) {
													if ((line.trim() === '') || /^i give up\.$/i.test(line.trim())) {
														continue;
													}
													logEntry = {
														message: line.trim()
													};
													extractionRegEx = errorParsingRegEx();
													errorMatches = extractionRegEx.exec(line);
													logEntry.file = null;
													logEntry.line = 0;
													if (errorMatches !== null) {
														file = errorMatches[1];
														line = errorMatches[2];
														lineErr = errorMatches[3];
														if (innerErrorRegEx().test(lineErr)) {
															typeMatches = innerErrorRegEx().exec(lineErr);
															type = typeMatches[1].toLowerCase();
															lineErr = innerErrorRegEx().exec(lineErr)[2];
														}
														lineErr = lineErr.charAt(0).toUpperCase() + lineErr.slice(1);
														logEntry.file = nameMap[file].sourceId;
														logEntry.line = Number.parseInt(line);
														if (!/error/i.test(type) && !/[\s\S]+\s*\:\s*syntax error/i.test(logEntry.message)) {
															simWarnings.push(logEntry);
														} else {
															simErrors.push(logEntry);
														}
													} else {
														simErrors.push(logEntry);
													}
												}
												if (simErrors.length > 0) {
													return cb(null, synthErrors.concat(simErrors), synthWarnings.concat(simWarnings), []);
												}
											}
											const vcdPath = path.join(filesPath, dumpName);
											return fs.readFile(vcdPath, 'UTF-8', function (err, content) {
												if (err) {
													console.error(err);
													return cb({
														error: 'Failed to read simulated file.'
													});
												} else {
													return cb(null, synthErrors.concat(simErrors), synthWarnings.concat(simWarnings), stdout.split('\n').filter(line => line.trim() !== ''), content);
												}
											});
										});
								});
						}
					});
				}
			});
		}
	});
};

module.exports = {
	generateWave,
	simulate
};