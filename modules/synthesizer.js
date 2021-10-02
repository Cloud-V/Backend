const fs = require("fs");
const path = require("path");
const mathjs = require("mathjs");
const { exec } = require("child_process");
const stripComments = require("strip-comments");

const config = require("../config");

const IORegex = new RegExp(`
		(input|output) 
	\\s*
		(wire|reg)?
	\\s*
		(?:
			\\[
				\\s*(\\S+?)\\s*
				\\:
				\\s*(\\S+?)\\s*
			\\]\\s*
		)?
	(
		(?!input|output)
		(?:[_A-Za-z][_A-Za-z0-9]*\\s*,\\s*)+
	)?
	(
		(?!input|output)
		(?:[_A-Za-z][_A-Za-z0-9]*)+
	)
`.split(/[\s\n]/).join(""), "gm");

const Parser = require("./parser");

const synthesize = function (filesPath, topModule, topModuleEntryId, stdcell, synthOptions, synthName, cb) {
	if (synthName == null) {
		synthName = 'synth.v';
	}
	const Repo = require("../controllers/repo");
	return Repo.getRepoEntry({
		_id: topModuleEntryId
	}, function (err, topModuleEntry) {
		if (err) {
			return cb(err);
		} else if (!topModuleEntry) {
			return cb({
				error: 'Cannot find the source file containing the top module.'
			});
		} else {
			return Parser.moduleExistsInFile(topModuleEntry._id, topModule, function (err, exists) {
				if (err) {
					return cb(err);
				} else if (!exists) {
					return cb({
						error: `Module '${topModule}' does not exist in '${topModuleEntry.title}'.`
					});
				} else {
					return fs.readdir(filesPath, function (err, files) {
						let file;
						if (err) {
							console.error(err);
							return cb({
								error: 'Failed to read verilog files.'
							});
						} else {
							let stdcellOpt = '';
							let flattenOpt = '';
							let purgeOpt = '';
							let procOpt = '';
							let memorymapOpt = '';

							if (synthOptions.flatten) {
								flattenOpt = "-p flatten";
							}
							if (synthOptions.purge) {
								purgeOpt = "-p 'opt_clean -purge'";
							}
							if (synthOptions.proc) {
								procOpt = "-p proc";
							}
							if (synthOptions.memorymap) {
								memorymapOpt = "-p memory_collect -p memory_map";
							}

							let stdcellPath = '';
							if ((stdcell != null) && (stdcell.trim() !== '')) {
								stdcellPath = path.join(config.stdcellRepo, stdcell, 'cells.lib');
								try {
									const stat = fs.lstatSync(stdcellPath);
									const abcPath = stdcellPath;
									stdcellOpt = `-p 'dfflibmap -liberty ${stdcellPath}' -p 'abc -liberty ${abcPath}'`;
								} catch (error) {
									const e = error;
									console.error(e);
									return cb({
										error: `Cannot find the standard cell library ${stdcell}`
									});
								}
							} else {
								return cb({
									error: 'Missing standard cell library file.'
								});
							}
							let args = (() => {
								const result = [];
								for (file of Array.from(files)) {
									result.push(`-p 'read_verilog ${file}'`);
								}
								return result;
							})();
							args = args.join(' ');

							const reportPath = path.join(filesPath, `${synthName}_rpt.txt`);

							let cmd = `yosys -q ${args} -p 'hierarchy -check -top ${topModule}' ${procOpt} -p opt -p techmap -p opt ${stdcellOpt} -p clean ${memorymapOpt} ${flattenOpt} ${purgeOpt} -p 'tee -o ${reportPath} stat -top ${topModule} -liberty ${stdcellPath}' -p 'write_verilog -noattr -noexpr ${synthName}'`;

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

									return fs.readFile(synthPath, 'UTF-8', function (err, content) {
										if (err) {
											return cb({
												error: 'Failed to read synthesized file.'
											});
										} else {
											try {
												//Reporter.synthesisReport content, stdcellPath, (err, report) ->
												return fs.readFile(reportPath, 'UTF-8', function (err, report) {
													if (err) {
														return cb(null, err, content, {
															errors,
															warnings,
															report: ''
														});
													} else {
														cmd = `vesta ${synthPath} ${stdcellPath}`;
														return exec(cmd, {
																//cwd: filesPath
																maxBuffer: 5000 * 1024,
																timeout: 30000
															},
															function (err, stdout, stderr) {
																if (err) {
																	console.error(err);
																	return cb(null, null, content, {
																		errors,
																		warnings,
																		report
																	});
																} else if (stdout) {
																	const matches = /Top \d+ maximum delay paths:\n(.+s)\n/g.exec(stdout);
																	if (matches != null) {
																		report = `Longest Path Summary:\n${matches[1]}\n\nDesign Summary:\n${report}`;
																	}
																	return cb(null, null, content, {
																		errors,
																		warnings,
																		report
																	});
																}
															});
													}
												});
											} catch (e) {
												console.error(e);
												cmd = `vesta ${synthPath} ${stdcellPath}`;
												return exec(cmd, {
														//cwd: filesPath
														maxBuffer: 5000 * 1024,
														timeout: 30000
													},
													function (err, stdout, stderr) {
														if (err) {
															console.error(err);
															return cb(null, null, content, {
																errors,
																warnings,
																report
															});
														} else if (stdout) {
															const matches = /Top \d+ maximum delay paths:\n(.+s)\n/g.exec(stdout);
															var report = undefined;
															if (matches != null) {
																report = `Longest Path Summary:\n${matches[1]}\n\nDesign Summary:\n Failed to generate design summary.`;
															}
															return cb(null, null, content, {
																errors,
																warnings,
																report
															});
														}
													});
											}
										}
									});
								});
						}
					});
				}
			});
		}
	});
};

const generateTestbench = function (sourceModule, entry, testbenchName, cb) {
	const FileManager = require("../controllers/file_manager");
	return FileManager.getFileContent(entry, function (err, content) {
		if (err) {
			return cb(err);
		} else {

			let e, hasParams, inputNames, inputPrefix, moduleContent, outputNames, outputPrefix;
			content = content.replace(/\/\/.*$/gm, '').replace(/\/\*(.|[\r\n])*?\*\//gm, '');

			//Extracing modules.
			const _getModuleRegex = () => /\s*module\s+(\w+)\s*(#\s*\(([\s\S]+?)\)\s*)??\s*((\([\s\S]*?\))?)\s*;\s*([\s\S]*?)\s*\bendmodule\b/gm;

			const _getParamRegex = function (modifiers) {
				if (modifiers == null) {
					modifiers = 'gm';
				}
				return new RegExp("(parameter)(\\s*\\[\\s*(\\d+)\\s*\\:\\s*(\\d+)\\s*\\]\\s*|\\s+)([\\s\\S]+?)\\s*[;,\\)]", modifiers);
			};
			const _getParamContentRegex = () => /([\s\S]*?)\s*=\s*([\s\S]+)/gm;
			const _getLiteralsRegex = () => /\s*(\d+)\s*\'([bodh])\s*([\dA-Fa-f_]+)\s*/im

			const moduleRegex = _getModuleRegex();
			const modules = {};
			let matches = moduleRegex.exec(content);

			const _clearParams = function (body) {
				const paramRegx = _getParamRegex();
				const replacementRegex = _getParamRegex('m');
				let paramMatches = paramRegx.exec(body);
				while (paramMatches != null) {
					body = body.replace(replacementRegex, '');
					const paramAssign = paramMatches[5].split(/\s*,\s*/gm);
					for (let assign of Array.from(paramAssign)) {
						const handSides = _getParamContentRegex().exec(assign);
						const lhs = handSides[1];
						let rhs = handSides[2];
						const literalsRegex = _getLiteralsRegex();
						const literalsReplacementRegex = _getLiteralsRegex();
						let literalMatches = literalsRegex.exec(rhs);
						while (literalMatches != null) {
							const numberOfBits = parseInt(literalMatches[1]);
							const base = literalMatches[2].toLowerCase();
							let value = literalMatches[3].toLowerCase();
							value = value.replace(/_/gm, '');
							const maxValue = Math.pow(2, numberOfBits + 1) - 1;
							let decimalValue = undefined;
							switch (base) {
								case 'b':
									decimalValue = parseInt(value, 2);
									break;
								case 'o':
									decimalValue = parseInt(value, 8);
									break;
								case 'd':
									decimalValue = parseInt(value, 10);
									break;
								case 'h':
									decimalValue = parseInt(value, 16);
									break;
							}
							if (decimalValue > maxValue) {
								throw {
									error: `The value ${value} exceeds the available ${numberOfBits} bits (max: ${maxValue}).`
								};
							}
							rhs = rhs.replace(literalsReplacementRegex, decimalValue);
							literalMatches = _getLiteralsRegex().exec(rhs);
						}

						const rhsEval = mathjs.eval(rhs);
						body = body.replace(new RegExp(`\\b${lhs}\\b`, 'gm'), rhsEval);
					}
					paramMatches = _getParamRegex().exec(body);
				}
				return body;
			};

			while (matches != null) {
				moduleContent = matches[0];
				const moduleName = matches[1];
				const moduleHeaderParams = matches[3];
				const moduleParams = matches[4];
				let moduleBody = matches[6];

				try {
					if (moduleHeaderParams != null) {
						moduleBody = _clearParams(`${moduleHeaderParams};\n${moduleBody}`);
					} else {
						moduleBody = _clearParams(moduleBody);
					}
				} catch (error) {
					e = error;
					if (e.error != null) {
						return cb(e);
					} else {
						console.error(e);
						return cb({
							error: 'Invalid usage of parameters.'
						});
					}
				}
				hasParams = (moduleParams.trim() !== '') && !/\( *\)/gm.test(moduleParams);
				let parsedParams = [];
				if (hasParams) {
					parsedParams = (/\( *([\s\S]+?) *\)/g).exec(moduleParams)[1].trim().split(/\s*,\s*/gm);
				}

				modules[moduleName] = {
					name: moduleName,
					content: moduleContent,
					params: parsedParams,
					body: moduleBody,
					hasParams
				};
				matches = moduleRegex.exec(content);
			}

			if ((modules[sourceModule] == null)) {
				return cb({
					error: `Module ${sourceModule} does not exist in the source file.`
				});
			}

			const targetModule = modules[sourceModule];
			const sourceModuleContent = targetModule.content;
			const sourceModuleBody = targetModule.body;

			//Extracting inputs/outputs.
			const inputs = [];
			const outputs = [];

			if (targetModule.hasParams) {
				for (let param of Array.from(targetModule.params)) {
					let matches = IORegex.exec(param);
					IORegex.lastIndex = 0;
					if (matches != null) {
						let width = '';
						// Indices
						if ((matches[3] != null) && (matches[4] != null)) {
							try {
								width = `[${mathjs.eval(
									matches[3].trim()
								)}:${
									mathjs.eval(matches[4].trim())
								}] `;
							} catch (error1) {
								e = error1;
								console.error(e);
								return cb({
									error: `Evaluation failed for [${
										matches[3].trim()
									}: ${
										matches[4].trim()
									}]`
								});
							}
						}
						let names = [];
						if (matches[5]) {
							names.concat(matches[5].split(/\s*,\s*/m));
						}
						names.push(matches[6]);
						names.forEach((name)=> {
							if (name.trim === '') {
								return;
							}
							if (matches[1] == "input") {
								return inputs.push({
									name: name,
									prefix: width,
									tbLine: `\treg ${width}${name}`
								});
							} else if (matches[1] == "output") {
								return outputs.push({
									name: name,
									prefix: width,
									tbLine: `\twire ${width}${name}`
								});
							}
						});
					}
				}
			}

			matches = IORegex.exec(sourceModuleBody);
			while (matches != null) {
				let width = '';
				if ((matches[3] != null) && (matches[4] != null)) {
					try {
						width = `[${
							mathjs.eval(matches[3].trim())
						}:${
							mathjs.eval(matches[4].trim())
						}] `;
					} catch (error3) {
						e = error3;
						console.error(e);
						return cb({
							error: `Evaluation failed for [${
								matches[3].trim()
							}: ${
								matches[4].trim()
							}]`
						});
					}
				}
				let names = [];
				if (matches[5]) {
					names.concat(matches[5].split(/\s*,\s*/m));
				}
				names.push(matches[6]);
				names.forEach((name)=> {
					if (name.trim === '') {
						return;
					}
					if (matches[1] == "input") {
						return inputs.push({
							name: name,
							prefix: width,
							tbLine: `\treg ${width}${name}`
						});
					} else if (matches[1] == "output") {
						return outputs.push({
							name: name,
							prefix: width,
							tbLine: `\twire ${width}${name}`
						});
					}
				});
				matches = IORegex.exec(sourceModuleBody);
			}

			let moduleInstantaionName = "uut";
			let moduleCounter = 2;
			while (modules[moduleInstantaionName] != null) {
				moduleInstantaionName = `uut${moduleCounter}`;
				moduleCounter++;
			}

			let moduleInstantaion = `${sourceModule} ${moduleInstantaionName} (\n`;
			let inputsDecl = '';
			let inputsInit = '';
			let outputsDecl = '';
			inputs.forEach(function (input) {
				inputsDecl = `${inputsDecl}${input.tbLine};\n`;
				inputsInit = `${inputsInit}\t\t${input.name} = 0;\n`;
				return moduleInstantaion = `${moduleInstantaion}\t\t.${input.name}(${input.name}),\n`;
			});

			outputs.forEach(function (output) {
				outputsDecl = `${outputsDecl}${output.tbLine};\n`;
				return moduleInstantaion = `${moduleInstantaion}\t\t.${output.name}(${output.name}),\n`;
			});
			moduleInstantaion = moduleInstantaion.trim();

			if (moduleInstantaion.indexOf(',', moduleInstantaion.length - 1) !== -1) {
				moduleInstantaion = `${moduleInstantaion.substring(0, moduleInstantaion.length - 1)}\n`;
			}

			moduleInstantaion = `\t${moduleInstantaion}\t);\n`;


			moduleContent = `\
\`timescale 1ns/1ns

module ${testbenchName};

\t//Inputs
${inputsDecl}

\t//Outputs
${outputsDecl}

\t//Instantiation of Unit Under Test
${moduleInstantaion}

\tinitial begin
\t//Inputs initialization
${inputsInit}

\t//Wait for the reset
\t\t#100;

\tend

endmodule`;
			return cb(null, moduleContent);
		}
	});
};

const extractPorts = function (sourceModule, entry, cb) {
	const FileManager = require("../controllers/file_manager");
	return FileManager.getFileContent(entry, function (err, content) {
		if (err) {
			return cb(err);
		} else {
			let e, end, hasParams, inputNames, inputPrefix, outputNames, outputPrefix, start;
			content = stripComments(content);

			//Extracing modules.
			const _getModuleRegex = () => new RegExp("\\s*module\\s+(\\w+)\\s*(#\\s*\\(([\\s\\S]+?)\\)\\s*)??\\s*((\\([\\s\\S]*?\\))?)\\s*;\\s*([\\s\\S]*?)\\s*\\bendmodule\\b", "gm");
			const _getInputRegex = () => new RegExp("(input)(\\s*\\[\\s*([\\s\\S]+?)\\s*\\:\\s*([\\s\\S]+?)\\s*\\]\\s*|\\s+)([\\s\\S]+?)\\s*[;]", 'gm');
			const _getOutputRegex = () => new RegExp("((output\\s+reg)|(output))(\\s*\\[\\s*([\\s\\S]+?)\\s*\\:\\s*([\\s\\S]+?)\\s*\\]\\s*|\\s+)([\\s\\S]+?)\\s*[;]", 'gm');

			const _getParamRegex = function (modifiers) {
				if (modifiers == null) {
					modifiers = 'gm';
				}
				return new RegExp("(parameter)(\\s*\\[\\s*(\\d+)\\s*\\:\\s*(\\d+)\\s*\\]\\s*|\\s+)([\\s\\S]+?)\\s*[;,\\)]", modifiers);
			};
			const _getParamContentRegex = () => new RegExp("([\\s\\S]*?)\\s*=\\s*([\\s\\S]+)", 'gm');
			const _getLiteralsRegex = () => new RegExp("\\s*(\\d+)\\s*\\'([bodh])\\s*([\\dabcdefABCDEF_]+)\\s*", "mi");

			const moduleRegex = _getModuleRegex();
			const modules = {};
			let matches = moduleRegex.exec(content);

			const _clearParams = function (body) {
				const paramRegx = _getParamRegex();
				const replacementRegex = _getParamRegex('m');
				let paramMatches = paramRegx.exec(body);
				while (paramMatches != null) {
					body = body.replace(replacementRegex, '');
					const paramAssign = paramMatches[5].split(/\s*,\s*/gm);
					for (let assign of Array.from(paramAssign)) {
						const handSides = _getParamContentRegex().exec(assign);
						const lhs = handSides[1];
						let rhs = handSides[2];
						const literalsRegex = _getLiteralsRegex();
						const literalsReplacementRegex = _getLiteralsRegex();
						let literalMatches = literalsRegex.exec(rhs);
						while (literalMatches != null) {
							const numberOfBits = parseInt(literalMatches[1]);
							const base = literalMatches[2].toLowerCase();
							let value = literalMatches[3].toLowerCase();
							value = value.replace(/_/gm, '');
							const maxValue = Math.pow(2, numberOfBits + 1) - 1;
							let decimalValue = undefined;
							switch (base) {
								case 'b':
									decimalValue = parseInt(value, 2);
									break;
								case 'o':
									decimalValue = parseInt(value, 8);
									break;
								case 'd':
									decimalValue = parseInt(value, 10);
									break;
								case 'h':
									decimalValue = parseInt(value, 16);
									break;
							}
							if (decimalValue > maxValue) {
								throw {
									error: `The value ${value} exceeds the available ${numberOfBits} bits (max: ${maxValue}).`
								};
							}
							rhs = rhs.replace(literalsReplacementRegex, decimalValue);
							literalMatches = _getLiteralsRegex().exec(rhs);
						}

						const rhsEval = mathjs.eval(rhs);
						body = body.replace(new RegExp(`\\b${lhs}\\b`, 'gm'), rhsEval);
					}
					paramMatches = _getParamRegex().exec(body);
				}
				return body;
			};

			while (matches != null) {
				const moduleContent = matches[0];
				const moduleName = matches[1];
				const moduleHeaderParams = matches[3];
				const moduleParams = matches[4];
				let moduleBody = matches[6];


				try {
					if (moduleHeaderParams != null) {
						moduleBody = _clearParams(`${moduleHeaderParams};\n${moduleBody}`);
					} else {
						moduleBody = _clearParams(moduleBody);
					}
				} catch (error) {
					e = error;
					if (e.error != null) {
						return cb(e);
					} else {
						console.error(e);
						return cb({
							error: 'Invalid usage of parameters.'
						});
					}
				}
				hasParams = (moduleParams.trim() !== '') && !/\( *\)/gm.test(moduleParams);
				let parsedParams = [];
				if (hasParams) {
					parsedParams = (/\( *([\s\S]+?) *\)/g).exec(moduleParams)[1].trim().split(/\s*,\s*/gm);
				}

				modules[moduleName] = {
					name: moduleName,
					content: moduleContent,
					params: parsedParams,
					body: moduleBody,
					hasParams
				};
				matches = moduleRegex.exec(content);
			}

			if ((modules[sourceModule] == null)) {
				return cb({
					error: `Module ${sourceModule} does not exist in the source file.`
				});
			}

			const targetModule = modules[sourceModule];
			const sourceModuleContent = targetModule.content;
			const sourceModuleBody = targetModule.body;

			//Extracting inputs/outputs.
			const inputs = [];
			const outputs = [];

			if (targetModule.hasParams) {
				for (let param of Array.from(targetModule.params)) {
					let paramMatches = /^(input)(\s*\[\s*([\s\S]+?)\s*\:\s*([\s\S]+?)\s*\]\s*|\s+)([\s\S]+?)\s*$/gm.exec(param);
					if (paramMatches != null) {
						inputPrefix = '';
						start = (end = undefined);
						if ((paramMatches[3] != null) && (paramMatches[4] != null)) {
							try {
								start = mathjs.eval(paramMatches[3].trim());
								end = mathjs.eval(paramMatches[4].trim());
								inputPrefix = `[${start}: ${end}] `;
							} catch (error1) {
								e = error1;
								console.error(e);
								return cb({
									error: `Evaluation failed for [${paramMatches[3].trim()}: ${paramMatches[4].trim()}]`
								});
							}
						}
						inputNames = paramMatches[5].split(/\s*,\s*/m);
						inputNames.forEach(function (inputName) {
							if (inputName.trim === '') {
								return;
							}
							if ((start != null) && (end != null)) {
								if (end < start) {
									const temp = start;
									start = end;
									end = temp;
								}
								return __range__(start, end, true).map((i) =>
									inputs.push({
										name: inputName,
										// prefix: inputPrefix
										index: i,
										type: 'input',
										instance: `${inputName}[${i}]`
									}));
							} else {
								return inputs.push({
									name: inputName,
									// prefix: inputPrefix
									index: 0,
									type: 'input',
									instance: `${inputName}`
								});
							}
						});
					} else {
						paramMatches = /^((output\s+reg)|(output))(\s*\[\s*([\s\S]+?)\s*\:\s*([\s\S]+?)\s*\]\s*|\s+)([\s\S]+?)\s*$/gm.exec(param);
						if (paramMatches != null) {
							outputPrefix = '';
							start = (end = undefined);
							if ((paramMatches[5] != null) && (paramMatches[6] != null)) {
								try {
									start = mathjs.eval(paramMatches[5].trim());
									end = mathjs.eval(paramMatches[6].trim());
									outputPrefix = `[${start}: ${end}] `;
								} catch (error2) {
									e = error2;
									console.error(e);
									return cb({
										error: `Evaluation failed for [${paramMatches[5].trim()}: ${paramMatches[6].trim()}]`
									});
								}
							}
							outputNames = paramMatches[7].split(/\s*,\s*/m);
							outputNames.forEach(function (outputName) {
								if (outputName.trim() === '') {
									return;
								}
								if ((start != null) && (end != null)) {
									if (end < start) {
										const temp = start;
										start = end;
										end = temp;
									}
									return __range__(start, end, true).map((i) =>
										inputs.push({
											name: outputName,
											// prefix: outputPrefix
											index: i,
											type: 'output',
											instance: `${outputName}[${i}]`
										}));
								} else {
									return outputs.push({
										name: outputName,
										// prefix: outputPrefix
										index: 0,
										type: 'output',
										instance: `${outputName}`
									});
								}
							});
						}
					}
				}
			}

			matches = IORegex.exec(sourceModuleBody);
			while (matches != null) {
				inputPrefix = '';
				start = (end = undefined);
				if ((matches[3] != null) && (matches[4] != null)) {
					try {
						start = mathjs.eval(matches[3].trim());
						end = mathjs.eval(matches[4].trim());
						inputPrefix = `[${start}: ${end}] `;
					} catch (error3) {
						e = error3;
						console.error(e);
						return cb({
							error: `Evaluation failed for [${matches[3].trim()}: ${matches[4].trim()}]`
						});
					}
				}
				inputNames = matches[5].split(/\s*,\s*/m);
				inputNames.forEach(function (inputName) {
					if (inputName.trim === '') {
						return;
					}
					if ((start != null) && (end != null)) {
						if (end < start) {
							const temp = start;
							start = end;
							end = temp;
						}
						return __range__(start, end, true).map((i) =>
							inputs.push({
								name: inputName,
								// prefix: inputPrefix
								index: i,
								type: 'input',
								instance: `${inputName}[${i}]`
							}));
					} else {
						return inputs.push({
							name: inputName,
							// prefix: inputPrefix
							index: 0,
							type: 'input',
							instance: `${inputName}`
						});
					}
				});
				matches = IORegex.exec(sourceModuleBody);
			}

			matches = IORegex.exec(sourceModuleBody);
			while (matches != null) {
				outputPrefix = '';
				start = (end = undefined);
				if ((matches[5] != null) && (matches[6] != null)) {
					try {
						start = mathjs.eval(matches[5].trim());
						end = mathjs.eval(matches[6].trim());
						outputPrefix = `[${start}: ${end}] `;
					} catch (error4) {
						e = error4;
						console.error(e);
						return cb({
							error: `Evaluation failed for [${matches[5].trim()}: ${matches[6].trim()}]`
						});
					}
				}
				outputNames = matches[7].split(/\s*,\s*/m);
				outputNames.forEach(function (outputName) {
					if (outputName.trim() === '') {
						return;
					}
					if ((start != null) && (end != null)) {
						if (end < start) {
							const temp = start;
							start = end;
							end = temp;
						}
						return __range__(start, end, true).map((i) =>
							inputs.push({
								name: outputName,
								// prefix: outputPrefix
								index: i,
								type: 'output',
								instance: `${outputName}[${i}]`
							}));
					} else {
						return outputs.push({
							name: outputName,
							// prefix: outputPrefix
							index: 0,
							type: 'output',
							instance: `${outputName}`
						});
					}
				});
				matches = IORegex.exec(sourceModuleBody);
			}


			return cb(null, {
				ports: inputs.concat(outputs)
			});
		}
	});
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
	validateFiles,
	generateTestbench,
	extractPorts
};

function __range__(left, right, inclusive) {
	let range = [];
	let ascending = left < right;
	let end = !inclusive ? right : ascending ? right + 1 : right - 1;
	for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
		range.push(i);
	}
	return range;
}