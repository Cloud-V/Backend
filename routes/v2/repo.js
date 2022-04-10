const express = require("express");

const config = require("../../config");

const restrict = require("../../passport/restrict");

const Repo = require("../../controllers/repo");
const User = require("../../controllers/user");
const FileManager = require("../../controllers/file_manager");

const repoAccessModel = require("../../models/repo_access");
const repoEntryModel = require("../../models/repo_entry");

const Synthesizer = require("../../modules/synthesizer");
const Simulator = require("../../modules/simulator");
const FSMCompiler = require("../../modules/fsm_compiler");
const Mailer = require("../../modules/mailer");
const Boards = require("../../modules/boards");

const _ = require("underscore");
const multer = require("multer");
const shortid = require("shortid");
const rmdir = require("rimraf");

const fileExists = require("file-exists");
const request = require("request");
const isBinaryFile = require("isbinaryfile");
const { format: urlFormatter } = require("url");
const { minify } = require("html-minifier");
const fs = require("fs-extra");

const path = require("path");
const { promisify } = require("util");

const { EntrySource, EntryType, EntryAccess, EntryState } = repoEntryModel;
const { AccessLevel } = repoAccessModel;
const { proc } = config;

const requestTimeout = config.docker.timeout * 1000;

const router = express.Router();

const storage = multer.diskStorage({
	destination(req, file, next) {
		const uploadPath = path.join(process.cwd(), "uploads");
		return next(null, uploadPath);
	},
	filename(req, file, next) {
		return next(
			null,
			file.fieldname +
				"-" +
				path.basename(
					file.originalname,
					path.extname(file.originalname)
				) +
				"-" +
				shortid.generate() +
				"-" +
				((req.user || {})._id || "") +
				"-" +
				Date.now() +
				path.extname(file.originalname)
		);
	}
});

const fileUploader = multer({
	storage,
	fileFilter(req, file, next) {
		const ext = path.extname(file.originalname);
		return next(null, true);
	},
	limits: {
		fileSize: 4000000
	}
}).single("fileUpload");

const repoUploader = multer({
	storage,
	fileFilter(req, file, next) {
		const ext = path.extname(file.originalname);
		if (ext !== ".zip") {
			return next(
				{
					error: "Unsupported file format."
				},
				null
			);
		}
		return next(null, true);
	},
	limits: {
		fileSize: 50000000
	}
}).single("repoUpload");

router.post("/update", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	const {
		body: { repoTitle, description, privacy }
	} = req;
	const newRepoName = repoTitle.trim().toLowerCase();
	const updates = {
		repoTitle,
		repoName: newRepoName,
		description,
		privacy
	};
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		if (accessLevel < AccessLevel.Owner) {
			return res.status(403).json({
				error: "Access denied (insufficient permissions)."
			});
		}
		const updatedRepo = await repository.edit(updates);
		return res.json(updatedRepo);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.post("/compile", restrict, async function(req, res, next) {
try {
	const logged = req.isAuthenticated() || false;
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}
	if (req.body.action == null) {
		return res.status(400).json({
			error: "Missing parameter 'action'"
		});
	}

	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const action = req.body.action.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	let result = await Repo.accessRepo(ownerName, repoName, userId, next);
	if (result.accessLevel < AccessLevel.ReadWrite) {
		return res.status(403).json({
			error: "Access denied (insufficient permissions)."
		});
	}
	const { repository: repo, accessLevel: role } = result;
	let value;
	for (var key in req.body) {
		value = req.body[key];
		if (key !== "options") {
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		} else {
			if (typeof value !== "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
	}

	if (
		action !== "sw" &&
		(repo.topModule == null ||
			repo.topModuleEntry == null ||
			repo.topModule.trim() === "")
	) {
		return res.status(500).json({
			error: "You must set a top module for your project."
		});
	}
	let name = (req.body.name || "netlist").trim();
	if (name === "") {
		name = "netlist";
	}
	if (name.indexOf(".v", name.length - 2) !== -1) {
		name = name.substring(0, name.length - 2);
	}
	let synthName = `${name}.v`;
	let overwrite =
		req.body.overwrite != null ? req.body.overwrite : false;
	let stdcell = req.body.stdcell != null ? req.body.stdcell : null;

	let synthOptions = {
		flatten: true,
		purge: true,
		proc: true,
		memorymap: true
	};
	let bodyOptions = req.body.options;
	if (bodyOptions != null) {
		if (bodyOptions.flatten != null && !bodyOptions.flatten) {
			synthOptions.flatten = false;
		}
		if (bodyOptions.purge != null && !bodyOptions.purge) {
			synthOptions.purge = false;
		}
		if (bodyOptions.proc != null && !bodyOptions.proc) {
			synthOptions.proc = false;
		}
		if (bodyOptions.memorymap != null && !bodyOptions.memorymap) {
			synthOptions.memorymap = false;
		}
	}
	if (process.env.CLOUDV_DISABLE_DOCKER !== "1") {
		const synthType = req.body.synthType || "sync";
		if (action === "synthesize") {
			const synthesisUrl =
				proc.url + proc.synthesizePath;
			requestBody = _.clone(req.body);
			delete requestBody.user;
			requestBody.username = ownerName;
			requestBody.reponame = repoName;
			requestBody.synthType = synthType;
			res.socket.setTimeout(requestTimeout);
			if (synthType === "sync" || config.batch.noAWSBatch) {
				return request.post(
					{
						url: synthesisUrl,
						uri: synthesisUrl,
						json: requestBody,
						timeout: requestTimeout,
						gzip: true
					},
					function(err, httpResponse, body) {
						if (err) {
							console.error(err);
							if (
								err.code === "ETIMEDOUT" ||
								err.code === "ESOCKETTIMEDOUT" ||
								err.code === "ECONNRESET"
							) {
								return res.status(500).json({
									error:
										"Job timed out."
								});
							}
							return res.status(500).json({
								error: "Failed to submit the job."
							});
						} else if (httpResponse.statusCode !== 200) {
							if (body != null && body.error != null) {
								return res.status(500).json({
									error: body.error
								});
							} else {
								return res.status(500).json({
									error: "An unexpected error has occurred."
								});
							}
						} else {
							if (!body) {
								console.error("Body is null!");
								return res.status(500).json({
									error: "An unexpected error has occurred."
								});
							}
							const { reportErr } = body;
							const { synthContent } = body;
							const { synthLog } = body;
							if (!synthLog || !synthLog.errors) {
								console.error(body);
								return res.status(500).json({
									error: "An unexpected error has occurred."
								});
							}
							if (synthLog.errors.length === 0) {
								return repo.createNetlist(
									req.user,
									name,
									synthContent,
									`Netlist created on ${new Date()}`,
									EntryState.Ready,
									overwrite,
									function(err, netlistResult) {
										if (err) {
											return res
												.status(500)
												.json(err);
										} else {
											const {
												entry: netlistEntry
											} = netlistResult;
											return repo.createSynthesisReport(
												req.user,
												name,
												synthLog.report || "",
												`Report created on ${new Date()}`,
												EntryState.Ready,
												true,
												function(
													err,
													reportResult
												) {
													if (err) {
														console.error(
															err
														);
														return res
															.status(500)
															.json({
																parentId:
																	netlistEntry.parent,
																fileId:
																	netlistEntry._id,
																fileName:
																	netlistEntry.title,
																fileType:
																	"netlist",
																content: synthContent,
																log: synthLog,
																reportErrors: reportErr,
																synthesisReport: null,
																noBatch: true
															});
													} else {
														const {
															entry: reportEntry
														} = reportResult;
														return res
															.status(200)
															.json({
																parentId:
																	netlistEntry.parent,
																fileId:
																	netlistEntry._id,
																fileName:
																	netlistEntry.title,
																fileType:
																	"netlist",
																content: synthContent,
																log: synthLog,
																reportErrors: reportErr,
																synthesisReport: Object.assign(
																	reportEntry,
																	{
																		type:
																			reportEntry.handlerName
																	}
																),
																noBatch: true
															});
													}
												}
											);
										}
									}
								);
							} else {
								return res.status(200).json({
									parentId: null,
									fileId: null,
									log: synthLog,
									noBatch: true
								});
							}
						}
					}
				);
			} else {
				return repo.createNetlist(
					req.user,
					name,
					"",
					`Netlist created on ${new Date()}`,
					EntryState.Pending,
					overwrite,
					function(err, netlistResult) {
						if (err) {
							return res.status(500).json(err);
						} else {
							const {
								entry: netlistEntry
							} = netlistResult;
							return repo.createSynthesisReport(
								req.user,
								name,
								"",
								`Report created on ${new Date()}`,
								EntryState.Pending,
								true,
								function(err, reportResult) {
									if (err) {
										console.error(err);
										netlistEntry.remove(function(
											err
										) {
											if (err) {
												return console.error(
													err
												);
											}
										});
										return res.status(500).json({
											error:
												"Failed to submit the job."
										});
									} else {
										let {
											entry: reportEntry
										} = reportResult;
										requestBody.netlist =
											netlistEntry._id;
										requestBody.report =
											reportEntry._id;
										return request.post(
											{
												url: synthesisUrl,
												json: requestBody,
												timeout: requestTimeout,
												synthType: "async"
											},
											function(
												err,
												httpResponse,
												body
											) {
												if (err) {
													console.error(err);
													netlistEntry.remove(
														function(err) {
															if (err) {
																return console.error(
																	err
																);
															}
														}
													);
													reportEntry.remove(
														function(err) {
															if (err) {
																return console.error(
																	err
																);
															}
														}
													);
													if (
														err.code ===
															"ETIMEDOUT" ||
														err.code ===
															"ESOCKETTIMEDOUT" ||
														err.code ===
															"ECONNRESET"
													) {
														return res
															.status(500)
															.json({
																error:
																	"Job timed out."
															});
													}
													return res
														.status(500)
														.json({
															error:
																"Failed to submit the job."
														});
												} else if (
													httpResponse.statusCode !==
													200
												) {
													netlistEntry.remove(
														function(err) {
															if (err) {
																return console.error(
																	err
																);
															}
														}
													);
													reportEntry.remove(
														function(err) {
															if (err) {
																return console.error(
																	err
																);
															}
														}
													);
													if (
														body != null &&
														body.error !=
															null
													) {
														return res
															.status(500)
															.json({
																error:
																	body.error
															});
													} else {
														return res
															.status(500)
															.json({
																error:
																	"An unexpected error has occurred."
															});
													}
												} else {
													if (
														reportEntry.toJSON !=
														null
													) {
														reportEntry = reportEntry.toJSON();
													}
													reportEntry.type =
														"p_srpt";
													return res
														.status(200)
														.json({
															parentId:
																netlistEntry.parent,
															fileId:
																netlistEntry._id,
															fileName:
																netlistEntry.title,
															fileType:
																"p_netlist",
															// content: synthContent
															// log: synthLog
															// reportErrors: reportErr
															synthesisReport: Object.assign(
																reportEntry,
																{
																	type:
																		reportEntry.handlerName
																}
															),
															noBatch: false
														});
												}
											}
										);
									}
								}
							);
						}
					}
				);
			}
		} else if (action === "validate") {
			const validateUrl =
				proc.url + proc.validatePath;
			requestBody = _.clone(req.body);
			delete requestBody.user;
			requestBody.username = ownerName;
			requestBody.reponame = repoName;
			res.socket.setTimeout(requestTimeout);
			return request.post(
				{
					url: validateUrl,
					json: requestBody,
					timeout: requestTimeout
				},
				function(err, httpResponse, body) {
					if (err) {
						console.error(err);
						if (
							err.code === "ETIMEDOUT" ||
							err.code === "ESOCKETTIMEDOUT" ||
							err.code === "ECONNRESET"
						) {
							return res.status(500).json({
								error:
									"Job timed out."
							});
						}
						return res.status(500).json({
							error: "Failed to submit the job."
						});
					} else if (httpResponse.statusCode !== 200) {
						if (body != null && body.error != null) {
							return res.status(500).json({
								error: body.error
							});
						} else {
							return res.status(500).json({
								error: "An unexpected error has occurred."
							});
						}
					} else {
						return res.status(200).json(body);
					}
				}
			);
		} else if (action === "bitstream") {
			if (req.body.pcf == null) {
				return res.status(400).json({
					error: "Missing parameter 'pcf'"
				});
			}
			const pcfId = req.body.pcf;
			name = (req.body.name || "bitstream").trim();
			if (name === "") {
				name = "bitstream";
			}
			if (name.indexOf(".bin", name.length - 4) !== -1) {
				name = name.substring(0, name.length - 4);
			}
			const bitstreamName = `${name}.bin`;
			return repo.getEntry(
				{
					_id: pcfId
				},
				function(err, pcfEntry) {
					if (err) {
						return res.status(500).json(err);
					} else if (!pcfEntry) {
						return res.status(500).json({
							error: "Cannot find pin constraints file."
						});
					} else {
						const compileUrl =
							proc.url +
							proc.bitstreamPath;
						requestBody = _.clone(req.body);
						delete requestBody.user;
						requestBody.username = ownerName;
						requestBody.reponame = repoName;
						res.socket.setTimeout(requestTimeout);
						return request.post(
							{
								url: compileUrl,
								json: requestBody,
								timeout: requestTimeout,
								gzip: true
							},
							function(err, httpResponse, body) {
								if (err) {
									console.error(err);
									if (
										err.code === "ETIMEDOUT" ||
										err.code ===
											"ESOCKETTIMEDOUT" ||
										err.code === "ECONNRESET"
									) {
										return res.status(500).json({
											error:
												"Job timed out."
										});
									}
									return res.status(500).json({
										error: "Failed to submit the job."
									});
								} else if (
									httpResponse.statusCode !== 200
								) {
									if (
										body != null &&
										body.error != null
									) {
										return res.status(500).json({
											error: body.error
										});
									} else {
										return res.status(500).json({
											error:
												"An unexpected error has occurred."
										});
									}
								} else {
									if (!body) {
										console.error("Body is null!");
										return res.status(500).json({
											error:
												"An unexpected error has occurred."
										});
									}

									const { synthLog } = body;
									let bitstreamContent = undefined;
									if (body.bitstreamContent) {
										bitstreamContent = Buffer.from(
											body.bitstreamContent,
											"base64"
										);
									}
									if (!synthLog || !synthLog.errors) {
										console.error(body);
										return res.status(500).json({
											error:
												"An unexpected error has occurred."
										});
									}
									if (synthLog.errors.length === 0) {
										return repo.createBitstream(
											req.user,
											name,
											bitstreamContent,
											`Bitstream created on ${new Date()}`,
											overwrite,
											function(err, result) {
												if (err) {
													return res
														.status(500)
														.json(err);
												} else {
													const {
														entry: bitsream
													} = result;
													return res
														.status(200)
														.json({
															parentId:
																bitsream.parent,
															fileId:
																bitsream._id,
															fileName:
																bitsream.title,
															fileType:
																"bin",
															log: synthLog
														});
												}
											}
										);
									} else {
										return res.status(200).json({
											parentId: null,
											fileId: null,
											log: synthLog
										});
									}
								}
							}
						);
					}
				}
			);
		} else if (action === "sw") {
			let name = (req.body.name || "sw").trim();
			if (name === "") {
				name = "sw";
			} else if (name.indexOf(".hex", name.length - 4) !== -1) {
				name = name.substring(0, name.length - 4);
			}

			if (!["riscv", "arm"].includes(req.body.target)) {
				return res.status(500).json({
					error: "Invalid target architecture."
				});
			}

			const linkerFile = req.body.linker;
			const startupFile = req.body.startup;
			if (typeof linkerFile !== "string" || !linkerFile.length) {
				return res.status(500).json({
					error: "A linker script is required."
				});
			}
			if (typeof startupFile !== "string" || !startupFile.length) {
				return res.status(500).json({
					error: "A startup script is required."
				});
			}

			name = `${name}.hex`;
			const compileUrl = proc.url + proc.swPath;

			requestBody = _.clone(req.body);
			delete requestBody.user;
			requestBody.username = ownerName;
			requestBody.reponame = repoName;

			try {
				let linkerEntry = await repo.p.getEntry({
					_id: linkerFile,
					handler: EntryType.LinkerScript
				});
				if (!linkerEntry) {
					return res.status(500).json({
						error: "Linker Script not found"
					});
				}

				let startupEntry = await repo.p.getEntry({
					_id: startupFile,
					handler: EntryType.StartupScript
				});
				if (!startupEntry) {
					return res.status(500).json({
						error: "Startup Script not found"
					});
				}

				res.socket.setTimeout(requestTimeout);
				let { httpResponse, body } = await new Promise((resolve, reject)=>
					request.post(
						{
							url: compileUrl,
							json: requestBody,
							timeout: requestTimeout
						},
						function(
							err,
							httpResponse,
							body
						) {
							if (err) {
								return reject(err);
							}
							return resolve({httpResponse, body});
						}
					)
				).catch(err=> {
					console.error(err);
					if (
						["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET"].includes(
							err.code
						)
					) {
						throw { error: "Job timed out." };
					}
					throw { error: "Failed to submit the job." };
				});
				
				if (httpResponse.statusCode !== 200) {
					if (body != null && body.error != null) {
						throw { error: body.error };
					}

					throw { error: "An unknown error has occurred." };
				}
				const { compilationLog, hexContent, listContent } = body;

				if (compilationLog.errors.length !== 0 ) {
					return res
						.status(200)
						.json({
							parentId: null,
							fileId: null,
							log: compilationLog
						});
				}
				
				let { entry: hexEntry } = await repo.p.createHexFile(
					req.user,
					name,
					hexContent,
					`Hex created on ${new Date()}`,
					overwrite
				);

				if (!listContent) {
					return res.status(200).json({
						parentId:
							hexEntry.parent,
						fileId:
							hexEntry._id,
						fileName:
							hexEntry.title,
						fileType:
							hexEntry.handlerName,
						content: hexContent,
						list: null,
						log: compilationLog
					});
				}

				let listResult = null;
				let list = null;
				listResult = await repo.p.createListFile(
					req.user,
					name,
					listContent,
					`List created on ${new Date()}`,
					overwrite
				).catch(err=> {
					console.error(err);
				});
				if (listResult) {
					let { entry: listEntry } = listResult;
					list = {
						parentId:
							listEntry.parent,
						fileId:
							listEntry._id,
						fileName:
							listEntry.title,
						fileType:
							hexEntry.handlerName,
						content: listContent
					};
				}

				return res.status(200).json({
					parentId:
						hexEntry.parent,
					fileId:
						hexEntry._id,
					fileName:
						hexEntry.title,
					fileType:
						hexEntry.handlerName,
					content: hexContent,
					list: list,
					log: compilationLog
				});
			} catch (err) {
				console.error(err);
				return res.status(500).json(err);
			}

		} else {
			return res.status(400).json({
				error: `Unsupported operation '${action}'.`
			});
		}
	} else {
		return FileManager.writeTempRepoModules(repo, function(
			err,
			tempPath,
			files,
			reverseMap
		) {
			if (err) {
				if (typeof tempPath === "string") {
					fs.exists(tempPath, function(exists) {
						if (exists) {
							return rmdir(tempPath, function(err) {
								if (err) {
									return console.error(err);
								}
							});
						}
					});
				}
				return res.status(500).json(err);
			} else {
				if (action === "synthesize") {
					for (key in req.body) {
						value = req.body[key];
						if (key !== "options") {
							if (typeof value === "object") {
								return res.status(400).json({
									error: `Invalid value for the parameter ${key}`
								});
							}
						} else {
							if (typeof value !== "object") {
								return res.status(400).json({
									error: `Invalid value for the parameter ${key}`
								});
							}
						}
					}

					if (
						repo.topModule == null ||
						repo.topModuleEntry == null ||
						repo.topModule.trim() === ""
					) {
						rmdir(tempPath, function(err) {
							if (err) {
								return console.error(err);
							}
						});
						return res.status(500).json({
							error:
								"You must set a top module for your project"
						});
					}
					name = (req.body.name || "netlist").trim();
					if (name === "") {
						name = "netlist";
					}
					if (name.indexOf(".v", name.length - 2) !== -1) {
						name = name.substring(0, name.length - 2);
					}
					synthName = `${name}.v`;
					const { topModule } = repo;
					const topModuleEntryId = repo.topModuleEntry;
					overwrite =
						req.body.overwrite != null
							? req.body.overwrite
							: false;
					stdcell =
						req.body.stdcell != null
							? req.body.stdcell
							: null;

					synthOptions = {
						flatten: true,
						purge: true,
						proc: true,
						memorymap: true
					};
					bodyOptions = req.body.options;
					if (bodyOptions != null) {
						if (
							bodyOptions.flatten != null &&
							!bodyOptions.flatten
						) {
							synthOptions.flatten = false;
						}
						if (
							bodyOptions.purge != null &&
							!bodyOptions.purge
						) {
							synthOptions.purge = false;
						}
						if (
							bodyOptions.proc != null &&
							!bodyOptions.proc
						) {
							synthOptions.proc = false;
						}
						if (
							bodyOptions.memorymap != null &&
							!bodyOptions.memorymap
						) {
							synthOptions.memorymap = false;
						}
					}

					return Synthesizer.synthesize(
						tempPath,
						topModule,
						topModuleEntryId,
						stdcell,
						synthOptions,
						synthName,
						function(
							err,
							reportErr,
							synthContent,
							synthLog
						) {
							rmdir(tempPath, function(err) {
								if (err) {
									return console.error(err);
								}
							});
							if (err) {
								return res.status(500).json(err);
							} else {
								if (synthLog.errors.length === 0) {
									return repo.createNetlist(
										req.user,
										name,
										synthContent,
										`Netlist created on ${new Date()}`,
										overwrite,
										function(err, netlistResult) {
											if (err) {
												return res
													.status(500)
													.json(err);
											} else {
												const {
													entry: netlistEntry
												} = netlistResult;
												return repo.createSynthesisReport(
													req.user,
													name,
													synthLog.report ||
														"",
													`Report created on ${new Date()}`,
													true,
													function(
														err,
														reportResult
													) {
														if (err) {
															console.error(
																err
															);
															return res
																.status(
																	500
																)
																.json({
																	parentId:
																		netlistEntry.parent,
																	fileId:
																		netlistEntry._id,
																	fileName:
																		netlistEntry.title,
																	fileType:
																		"netlist",
																	content: synthContent,
																	log: synthLog,
																	reportErrors: reportErr,
																	synthesisReport: null
																});
														} else {
															const {
																entry: reportEntry
															} = reportResult;
															return res
																.status(
																	200
																)
																.json({
																	parentId:
																		netlistEntry.parent,
																	fileId:
																		netlistEntry._id,
																	fileName:
																		netlistEntry.title,
																	fileType:
																		"netlist",
																	content: synthContent,
																	log: synthLog,
																	reportErrors: reportErr,
																	synthesisReport: Object.assign(
																		reportEntry,
																		{
																			type:
																				reportEntry.handlerName
																		}
																	)
																});
														}
													}
												);
											}
										}
									);
								} else {
									return res.status(200).json({
										parentId: null,
										fileId: null,
										log: synthLog
									});
								}
							}
						}
					);
				} else if (action === "validate") {
					return res.status(500).json({
						error:
							"Single file validation is no longer supported."
					});
					for (key in req.body) {
						value = req.body[key];
						if (typeof value === "object") {
							return res.status(400).json({
								error: `Invalid value for the parameter ${key}`
							});
						}
					}
					return Synthesizer.validateFiles(
						tempPath,
						reverseMap,
						function(err, fileErrors) {
							if (err) {
								res.status(500).json(err);
							} else {
								res.status(200).json(fileErrors);
							}
							return rmdir(tempPath, function(err) {
								if (err) {
									return console.error(err);
								}
							});
						}
					);
				} else {
					return res.status(400).json({
						error: `Unsupported operation '${action}'.`
					});
				}
			}
		});
	}

} catch (err) {
	console.error(err);
	return res.status(500).json(err);
}
});

router.post("/delete", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();

	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		if (accessLevel < AccessLevel.Owner) {
			return res.status(403).json({
				error: "Access denied (insufficient permissions)."
			});
		}
		const deletedRepo = await Repo.deleteRepo(repository);
		return res.json(deletedRepo);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/raw/*", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}
	if (req.params["0"] == null || req.params["0"].trim() === "") {
		return next();
	}

	const filePath = req.params["0"];
	const filesTree = filePath
		.split("/")
		.filter(filePath => filePath.trim() !== "");
	if (filesTree.length === 0) {
		return next();
	}
	const clearedFilePath = filesTree.join("/");
	const formattedFilePath = filesTree.join(" / ");
	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		}
		const { repository: repo, accessLevel: role } = result;
		return repo.isReadable(userId, function(err, readable) {
			if (!readable) {
				return next();
			} else {
				return repo.getEntryByPath(clearedFilePath, function(
					err,
					result
				) {
					if (err) {
						return res.status(500).json(err);
					} else if (!result) {
						return next();
					} else if (!result.isReadableFile()) {
						return res.status(400).json({ "error": "Current file type is not supported for reading." });
					} else {
						return FileManager.getFileContent(result, function(
							err,
							content
						) {
							if (err) {
								return res.status(500).json;
							} else {
								return res.send(content);
							}
						});
					}
				});
			}
		});
	});
});

router.get("/get/:fileid", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}
	if (req.params.fileid == null) {
		return res.status(400).json({
			error: "Missing parameter 'fileid'"
		});
	}

	const fileId = req.params.fileid;
	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();
	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		}
		const { repository: repo, accessLevel: role } = result;
		return repo.isReadable(userId, function(err, readable) {
			if (!readable) {
				return next();
			} else {
				return repo.getEntry(
					{
						_id: fileId
					},
					function(err, entry) {
						if (err) {
							return res.status(500).json(err);
						} else if (!entry) {
							return next();
						} else if (
							[EntryType.Folder, EntryType.RepoRoot].includes(
								entry.handler
							)
						) {
							return entry.getChildren({}, "dhtmlx", function(
								err,
								children
							) {
								if (err) {
									return res.status(500).json(err);
								} else {
									return res.json({
										content: {
											children
										},
										name: entry.title
									});
								}
							});
						} else if (entry.handler === EntryType.VCDFile) {
							return FileManager.getFileContent(entry, function(
								err,
								content
							) {
								if (err) {
									return res.status(500).json(err);
								} else {
									return Simulator.generateWave(
										content,
										function(err, wave) {
											if (err) {
												return res
													.status(500)
													.json(err);
											} else {
												const fileType =
													entry.handlerName;
												return res.status(200).json({
													content: wave,
													fileId: entry._id,
													parentId: entry.parent,
													name: entry.title,
													type: fileType,
													username,
													timing: entry.attributes
												});
											}
										}
									);
								}
							});
						} else if (entry.handler === EntryType.IP) {
							return FileManager.getFileContent(entry, function(
								err,
								content
							) {
								if (err) {
									return res.status(500).json(err);
								} else {
									const fileType = entry.handlerName;
									const jsonContent = JSON.parse(content);
									jsonContent._id = jsonContent.id = jsonContent.user = undefined;
									return res.status(200).json({
										content: JSON.stringify(jsonContent),
										fileId: entry._id,
										parentId: entry.parent,
										name: entry.title,
										type: fileType,
										username
									});
								}
							});
						} else if (entry.handler === EntryType.DCFFile) {
							return FileManager.getFileContent(entry, function(
								err,
								content
							) {
								if (err) {
									return res.status(500).json(err);
								} else {
									const fileType = entry.handlerName;
									const jsonContent = JSON.parse(content);
									return res.status(200).json({
										content: JSON.stringify(jsonContent),
										fileId: entry._id,
										parentId: entry.parent,
										name: entry.title,
										type: fileType,
										username
									});
								}
							});
						} else if (entry.isReadableFile()) {
							return FileManager.getFileContent(entry, function(
								err,
								content
							) {
								if (err) {
									return res.status(500).json(err);
								} else {
									const fileType = entry.handlerName;
									return res.status(200).json({
										content,
										fileId: entry._id,
										parentId: entry.parent,
										name: entry.title,
										type: fileType,
										username
									});
								}
							});
						} else {
							return res.status(400).json({
								error: "Cannot send the required file."
							});
						}
					}
				);
			}
		});
	});
});
router.get("/boards", restrict, function(req, res, next) {
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}

	const userId = req.user._id;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(
		ownerName,
		repoName,
		userId,
		next
	).then(result=> {
		const { repository } = result;
		return repository.isReadable(userId);
	}).then(readable=> {
		if (!readable) {
			return res.status(403).json({ "error": "No read access to this repository."});
		}
		return Boards.legacyFormat();
	}).then(result=>{
		return res.status(200).json(result);
	}).catch(err=> {
		console.error(err);
		return res.status(500).json(err);
	});
});

router.get("/stdcell", restrict, async function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}

	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	try {
		let accessInfo = await Repo.accessRepo(ownerName, repoName, userId, next);
		const { repository: repo, accessLevel: role } = accessInfo;
		let readable = await repo.p.isReadable(userId);
		if (!readable) {
			return next();
		} 
		
		let scls = null;
		try {
			scls = fs.readdirSync(config.stdcellRepo).filter(entry=> {
				if (entry.startsWith(".")) {
					return false;
				}

				let sclPath = path.join(config.stdcellRepo, entry);
				let stat = fs.lstatSync(sclPath);
				if (!stat.isDirectory()) {
					return false;
				}

				return true;
			});
		} catch (err) {
			console.error(err);
			throw {
				error: "An error has occurred while attempting to retrieve the standard cell library list."
			};		
		}


		let result = [];
		for (let scl of scls) {
			let constraintsPath = path.join(scl, "constraints.json");
			let constr = null;
			if (fs.existsSync(constraintsPath)) {
				let constraintsStr = fs.readFileSync(constraintsPath, { encoding: "utf8" });
				constr = JSON.parse(constraintsStr);
			}
			result.push({
				id: scl,
				text: scl,
				constr
			});
		}

		return res.status(200).json({
			stdcell: result
		});

	} catch (err) {
		console.error(err);
		return res.status(500).json(err);

	}
});
router.get("/strategies", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}

	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else {
			const { repository: repo, accessLevel: role } = result;
			return repo.isReadable(userId, function(err, readable) {
				if (!readable) {
					return next();
				} else {
					const strategiesPath = path.join(
						process.cwd(),
						"modules/strategies"
					);
					return fs.readdir(strategiesPath, function(
						err,
						strategiesFiles
					) {
						if (err) {
							console.error(err);
							return res.status(500).json({
								error:
									"An error has occurred while attempting to retrieve the synthesis strategies."
							});
						} else {
							const strategiesEntries = [];
							strategiesFiles.forEach(strategy =>
								strategiesEntries.push({
									id: strategy,
									text: strategy
								})
							);
							return res.status(200).json({
								strategies: strategiesEntries
							});
						}
					});
				}
			});
		}
	});
});
router.get("/ips", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}

	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else {
			const { repository: repo, accessLevel: role } = result;
			return repo.isReadable(userId, function(err, readable) {
				if (!readable) {
					return next();
				} else {
					return Repo.getAvailableIPs(function(err, ips) {
						if (err) {
							console.error(err);
							return res.status(500).json({
								error:
									"An error has occurred while attempting to retrieve available IP Cores."
							});
						} else {
							return res.status(200).json({
								ips
							});
						}
					});
				}
			});
		}
	});
});

router.get("/download/:fileid", function(req, res, next) {
	Promise.resolve(1).then(() => {
		const pagePath = path.join(
			__dirname,
			"../../views",
			"download-auth.html"
		);
		fs.readFile(pagePath, "utf8", (err, content) => {
			if (err) {
				return res.status(500).json({
					error: "Failed.."
				});
			}
			const result = minify(content, {
				minifyJS: true
			});
			return res.set("Content-Type", "text/html").send(result);
		});
	});
});

router.post("/download/:fileid", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}
	if (req.params.fileid == null) {
		return res.status(400).json({
			error: "Missing parameter 'fileid'"
		});
	}

	const fileId = req.params.fileid;
	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else {
			const { repository: repo, accessLevel: role } = result;
			return repo.isReadable(userId, function(err, readable) {
				if (!readable) {
					return next();
				} else {
					return repo.getEntry(
						{
							_id: fileId
						},
						function(err, entry) {
							if (err) {
								return res.status(500).json(err);
							} else if (!entry) {
								return next();
							} else if (
								entry.isReadableFile() ||
								[
									EntryType.BinaryFile,
									EntryType.VCDFile
								].includes(entry.handler)
							) {
								return FileManager.getFileStream(
									entry,
									function(err, stream) {
										if (err) {
											return res.status(500).json(err);
										} else {
											res.attachment(entry.title);
											return stream.pipe(res);
										}
									}
								);
							} else {
								return res.status(400).json({
									error: "Cannot send the required file."
								});
							}
						}
					);
				}
			});
		}
	});
});

router.get("/ws/settings", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}

	const fileId = req.params.fileid;
	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else {
			const { repository: repo, accessLevel: role } = result;
			return repo.isReadable(userId, function(err, readable) {
				if (!readable) {
					return next();
				} else {
					return res.status(200).json(repo.settings);
				}
			});
		}
	});
});

router.post("/ws/settings", restrict, function(req, res, next) {
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}
	if (req.body.theme == null) {
		return res.status(400).json({
			error: "Missing parameter 'theme'"
		});
	}
	if (req.body.fontSize == null) {
		return res.status(400).json({
			error: "Missing parameter 'fontSize'"
		});
	}

	const themeIndex = parseInt(req.body.theme);
	const fontSize = parseInt(req.body.fontSize);

	if (isNaN(themeIndex) || ![0, 1].includes(themeIndex)) {
		return res.status(400).json({
			error: "Invalid value for theme."
		});
	}
	if (isNaN(fontSize) || fontSize < 4 || fontSize > 60) {
		return res.status(400).json({
			error: "Invalid value for font size."
		});
	}

	let defaultSettings = false;
	if (req.body.defaultSettings != null) {
		({ defaultSettings } = req.body);
	}

	const userId = req.user._id;
	const { username } = req.user;
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else {
			const { repository: repo, accessLevel: role } = result;
			return repo.isReadable(userId, function(err, readable) {
				if (!readable) {
					return next();
				} else {
					if (defaultSettings) {
						return req.user.updateWorkspaceSettings(
							themeIndex,
							fontSize,
							function(err, updatedRepo) {
								if (err) {
									return res.status(500).json(err);
								} else {
									return repo.updateWorkspaceSettings(
										themeIndex,
										fontSize,
										function(err, updatedRepo) {
											if (err) {
												return res
													.status(500)
													.json(err);
											} else {
												return res.status(200).json({
													repository: updatedRepo
												});
											}
										}
									);
								}
							}
						);
					} else {
						return repo.updateWorkspaceSettings(
							themeIndex,
							fontSize,
							function(err, updatedRepo) {
								if (err) {
									return res.status(500).json(err);
								} else {
									return res
										.status(200)
										.json({ repository: updatedRepo });
								}
							}
						);
					}
				}
			});
		}
	});
});

router.post("/ajax-upload", restrict, (req, res, next) =>
	fileUploader(req, res, function(err) {
		if (err) {
			console.error(err);
			return res.status(500).json({
				error: "File upload failed."
			});
		}
		const { user } = req;
		const userId = user._id;
		const action = req.body.action.toLowerCase();
		const ownerName = req.local.username;
		const repoName = req.local.reponame.toLowerCase();

		return Repo.accessRepo(ownerName, repoName, userId, next, function(
			err,
			result
		) {
			if (err) {
				return res.status(500).json(err);
			} else if (result.accessLevel < AccessLevel.ReadOnly) {
				return next();
			} else if (result.accessLevel < AccessLevel.ReadWrite) {
				return res.status(403).json({
					error: "Access denied (insufficient permissions)."
				});
			} else {
				const { repository: repo, accessLevel: role } = result;
				const fileType = req.body.type;
				const fileName = req.body.name;
				const overwrite =
					req.body.overwrite === true ||
					req.body.overwrite === "true" ||
					req.body.overwrite === 1 ||
					req.body.overwrite === "1"
						? true
						: false;
				const parentId = req.body.parent;
				const isDnD = !!req.body.dnd;
				if (isDnD) {
					if (process.env.DISABLE_EXTERNAL_DND === "1") {
						fs.unlink(req.file.path, function(err) {
							if (err) {
								console.error(err);
							}
						});
						return res.status(500).json({
							error:
								"Drag and drop file upload is currently disabled."
						});
					}
				}
				if (typeof fileType !== "string" || !fileType.length) {
					return res.status(400).json({
						error: "Missing parameter 'type'"
					});
				}
				if (typeof fileName !== "string" || !fileName.length) {
					return res.status(400).json({
						error: "Missing parameter 'name'"
					});
				}
				if (typeof parentId !== "string" || !parentId.length) {
					return res.status(400).json({
						error: "Missing parameter 'parent'"
					});
				}
				return isBinaryFile(req.file.path, function(err, isBinary) {
					if (err) {
						console.error(err);
						fs.unlink(req.file.path, function(err) {
							if (err) {
								console.error(err);
							}
						});
						return res.status(500).json({
							error: "File upload failed."
						});
					} else if (isBinary) {
						fs.unlink(req.file.path, function(err) {
							if (err) {
								console.error(err);
							}
						});
						return res.status(500).json({
							error: "Binary file upload is not supported."
						});
					} else {
						return fs.readFile(req.file.path, "utf8", function(
							err,
							content
						) {
							fs.unlink(req.file.path, function(err) {
								if (err) {
									console.error(err);
								}
							});
							if (err) {
								console.error(err);
								return res.status(500).json({
									error: "File upload failed."
								});
							}
							if (fileType === "verilog") {
								return repo.createVerilogModuleWithContent(
									parentId,
									req.user,
									fileName,
									"",
									false,
									false,
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else if (fileType === "testbench") {
								return repo.createVerilogTestbenchWithContent(
									parentId,
									req.user,
									fileName,
									false,
									false,
									"",
									false,
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else if (fileType === "text") {
								return repo.createTextfile(
									{
										parent: parentId,
										user: req.user,
										title: fileName,
										description: ""
									},
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											if (result == null) {
												return;
											}
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else if (fileType === "linker") {
								return repo.createLinkerFile(
									parentId,
									req.user,
									fileName,
									"",
									"",
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else if (fileType === "startup") {
								return repo.createStartupFile(
									parentId,
									req.user,
									fileName,
									"",
									"",
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else if (fileType === "c") {
								return repo.createCFile(
									parentId,
									req.user,
									fileName,
									"",
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else if (fileType === "h") {
								return repo.createHFile(
									parentId,
									req.user,
									fileName,
									"",
									content,
									overwrite,
									function(err, result) {
										if (err) {
											return res.status(500).json(err);
										} else {
											const { entry: newEntry } = result;
											return res.status(201).json({
												fileId: newEntry._id,
												parentId: newEntry.parent,
												fileName: newEntry.title,
												fileType: newEntry.handlerName,
												content
											});
										}
									}
								);
							} else {
								return res.status(500).json({
									error: "Unsupported type."
								});
							}
						});
					}
				});
			}
		});
	})
);

router.post("/ajax", restrict, async function(req, res, next) {
try {
	let requestType = req.header("Content-Type" || "");
	requestType = requestType
		.trim()
		.substr(0, 16)
		.trim();

	if (requestType !== "application/json") {
		return res.status(400).json({
			error: "Request type should be JSON."
		});
	}
	//Parameters validation
	if (req.local.username == null) {
		return res.status(400).json({
			error: "Missing parameter 'username'"
		});
	}
	if (req.local.reponame.toLowerCase() == null) {
		return res.status(400).json({
			error: "Missing parameter 'reponame'"
		});
	}
	if (req.body.action == null) {
		return res.status(400).json({
			error: "Missing parameter 'action'"
		});
	}

	const { user } = req;
	const userId = user._id;
	const action = req.body.action.toLowerCase();
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();

	let result = await promisify(Repo.accessRepo)(
		ownerName,
		repoName,
		userId,
		next
	);

	if (result.accessLevel < AccessLevel.ReadOnly) {
		return next();
	} else if (result.accessLevel < AccessLevel.ReadWrite) {
		return res.status(403).json({
			error: "Access denied (insufficient permissions)."
		});
	}

	const { repository: repo, accessLevel: role } = result;
	let affected,
		boardId,
		boardOpt,
		content,
		description,
		fileName,
		item,
		items,
		key,
		module,
		moduleName,
		name,
		newname,
		parentId,
		pnrOpt,
		requestBody,
		stdcell,
		target,
		targetId,
		type,
		value;
	let overwrite =
		req.body.overwrite != null ? req.body.overwrite : false;

	if (action === "create") {
		let fileContent, validateUrl;
		for (key in req.body) {
			value = req.body[key];
			if (
				typeof value === "object" &&
				key !== "content" &&
				req.body.type !== "dcf"
			) {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.parent == null ||
			req.body.parent.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'parent'"
			});
		}
		parentId = req.body.parent;
		if (
			req.body.type == null ||
			typeof req.body.type !== "string" ||
			req.body.type.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'type'"
			});
		}
		if (
			req.body.name == null ||
			typeof req.body.name !== "string" ||
			req.body.name.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'name'"
			});
		}

		type = req.body.type.toLowerCase();
		if (type === "verilog") {
			moduleName = req.body.name;
			description = req.body.description || "";

			let seq = !!(req.body.seq || req.body.sequential);

			// userSocket = global.userSockets[req.user._id.toString()]
			// if userSocket?
			// 	userSocket = userSocket[0]
			// 	if typeof userSocket.emit is 'function'
			// 		userSocket.emit('test', 't')
			// 		userSocket.emit('notification', a: 'x')

			return repo.createVerilogModule(
				parentId,
				user,
				moduleName,
				description,
				seq,
				false,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: moduleContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "verilog",
							content: moduleContent
						});
					}
				}
			);
		} else if (type === "testbench") {
			if (process.env.CLOUDV_DISABLE_DOCKER === "1") {
				return res.status(500).json({
					error:
						"Testbench generation is currently disabled."
				});
			}
			if (
				req.body.name == null ||
				req.body.name.trim() === ""
			) {
				return res.status(400).json({
					error: "Missing parameter 'name'"
				});
			}

			const testbenchName = req.body.name.trim();
			description = "";

			if (req.body.description != null) {
				({ description } = req.body);
			}
			const isBlank =
				req.body.blank === true ? true : false;
			if (isBlank) {
				return repo.createVerilogTestbench(
					parentId,
					user,
					testbenchName,
					false,
					null,
					description,
					false,
					overwrite,
					function(err, result) {
						if (err) {
							return res.status(500).json(err);
						} else {
							const {
								entry: newEntry,
								content: moduleContent
							} = result;
							return res.status(201).json({
								fileId: newEntry._id,
								parentId: newEntry.parent,
								fileName: newEntry.title,
								fileType: "testbench",
								content: moduleContent
							});
						}
					}
				);
			} else {
				if (
					req.body.source == null ||
					req.body.source.trim() === ""
				) {
					return res.status(400).json({
						error: "Missing parameter 'source'"
					});
				}
				if (
					req.body.module == null ||
					req.body.module.trim() === ""
				) {
					return res.status(400).json({
						error: "Missing parameter 'module'"
					});
				}

				const sourceFile = req.body.source.trim();
				const sourceModule = req.body.module.trim();
				validateUrl =
					proc.url +
					proc.validateTopModulePath;
				requestBody = _.clone(req.body);
				delete requestBody.user;
				requestBody.username = ownerName;
				requestBody.reponame = repoName;
				res.socket.setTimeout(requestTimeout);
				return request.post(
					{
						url: validateUrl,
						json: requestBody,
						timeout: requestTimeout
					},
					function(err, httpResponse, body) {
						if (err) {
							console.error(err);
							if (
								err.code === "ETIMEDOUT" ||
								err.code ===
									"ESOCKETTIMEDOUT" ||
								err.code === "ECONNRESET"
							) {
								return res.status(500).json({
									error:
										"Job timed out."
								});
							}
							return res.status(500).json({
								error: "Failed to submit the job."
							});
						} else if (
							httpResponse.statusCode !== 200
						) {
							if (
								body != null &&
								body.error != null
							) {
								return res.status(500).json({
									error: body.error
								});
							} else {
								return res.status(500).json({
									error:
										"An unexpected error has occurred."
								});
							}
						} else {
							const logs = body;
							if (!logs || !logs.errors) {
								console.error(httpResponse);
								console.error(
									httpResponse.statusCode
								);
								console.error(body);
								return res.status(500).json({
									error:
										"There are errors in the source file, please validate its contents first.",
									errors: [
										"Unknown error occurred during validation"
									]
								});
							}
							if (logs.errors.length === 0) {
								return repo.createVerilogTestbench(
									parentId,
									user,
									testbenchName,
									sourceModule,
									sourceFile,
									description,
									false,
									overwrite,
									function(err, result) {
										if (err) {
											console.error(err);
											return res
												.status(500)
												.json(err);
										} else {
											const {
												entry: newEntry,
												content: moduleContent
											} = result;
											return res
												.status(201)
												.json({
													fileId:
														newEntry._id,
													parentId:
														newEntry.parent,
													fileName:
														newEntry.title,
													fileType:
														"testbench",
													content: moduleContent
												});
										}
									}
								);
							} else {
								return res.status(500).json({
									error:
										"There are errors in the source file, please validate its contents first.",
									errors: logs.errors
								});
							}
						}
					}
				);
			}
		} else if (type === "text") {
			fileName = req.body.name;
			fileContent = "";
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			return repo.createTextfile(
				{
					parent: parentId,
					user,
					title: fileName,
					description
				},
				fileContent,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "text",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "c") {
			fileName = req.body.name;
			fileContent = "";
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			return repo.createCFile(
				parentId,
				user,
				fileName,
				description,
				fileContent,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "c",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "h") {
			fileName = req.body.name;
			fileContent = "";
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			return repo.createHFile(
				parentId,
				user,
				fileName,
				description,
				fileContent,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "h",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "linker") {
			fileName = req.body.name;
			fileContent = "";
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			({ target } = req.body);
			if (
				typeof target !== "string" ||
				!["arm", "riscv", "blank"].includes(target)
			) {
				return res.status(500).json({
					error:
						'Missing or invalid parameter "target"'
				});
			}
			return repo.createLinkerFile(
				parentId,
				user,
				fileName,
				target,
				description,
				null,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "linker",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "startup") {
			fileName = req.body.name;
			fileContent = "";
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			({ target } = req.body);

			if (
				typeof target !== "string" ||
				!["arm", "riscv", "blank"].includes(target)
			) {
				return res.status(500).json({
					error:
						'Missing or invalid parameter "target"'
				});
			}
			return repo.createStartupFile(
				parentId,
				user,
				fileName,
				target,
				description,
				null,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "startup",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "fsm") {
			fileName = req.body.name;
			fileContent = '{"nodes":[],"links":[]}';
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			return repo.createFSM(
				parentId,
				user,
				fileName,
				description,
				fileContent,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "fsm",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "sys") {
			return res.status(500).json({
				error: "Unsupported."
			});
		} else if (type === "soc") {
			fileName = req.body.name;
			const template = req.body.template || "Single Bus";
			const busReader = require("../../modules/soc/bus_reader");
			const buses = await busReader();
			const defaultBus = buses.default;
			let busTemplate;
			for (let i = 0; i < defaultBus.length; i++) {
				if (defaultBus[i].template === template) {
					busTemplate = defaultBus[i];
					break;
				}
			}
			if (!busTemplate) {
				return res.status(500).json({
					error: "Failed to generate SoC"
				});
			}

			const generatedContent = busReader.generateDefaultSoC(
				busTemplate
			);
			fileContent = JSON.stringify(generatedContent);
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			return repo.createSOC(
				parentId,
				user,
				fileName,
				description,
				fileContent,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: fileContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "soc",
							content: fileContent
						});
					}
				}
			);
		} else if (type === "folder") {
			const folderName = req.body.name;
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}
			return repo.createFolder(
				{
					parent: parentId,
					user: req.user._id,
					title: folderName,
					description,
					access: EntryAccess.ReadWrite,
					anchor: false,
					source: EntrySource.User
				},
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const { entry: newEntry } = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "folder",
							content: ""
						});
					}
				}
			);
		} else if (type === "dcf") {
			if (
				typeof req.body.name !== "string" ||
				req.body.name.trim() === ""
			) {
				return res.status(400).json({
					error: "Missing parameter 'name'"
				});
			}
			if (
				typeof req.body.content !== "object" ||
				req.body.content == null
			) {
				return res.status(400).json({
					error: "Missing parameter 'content'"
				});
			}
			({ stdcell } = req.body.content);
			delete req.body.content.stdcell;
			const dcfName = req.body.name.trim();
			return repo.createDCF(
				parentId,
				user,
				dcfName,
				stdcell,
				req.body.content,
				description,
				false,
				overwrite,
				function(err, result) {
					if (err) {
						return res.status(500).json(err);
					} else {
						const {
							entry: newEntry,
							content: dcfContent
						} = result;
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "dcf",
							content: JSON.parse(dcfContent)
						});
					}
				}
			);
		} else if (type === "pcf") {
			if (
				typeof req.body.name !== "string" ||
				req.body.name.trim() === ""
			) {
				return res.status(400).json({
					error: "Missing parameter 'name'"
				});
			}
			if (
				typeof req.body.boardId !== "string" ||
				req.body.boardId.trim() === ""
			) {
				return res.status(400).json({
					error: "Missing parameter 'boardId'"
				});
			}
			const pcfName = req.body.name.trim();
			boardId = req.body.boardId.trim();
			if (req.body.description != null) {
				({ description } = req.body);
			}

			let targetBoard = Boards[boardId];

			if (!targetBoard) {
				return res.status(500).json({
					error:
						"Cannot find the specified board model."
				});
			}

			let result = await repo.p.createPCF(
				parentId,
				user,
				pcfName,
				boardId,
				description,
				false,
				overwrite
			);

			const {
				entry: newEntry,
				content: pcfContent
			} = result;
			
			return res
				.status(201)
				.json({
					fileId:
						newEntry._id,
					parentId:
						newEntry.parent,
					fileName:
						newEntry.title,
					fileType:
						"pcf",
					content: ""
				});
		
		
		} else {
			return res.status(500).json({
				error: "Unknown file type."
			});
		}
	} else if (action === "move") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object" && key !== "item") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.target == null ||
			req.body.target.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'target'"
			});
		}
		if (
			req.body.item == null ||
			!Array.isArray(req.body.item)
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		targetId = req.body.target;
		({ item } = req.body);
		return repo.moveMultiple(
			item,
			targetId,
			overwrite,
			function(err, movedItems) {
				if (err) {
					return res.status(500).json(err);
				} else {
					const movedItemsRes = [];
					movedItems.forEach(elem => {
						return movedItemsRes.push({
							fileId: elem._id,
							fileName: elem.title,
							parentId: elem.parent,
							fileType: elem.handlerName,
							original: elem.original,
							isTarget: elem.isTarget
						});
					});
					return res.status(200).json({
						files: movedItemsRes
					});
				}
			}
		);
	} else if (action === "copy") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object" && key !== "item") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.target == null ||
			req.body.target.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'target'"
			});
		}
		if (
			req.body.item == null ||
			!Array.isArray(req.body.item)
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		targetId = req.body.target;
		({ item } = req.body);
		return repo.copyMultiple(
			item,
			targetId,
			overwrite,
			function(err, copiedItems) {
				if (err) {
					return res.status(500).json(err);
				} else {
					const copiedItemsRes = [];
					copiedItems.forEach(elem => {
						return copiedItemsRes.push({
							fileId: elem._id,
							fileName: elem.title,
							parentId: elem.parent,
							fileType: elem.handlerName,
							original: elem.original,
							isTarget: elem.isTarget
						});
					});
					return res.status(200).json({
						files: copiedItemsRes
					});
				}
			}
		);
	} else if (action === "delete") {
		console.log("Delete Action")
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object" && key !== "item") {
				console.log("1. Delete Action")
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			!Array.isArray(req.body.item)
		) {
			console.log("2. Delete Action")
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		({ item } = req.body);

		let [deletedItems, failedItems, failedErrors] = await repo.p.deleteMultiple(item, false).catch(err=> {
			console.error(err);
			throw { error: "Failed to delete items." };
		});

		const deletedItemsRes = [];
		deletedItems.forEach(elem => {
			return deletedItemsRes.push({
				fileId: elem._id,
				fileName: elem.title,
				parentId: elem.parent,
				fileType: elem.handlerName,
				original: elem.original,
				isTarget: elem.isTarget
			});
		});

		return res.status(200).json({
			files: deletedItemsRes
		});
	} else if (action === "rename") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		if (
			req.body.newname == null ||
			req.body.newname.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'newname'"
			});
		}
		({ item } = req.body);
		({ newname } = req.body);

		return repo.renameEntry(
			item,
			newname,
			overwrite,
			function(err, renamedEntry) {
				if (err) {
					return res.status(500).json(err);
				} else {
					return res.status(200).json({
						fileId: renamedEntry._id,
						fileName: renamedEntry.title,
						parentId: renamedEntry.parent
					});
				}
			}
		);
	} else if (action === "duplicate") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		if (
			req.body.newname == null ||
			req.body.newname.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'newname'"
			});
		}
		({ item } = req.body);
		({ newname } = req.body);

		return repo.duplicateEntry(
			item,
			newname,
			false,
			function(err, duplicatedEntry) {
				if (err) {
					return res.status(500).json(err);
				} else {
					const fileType =
						duplicatedEntry.handlerName;
					return res.status(200).json({
						fileId: duplicatedEntry._id,
						fileName: duplicatedEntry.title,
						parentId: duplicatedEntry.parent,
						fileType
					});
				}
			}
		);
	} else if (action === "save") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		if (
			req.body.content == null ||
			req.body.content.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'content'"
			});
		}
		({ item } = req.body);
		({ content } = req.body);
		return repo.getEntry(
			{
				_id: item
			},
			function(err, entry) {
				if (err) {
					return res.status(500).json(err);
				} else if (!item) {
					return res.status(500).json({
						error: "Entry does not exist."
					});
				} else if (entry.handler === EntryType.DCFFile) {
					if (typeof content === "string") {
						try {
							content = JSON.parse(content);
						} catch (error) {
							const e = error;
							console.error(e);
							return res.status(400).json({
								error: "Bad Request"
							});
						}
					}
					if (
						typeof content.stdcell !== "string" ||
						typeof content !== "object" ||
						content == null
					) {
						return res.status(400).json({
							error: "Bad Request"
						});
					}
					({ stdcell } = content);
					delete content.stdcell;
					const stdcellConstrPath = path.join(config.stdcellRepo, stdcells, "constraints.json");
					return fileExists(
						stdcellConstrPath,
						function(err, exists) {
							if (err) {
								console.error(err);
								return res.status(500).json({
									error:
										"There is an error with the selected standard cell library."
								});
							} else if (!exists) {
								return res.status(500).json({
									error:
										"No valid constraints for the selected standard cell library."
								});
							} else {
								const validConstr = require(`../../${stdcellConstrPath}`);
								const constrContent = {
									stdcell: stdcell,
									clock: validConstr.clockMin,
									outputLoad:
										validConstr.outputLoadMin,
									inputDrivingCell:
										validConstr
											.inputDrivingCells[0],
									maxTransition:
										validConstr.maxTransitionMin,
									maxFanout:
										validConstr.maxFanoutMin
								};
								const numberOpts = [
									"clock",
									"outputLoad",
									"maxTransition",
									"maxFanout"
								];
								for (let opt of Array.from(
									numberOpts
								)) {
									if (content[opt] != null) {
										const optValue = parseFloat(
											content[opt]
										);
										if (isNaN(optValue)) {
											return cb({
												error: `Invalid constraint value ${
													content[opt]
												} for option ${opt}.`
											});
										}
										if (
											optValue <
												validConstr[
													opt + "Min"
												] ||
											optValue >
												validConstr[
													opt + "Max"
												]
										) {
											return res
												.status(500)
												.json({
													error: `Invalid constraint value ${
														content[
															opt
														]
													} for option ${opt}, it should be between ${
														validConstr[
															opt +
																"Min"
														]
													} and ${
														validConstr[
															opt +
																"Max"
														]
													}.`
												});
										}
										constrContent[
											opt
										] = optValue;
									}
								}
								if (
									Array.from(
										validConstr.inputDrivingCells
									).includes(
										content.inputDrivingCell
									)
								) {
									constrContent.inputDrivingCell =
										content.inputDrivingCell;
								}
								content = JSON.stringify(
									constrContent
								);
								return repo.updateFileContent(
									entry._id,
									content,
									false,
									false,
									function(
										err,
										updatedEntry
									) {
										if (err) {
											return res
												.status(500)
												.json(err);
										} else {
											const fileType =
												updatedEntry.handlerName;
											return res
												.status(200)
												.json({
													fileId:
														updatedEntry._id,
													fileName:
														updatedEntry.title,
													parentId:
														updatedEntry.parent,
													fileType
												});
										}
									}
								);
							}
						}
					);
				} else if (
					entry.handler === EntryType.VCDFile
				) {
					if (typeof content === "object") {
						content = JSON.stringify(content);
					}
					return repo.updateEntryAttributes(
						entry._id,
						content,
						function(err, updatedEntry) {
							if (err) {
								return res
									.status(500)
									.json(err);
							} else {
								const fileType =
									updatedEntry.handlerName;
								return res.status(200).json({
									fileId: updatedEntry._id,
									fileName:
										updatedEntry.title,
									parentId:
										updatedEntry.parent,
									fileType,
									attributes:
										updatedEntry.attributes
								});
							}
						}
					);
				} else {
					return repo.updateFileContent(
						entry._id,
						content,
						false,
						false,
						function(err, updatedEntry) {
							if (err) {
								return res
									.status(500)
									.json(err);
							} else {
								const fileType =
									updatedEntry.handlerName;
								return res.status(200).json({
									fileId: updatedEntry._id,
									fileName:
										updatedEntry.title,
									parentId:
										updatedEntry.parent,
									fileType
								});
							}
						}
					);
				}
			}
		);
	} else if (action === "settop") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		if (
			req.body.module == null ||
			req.body.module.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'module'"
			});
		}
		({ item } = req.body);
		module = req.body.module.trim();
		return repo.setTopModule(item, module, function(
			err,
			topModule
		) {
			if (err) {
				console.error(err);
				return res.status(500).json(err);
			} else {
				return res.status(200).json({
					module: topModule.name,
					fileId: topModule.entry
				});
			}
		});
	} else if (action === "validate") {
		return res.status(500).json({
			error:
				"Single file validation is no longer supported."
		});
	} else if (action === "simulate") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		({ item } = req.body);
		name = (req.body.name || "sim").trim();
		if (name === "") {
			name = "sim";
		}
		let simulationTime = parseInt(req.body.time || 1000);
		if (isNaN(simulationTime)) {
			simulationTime = 1000;
		}
		if (simulationTime > 50000) {
			simulationTime = 50000;
		}

		let isNetlist = req.body.netlist || false;
		let level = parseInt(req.body.level || 0) || 0;
		level = Math.max(Math.min(level, 4), 0);
		let { netlistId } = req.body;
		({ stdcell } = req.body);

		if (name.indexOf(".vcd", name.length - 4) !== -1) {
			name = name.substring(0, name.length - 4);
		}

		const vcdName = `${name}.vcd`;
		let sourceEntry = await repo.p.getEntry({ _id: item });
		if (!sourceEntry) {
			return res.status(500).json({
				error: "Cannot locate source file."
			});
		} else if (
			!["testbench", "vcd", "netlist"].includes(
				sourceEntry.handlerName
			)
		) {
			return res.status(500).json({
				error: "Invalid source file."
			});
		}
		if (sourceEntry.handlerName === "vcd") {
			try {
				const vcdData = JSON.parse(
					sourceEntry.data
				);
				req.body.item = item =
					vcdData.source;
				req.body.netlist = isNetlist =
					vcdData.netlist || false;
				req.body.netlistId = netlistId =
					vcdData.netlistId || "";
				req.body.stdcell = stdcell =
					vcdData.stdcell || "";
				// req.body.level = (level = vcdData.level || 0);
			} catch (error) {
				const e = error;
				console.error(err);
				return res.status(500).json({
					error:
						"Cannot locate source testbench."
				});
			}
		}
		let sourceTestbench = await repo.p.getEntry({
			_id: item,
			handler: EntryType.TestbenchFile
		});
		if (!sourceTestbench) {
					return res.status(500).json({
						error:
							"Cannot locate source testbench."
					});
		}
		let simulateTestbenchUrl;
		const simulationCB = (
			tempPath,
			files,
			reverseMap,
			dumpName
		) =>
			Simulator.simulate(
				tempPath,
				files[item].tempName,
				reverseMap,
				dumpName,
				function(
					err,
					simulationErrors,
					simulationWarnings,
					simulationLog,
					vcd
				) {
					rmdir(
						tempPath,
						function(err) {
							if (err) {
								return console.error(
									err
								);
							}
						}
					);
					if (err) {
						return res
							.status(500)
							.json(err);
					} else {
						if (
							vcd ==
								null ||
							vcd.trim() ===
								""
						) {
							return res.json(
								{
									errors: simulationErrors,
									warnings: simulationWarnings,
									log: simulationLog
								}
							);
						} else {
							return Simulator.generateWave(
								vcd,
								function(
									err,
									wave
								) {
									if (
										err
									) {
										return res
											.status(
												500
											)
											.json(
												err
											);
									} else {
										return repo.createVCD(
											req.user,
											item,
											isNetlist,
											netlistId,
											stdcell,
											vcdName,
											vcd,
											`VCD created on ${new Date()}`,
											overwrite,
											function(
												err,
												result
											) {
												if (
													err
												) {
													return res
														.status(
															500
														)
														.json(
															err
														);
												} else {
													const {
														entry: vcdEntry
													} = result;
													if (
														simulationLog.length
													) {
														if (
															/^\s*VCD info\:\s*dumpfile/i.test(
																simulationLog[
																	simulationLog.length -
																		1
																]
															)
														) {
															simulationLog.pop();
														}
													}
													const response = {
														errors: simulationErrors,
														warnings: simulationWarnings,
														log: simulationLog,
														fileId:
															vcdEntry._id,
														fileName:
															vcdEntry.title,
														fileType:
															"vcd",
														parentId:
															vcdEntry.parent
													};

													return res
														.status(
															200
														)
														.json(
															response
														);
												}
											}
										);
									}
								}
							);
						}
					}
				}
			);

		if (!isNetlist) {
			if (
				process.env.CLOUDV_DISABLE_DOCKER !==
				"1"
			) {
				simulateTestbenchUrl =
					proc.url +
					proc.simulateTestbenchPath;
				console.error(simulateTestbenchUrl);
				requestBody = _.clone(
					req.body
				);
				delete requestBody.user;
				requestBody.username = ownerName;
				requestBody.reponame = repoName;
				res.socket.setTimeout(
					requestTimeout
				);
				let { err, httpResponse, body } = await new Promise((resolve)=>
					request.post(
						{
							url: simulateTestbenchUrl,
							json: requestBody,
							timeout: requestTimeout
						},
						function(
							err,
							httpResponse,
							body
						) {
							return resolve({err, httpResponse, body});
						}
					)
				);
				if (err) {
					console.error(`${err}`.slice(0, 500));
					if (
						["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET"].includes(err.code)
					) {
						throw { error: "Job timed out." }
					}
					throw { error: "Failed to submit the job." };
				} 
				if (httpResponse.statusCode !== 200) {
					if (body != null && body.error !== null) {
						throw { error: body.error };
					} else {
						throw { error: "An unknown error has occurred."}
					}
				}
				const { vcd } = body;
				const simulationErrors = (
					body.errors || []
				).concat(
					body.simulationErrors || []
				);
				const simulationWarnings = (
					body.warnings || []
				).concat(
					body.simulationWarnings ||
						[]
				);
				const simulationLog = (
					body.log ||
					[]
				).concat(
					body.simulationLog ||
						[]
				);
				if (vcd == null || vcd.trim() === "" ) {
					console.error("EMPTY VCD: ", body)

					if (!simulationErrors.length) {
						simulationErrors.push({
							message: "An unexpected error occurred while simulating."
						});
					}
					
					return res.status(500).json({
						errors: simulationErrors,
						warnings: simulationWarnings,
						log: simulationLog
					});
				}
				const { wave } = body;
				if (simulationErrors.length) {
					return res
						.status(
							200
						)
						.json(
							{
								errors: simulationErrors,
								warnings: simulationWarnings,
								log: simulationLog
							}
						);
				}

				let result = await repo.p.createVCD(
					req.user,
					item,
					isNetlist,
					netlistId,
					stdcell,
					vcdName,
					vcd,
					`VCD created on ${new Date()}`,
					overwrite
				);

				const { entry: vcdEntry } = result;
				if (simulationLog.length) {
					if (
						/^\s*VCD info\:\s*dumpfile/i.test(
							simulationLog[
								simulationLog.length -
									1
							]
						)
					) {
						simulationLog.pop();
					}
				}
				const response = {
					errors: simulationErrors,
					warnings: simulationWarnings,
					log: simulationLog,
					fileId:
						vcdEntry._id,
					fileName:
						vcdEntry.title,
					fileType:
						"vcd",
					parentId:
						vcdEntry.parent
				};
				if (
					typeof vcdEntry.attributes === "string" &&
					vcdEntry.attributes.length
				) {
					try {
						const currentAttributes = JSON.parse(
							vcdEntry.attributes
						);
						let renderedSignals =
							currentAttributes.rendered ||
							[];
						let hiddentSignals =
							currentAttributes.hidden ||
							[];
						const allSignals = _.pluck(
							wave.signal,
							"name"
						);
						const newSignals = _.difference(
							allSignals,
							renderedSignals.concat(
								hiddentSignals
							)
						);
						renderedSignals = renderedSignals.concat(
							newSignals
						);
						renderedSignals = _.intersection(
							renderedSignals,
							allSignals
						);
						hiddentSignals = _.difference(
							allSignals,
							renderedSignals
						);
						currentAttributes.rendered = renderedSignals;
						currentAttributes.hidden = hiddentSignals;
						await repo.p.updateEntryAttributes(
							vcdEntry._id,
							JSON.stringify(
								currentAttributes
							)
						);
						response.timing =
							vcdEntry.attributes;
					
					} catch (e) {
						console.error(e);
					}
				}

				return res.status(200).json(response);

			} else {
				return FileManager.writeTempSimulationModules(
					repo,
					item,
					simulationTime,
					"temp/",
					0,
					function(
						err,
						tempPath,
						files,
						reverseMap,
						dumpName
					) {
						if (err) {
							if (
								tempPath !=
								null
							) {
								rmdir(
									tempPath,
									function(
										err
									) {
										if (
											err
										) {
											return console.error(
												err
											);
										}
									}
								);
							}
							return res
								.status(
									500
								)
								.json(
									err
								);
						} else {
							return simulationCB(
								tempPath,
								files,
								reverseMap,
								dumpName
							);
						}
					}
				);
			}
		} else {
			if (
				process.env
					.CLOUDV_DISABLE_DOCKER !==
				"1"
			) {
				return repo.getEntry(
					{
						_id: netlistId,
						handler:
							EntryType.NetlistFile
					},
					function(
						err,
						netlist
					) {
						if (err) {
							return cb(
								err
							);
						} else if (
							!netlist
						) {
							return cb({
								error:
									"Nelist not found."
							});
						} else {
							simulateTestbenchUrl =
								proc.url +
								proc.simulateNetlistPath;
							requestBody = _.clone(
								req.body
							);
							delete requestBody.user;
							requestBody.username = ownerName;
							requestBody.reponame = repoName;
							res.socket.setTimeout(
								requestTimeout
							);
							return request.post(
								{
									url: simulateTestbenchUrl,
									json: requestBody,
									timeout: requestTimeout
								},
								function(
									err,
									httpResponse,
									body
								) {
									if (
										err
									) {
										console.error(
											err
										);
										if (
											err.code ===
												"ETIMEDOUT" ||
											err.code ===
												"ESOCKETTIMEDOUT" ||
											err.code ===
												"ECONNRESET"
										) {
											return res
												.status(
													500
												)
												.json(
													{
														error:
															"Job timed out."
													}
												);
										}
										return res
											.status(
												500
											)
											.json(
												{
													error:
														"Failed to submit the job."
												}
											);
									} else if (
										httpResponse.statusCode !==
										200
									) {
										if (
											body !=
												null &&
											body.error !=
												null
										) {
											return res
												.status(
													500
												)
												.json(
													{
														error:
															body.error
													}
												);
										} else {
											return res
												.status(
													500
												)
												.json(
													{
														error:
															"An unexpected error has occurred."
													}
												);
										}
									} else {
										const {
											vcd
										} = body;
										const simulationErrors = (
											body.errors ||
											[]
										).concat(
											body.simulationErrors ||
												[]
										);
										const simulationWarnings = (
											body.warnings ||
											[]
										).concat(
											body.simulationWarnings ||
												[]
										);
										const simulationLog = (
											body.log ||
											[]
										).concat(
											body.simulationLog ||
												[]
										);
										if (
											vcd ==
												null ||
											vcd.trim() ===
												""
										) {
											return res
												.status(
													200
												)
												.json(
													{
														errors: simulationErrors,
														warnings: simulationWarnings,
														log: simulationLog
													}
												);
										} else {
											const {
												wave
											} = body;
											if (
												simulationErrors.length
											) {
												return res
													.status(
														200
													)
													.json(
														{
															errors: simulationErrors,
															warnings: simulationWarnings,
															log: simulationLog
														}
													);
											} else {
												return repo.createVCD(
													req.user,
													item,
													isNetlist,
													netlistId,
													stdcell,
													vcdName,
													vcd,
													`VCD created on ${new Date()}`,
													overwrite,
													function(
														err,
														result
													) {
														if (
															err
														) {
															return res
																.status(
																	500
																)
																.json(
																	err
																);
														} else {
															const {
																entry: vcdEntry
															} = result;
															if (
																simulationLog.length
															) {
																if (
																	/^\s*VCD info\:\s*dumpfile/i.test(
																		simulationLog[
																			simulationLog.length -
																				1
																		]
																	)
																) {
																	simulationLog.pop();
																}
															}
															const response = {
																errors: simulationErrors,
																warnings: simulationWarnings,
																log: simulationLog,
																fileId:
																	vcdEntry._id,
																fileName:
																	vcdEntry.title,
																fileType:
																	"vcd",
																parentId:
																	vcdEntry.parent
															};
															if (
																vcdEntry.attributes !=
																	null &&
																vcdEntry
																	.attributes
																	.length
															) {
																try {
																	const currentAttributes = JSON.parse(
																		vcdEntry.attributes
																	);
																	let renderedSignals =
																		currentAttributes.rendered ||
																		[];
																	let hiddentSignals =
																		currentAttributes.hidden ||
																		[];
																	const allSignals = _.pluck(
																		wave.signal,
																		"name"
																	);
																	const newSignals = _.difference(
																		allSignals,
																		renderedSignals.concat(
																			hiddentSignals
																		)
																	);
																	renderedSignals = renderedSignals.concat(
																		newSignals
																	);
																	renderedSignals = _.intersection(
																		renderedSignals,
																		allSignals
																	);
																	hiddentSignals = _.difference(
																		allSignals,
																		renderedSignals
																	);
																	currentAttributes.rendered = renderedSignals;
																	currentAttributes.hidden = hiddentSignals;
																	return repo.updateEntryAttributes(
																		vcdEntry._id,
																		JSON.stringify(
																			currentAttributes
																		),
																		function(
																			err,
																			updatedEntry
																		) {
																			if (
																				err
																			) {
																				return res
																					.status(
																						500
																					)
																					.json(
																						err
																					);
																			} else {
																				response.timing =
																					vcdEntry.attributes;
																				return res
																					.status(
																						200
																					)
																					.json(
																						response
																					);
																			}
																		}
																	);
																} catch (e) {
																	console.error(
																		e
																	);
																	return res
																		.status(
																			200
																		)
																		.json(
																			response
																		);
																}
															} else {
																return res
																	.status(
																		200
																	)
																	.json(
																		response
																	);
															}
														}
													}
												);
											}
										}
									}
								}
							);
						}
					}
				);
			} else {
				return FileManager.writeNetlistSimulationModules(
					repo,
					item,
					netlistId,
					stdcell,
					simulationTime,
					function(
						err,
						tempPath,
						files,
						reverseMap,
						dumpName
					) {
						if (err) {
							if (
								tempPath !=
								null
							) {
								rmdir(
									tempPath,
									function(
										err
									) {
										if (
											err
										) {
											return console.error(
												err
											);
										}
									}
								);
							}
							return res
								.status(
									500
								)
								.json(
									err
								);
						} else {
							return simulationCB(
								tempPath,
								files,
								reverseMap,
								dumpName
							);
						}
					}
				);
			}
		}
	} else if (action === "sta") {
		let e;
		fileName = req.body.name;
		({ item } = req.body);
		const { options } = req.body;
		({ stdcell } = req.body);
		overwrite =
			req.body.overwrite != null
				? req.body.overwrite
				: false;

		if (
			item == null ||
			typeof item !== "string" ||
			item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		if (
			fileName == null ||
			typeof fileName !== "string" ||
			fileName.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'name'"
			});
		}
		if (
			stdcell == null ||
			typeof stdcell !== "string" ||
			stdcell.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'stdcell'"
			});
		}
		if (options == null || typeof options !== "object") {
			return res.status(400).json({
				error: "Missing parameter 'options'"
			});
		}

		let clockSkews = {};
		let netCapacitance = {};
		let timingConstraints = {};
		if (options.timing != null) {
			try {
				timingConstraints = JSON.parse(options.timing);
			} catch (error) {
				e = error;
				console.warn(e);
			}
		}
		if (
			typeof timingConstraints !== "object" ||
			timingConstraints.clock == null
		) {
			return res.status(500).json({
				error:
					"The timing constraints must have the attribute clock."
			});
		}

		if (options.clock != null) {
			try {
				clockSkews = JSON.parse(options.clock);
			} catch (error1) {
				e = error1;
				console.warn(e);
			}
		}

		if (options.net != null) {
			try {
				netCapacitance = JSON.parse(options.net);
			} catch (error2) {
				e = error2;
				console.warn(e);
			}
		}
		return repo.getEntry(
			{
				_id: item
			},
			function(err, entry) {
				if (err) {
					return res.status(500).json(err);
				} else if (!item) {
					return res.status(500).json({
						error: "Entry does not exist."
					});
				} else if (
					entry.handler !== EntryType.NetlistFile
				) {
					return res.status(500).json({
						error: "Target file is not a netlist."
					});
				} else {
					return entry.getContent(function(
						err,
						content
					) {
						if (err) {
							return cb(err);
						} else {
							let STAParser = require("../../modules/sta/parser");
							const STA = require("../../modules/sta/static_timing_analysis.js");
							const stdCellData = "";

							const stdcellPath = path.join(config.stdcellRepo, stdcell, "cells.lib");
							try {
								const stat = fs.lstatSync(
									stdcellPath
								);
								return fs.readFile(
									stdcellPath,
									"utf-8",
									function(err, stdCellData) {
										if (err) {
											console.error(err);
											return res
												.status(500)
												.json({
													error: "An error occurred while reading the standard cell lib file."
												});
										} else {
											STAParser = require("../../modules/sta/parser");
											const Stringifier = require("../../modules/sta/stringifier");
											const Analyzer = require("../../modules/sta/static_timing_analysis");
											return STAParser.parseLiberty(
												stdCellData,
												function(
													err,
													stdcells
												) {
													if (err) {
														return res
															.status(
																500
															)
															.json(
																{
																	error:
																		"Failed to parse the liberty file."
																}
															);
													} else {
														return STAParser.parseNetlist(
															content,
															stdcells,
															netCapacitance,
															clockSkews,
															function(
																err,
																warnings,
																cells,
																wires
															) {
																if (
																	err
																) {
																	return res
																		.status(
																			500
																		)
																		.json(
																			{
																				error:
																					"Failed to parse the netlist file."
																			}
																		);
																} else {
																	return Analyzer.analyze(
																		cells,
																		timingConstraints,
																		function(
																			err,
																			timingReport,
																			pathsReport
																		) {
																			if (
																				err
																			) {
																				return res
																					.status(
																						500
																					)
																					.json(
																						{
																							error: err
																						}
																					);
																			} else {
																				const report = {
																					sourceNetlist:
																						entry.title,
																					cellsReport: JSON.parse(
																						JSON.stringify(
																							timingReport.gates
																						)
																					),
																					timingReport: JSON.parse(
																						JSON.stringify(
																							timingReport.general
																						)
																					),
																					pathsReport: JSON.parse(
																						Stringifier.paths(
																							pathsReport
																						)
																					)
																				};
																				return repo.createSTA(
																					req.user,
																					fileName,
																					report,
																					entry,
																					`Report generated on ${new Date()} for the netlist ${
																						entry.title
																					}`,
																					overwrite,
																					function(
																						err,
																						{
																							entry: reportEntry
																						}
																					) {
																						if (
																							err
																						) {
																							return res
																								.status(
																									500
																								)
																								.json(
																									err
																								);
																						} else {
																							return res
																								.status(
																									200
																								)
																								.json(
																									{
																										fileId:
																											reportEntry._id,
																										parentId:
																											reportEntry.parent,
																										fileName:
																											reportEntry.title,
																										fileType:
																											"sta",
																										content: report
																									}
																								);
																						}
																					}
																				);
																			}
																		}
																	);
																}
															}
														);
													}
												}
											);
										}
									}
								);
							} catch (e) {
								console.error(e);
								return res.status(500).json({
									error: `Cannot find the standard cell library ${stdcell}`
								});
							}
						}
					});
				}
			}
		);
	} else if (action === "compilefsm") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		({ item } = req.body);
		moduleName = req.body.module;
		const { inports } = req.body;
		const { outports } = req.body;
		const { encoding } = req.body;
		const clkName = req.body.clkName || "clk";
		const clkEdge = req.body.clkEdge || "posedge";
		const rstName = req.body.rstName || "rst";
		const rstEdge = req.body.rstEdge || "negedge";
		const rstMode = req.body.rstMode || "asnyc";
		let rstLevel = req.body.rstLevel || "low";

		if (item == null || item.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		if (moduleName == null || moduleName.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'moduleName'"
			});
		}
		if (inports == null || inports.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'inports'"
			});
		}
		if (outports == null || outports.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'outports'"
			});
		}
		if (encoding == null || encoding.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'encoding'"
			});
		}
		if (clkName == null || clkName.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'clkName'"
			});
		}
		if (rstName == null || rstName.trim() === "") {
			return res.status(400).json({
				error: "Missing parameter 'rstName'"
			});
		}
		if (["posedge, negedge"].includes(!clkEdge)) {
			return res.status(400).json({
				error: "Invalid clock edge."
			});
		}
		if (["posedge, negedge"].includes(!rstEdge)) {
			return res.status(400).json({
				error: "Invalid reset edge."
			});
		}
		if (["sync, async"].includes(!rstMode)) {
			return res.status(400).json({
				error: "Invalid reset mode."
			});
		}
		if (["low", "high"].includes(!rstLevel)) {
			return res.status(400).json({
				error: "Invalid reset level."
			});
		}

		rstLevel = rstLevel.trim() === "low" ? 0 : 1;

		return repo.getEntry(
			{
				_id: item
			},
			function(err, entry) {
				if (err) {
					return res.status(500).json(err);
				} else if (!item) {
					return res.status(500).json({
						error: "Entry does not exist."
					});
				} else {
					return entry.getContent(function(
						err,
						content
					) {
						if (err) {
							return res.status(500).json(err);
						} else {
							return FSMCompiler.compile(
								content,
								moduleName,
								inports,
								outports,
								encoding,
								clkName,
								clkEdge,
								rstName,
								rstEdge,
								rstMode,
								rstLevel,
								function(err, compiled) {
									if (err) {
										return res
											.status(200)
											.json({
												content: {},
												status: 0,
												log: {
													errors: [
														err
													]
												}
											});
									} else {
										return res
											.status(200)
											.json({
												content: compiled,
												status: 1,
												log: {
													errors: []
												}
											});
									}
								}
							);
						}
					});
				}
			}
		);
	} else if (action === "import") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.parent == null ||
			req.body.parent.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'parent'"
			});
		}
		parentId = req.body.parent;
		if (
			req.body.type == null ||
			req.body.type.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'type'"
			});
		}
		if (
			req.body.name == null ||
			req.body.name.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'name'"
			});
		}

		if (
			req.body.content == null ||
			req.body.content.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'content'"
			});
		}

		type = req.body.type.toLowerCase();
		if (type === "verilog") {
			moduleName = req.body.name;
			({ content } = req.body);
			description = "";
			if (req.body.description != null) {
				({ description } = req.body);
			}

			return repo.importVerilogModule(
				parentId,
				user,
				moduleName,
				content,
				description,
				false,
				overwrite,
				function(
					err,
					{ entry: newEntry, content: moduleContent }
				) {
					if (err) {
						return res.status(500).json(err);
					} else {
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "verilog",
							content: moduleContent
						});
					}
				}
			);
		} else if (type === "ip") {
			const ipImportName = req.body.name;
			const ipId = req.body.content;
			if (req.body.description != null) {
				({ description } = req.body);
			}

			return repo.importIPCore(
				parentId,
				user,
				ipImportName,
				ipId,
				description,
				false,
				overwrite,
				function(err, newEntry, ipContent) {
					if (err) {
						return res.status(500).json(err);
					} else {
						return res.status(201).json({
							fileId: newEntry._id,
							parentId: newEntry.parent,
							fileName: newEntry.title,
							fileType: "ip",
							content: ipContent
						});
					}
				}
			);
		} else {
			return res.status(400).json({
				error: `Unknown type ${type}.`
			});
		}
	} else if (action === "include" || action === "exclude") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object" && key !== "item") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			!Array.isArray(req.body.item)
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		items = req.body.item;
		items = req.body.item;

		let statusCheck = (action == "include") ? "included" : "excluded";
		let method = (action == "include") ? "includeInBuild" : "excludeFromBuild";

		return new Promise(async (resolve, reject)=> {
			let affected = [];
			for (let item of items) {
				let entry = await repo.p.getEntry({ _id: item });
				if (!entry) {
					return reject(`Entry ${item} does not exist.`);
				}
				if (!entry.includable) {
					return reject(`Operation ${action} is not applicable to ${item}.`);
				}
				if (entry[statusCheck]) {
					continue;
				}
				let updated = await entry.p[method]();
				
				if (updated.handler === EntryType.VerilogFile) {
					fileType = "verilog";
				} else if (updated.handler === EntryType.SWCFile) {
					fileType = "c";
				} else if (updated.handler === EntryType.SWHFile) {
					fileType = "h";
				} else if (updated.handler === EntryType.Folder) {
					fileType = "folder";
				} else if (updated.handler === EntryType.ipContent) {
					fileType = "ip";
				}
				affected.push({
					fileId: updated._id,
					fileName: updated.title,
					parentId: updated.parent,
					fileType
				});
			}
			return resolve(affected);
		}).then(affected=> {
			return res.status(200).json(affected);
		}).catch(err=> {
			return res.status(500).json(err);
		});
	} else if (action === "verilogtotb") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		({ item } = req.body);
		return repo.getEntry(
			{
				_id: item
			},
			function(err, entry) {
				if (err) {
					return res.status(500).json(err);
				} else if (!entry) {
					return res.status(500).json({
						error: "Entry does not exist."
					});
				} else if (
					entry.handler !== EntryType.VerilogFile
				) {
					return res.status(500).json({
						error:
							"Operation should only be done on verilog modules."
					});
				} else {
					const fileType = "testbench";
					return entry.convertIntoTestbench(function(
						err,
						updatedItem
					) {
						if (err) {
							return res.status(500).json(err);
						} else {
							return res.status(200).json({
								fileId: updatedItem._id,
								fileName: updatedItem.title,
								parentId: updatedItem.parent,
								fileType
							});
						}
					});
				}
			}
		);
	} else if (action === "tbtoverilog") {
		for (key in req.body) {
			value = req.body[key];
			if (typeof value === "object") {
				return res.status(400).json({
					error: `Invalid value for the parameter ${key}`
				});
			}
		}
		if (
			req.body.item == null ||
			req.body.item.trim() === ""
		) {
			return res.status(400).json({
				error: "Missing parameter 'item'"
			});
		}
		({ item } = req.body);
		return repo.getEntry(
			{
				_id: item
			},
			function(err, entry) {
				if (err) {
					return res.status(500).json(err);
				} else if (!entry) {
					return res.status(500).json({
						error: "Entry does not exist."
					});
				} else if (
					entry.handler !== EntryType.TestbenchFile
				) {
					return res.status(500).json({
						error:
							"Operation should only be done on testbenches."
					});
				} else {
					const fileType = "verilog";
					return entry.convertIntoVerilog(function(
						err,
						updatedItem
					) {
						if (err) {
							return res.status(500).json(err);
						} else {
							return res.status(200).json({
								fileId: updatedItem._id,
								fileName: updatedItem.title,
								parentId: updatedItem.parent,
								fileType
							});
						}
					});
				}
			}
		);
	} else {
		return res.status(400).json({
			error: `Unknown action '${action}'.`
		});
	}

} catch (error) {
	console.error(error);
	console.error(req.body);
	return res.status(500).json(error);
}
});

router.get("/publish", restrict, function(req, res, next) {
	const ownerName = req.local.username;
	const repoName = req.local.reponame.toLowerCase();
	const userId = req.user._id;
	const { username } = req.user;
	const logged = true;
	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else if (result.accessLevel < AccessLevel.Owner) {
			return next();
		} else {
			const { repository: repo, accessLevel: role } = result;
			return repo.getIP(function(err, ip) {
				if (err) {
					console.error(err);
					return res.status(500).json(err);
				} else {
					return res.status(201).json({
						repoName,
						ownerName,
						repoTitle: repo.repoTitle,
						logged,
						username,
						params: ip || {
							topModule: repo.topModule || ""
						}
					});
				}
			});
		}
	});
});

router.post("/publish", restrict, function(req, res, next) {
	const ownerName = req.local.username;
	let repoName = req.local.reponame.toLowerCase();
	repoName = req.local.reponame.toLowerCase();
	const userId = req.user._id;
	const { username } = req.user;
	const logged = true;
	return Repo.accessRepo(ownerName, repoName, userId, next, function(
		err,
		result
	) {
		if (err) {
			return res.status(500).json(err);
		} else if (result.accessLevel < AccessLevel.Owner) {
			return next();
		} else {
			const { repository: repo, accessLevel: role } = result;
			for (let key in req.body) {
				const value = req.body[key];
				if (typeof value === "object") {
					return res.status(400).json({
						error: `Invalid value for the parameter ${key}`
					});
				}
			}
			if (req.body.title == null || req.body.title.trim() === "") {
				return res.status(400).json({
					error: "Missing parameter 'title'"
				});
			}
			if (
				req.body.topModule == null ||
				req.body.topModule.trim() === ""
			) {
				return res.status(400).json({
					error: "Missing parameter 'topModule'"
				});
			}
			if (req.body.inputs == null || req.body.inputs.trim() === "") {
				return res.status(400).json({
					error: "Missing parameter 'inputs'"
				});
			}
			if (req.body.outputs == null || req.body.outputs.trim() === "") {
				return res.status(400).json({
					error: "Missing parameter 'outputs'"
				});
			}
			let price = 0;
			if (req.body.price != null && !req.body.price.trim() === "") {
				price = parseInt(req.body.price);
			}
			let description = "";
			if (
				req.body.description != null &&
				req.body.description.trim() !== ""
			) {
				({ description } = req.body);
			}
			const newIp = {
				title: req.body.title,
				header: req.body.header,
				price,
				repo: repo._id,
				user: userId,
				description,
				topModule: req.body.topModule,
				inputs: req.body.inputs,
				outputs: req.body.outputs
			};
			return Repo.publishRepoIP(repo, newIp, function(err, createdIp) {
				if (err) {
					console.error(err);
					return res.status(400).json(err);
				} else {
					return res.status(201).json({
						repoName,
						ownerName,
						repoTitle: repo.repoTitle,
						logged,
						username,
						params: req.body
					});
				}
			});
		}
	});
});

router.post("/favorite", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		const { count, favorited } = await repository.favorite(req.user._id);
		const updatedRepository = repository.toJSON();
		updatedRepository.favorites = count;
		return res.status(200).json({
			repository: updatedRepository,
			favorites: count,
			favorited
		});
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.post("/watch", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		const { count, watched } = await repository.watch(req.user._id);
		const updatedRepository = repository.toJSON();
		updatedRepository.watches = count;
		return res.status(200).json({
			repository: updatedRepository,
			watches: count,
			watched
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.post("/clone", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		const clonedRepo = await repository.clone(
			_.extend(req.body, {
				owner: req.user._id
			})
		);
		return res.status(200).json(clonedRepo);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.post("/authorize", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	const {
		body: { username, accessLevel }
	} = req;
	if (!username) {
		return res.status(400).json({
			error: "Username is required"
		});
	}

	if (
		![
			AccessLevel.NoAccess,
			AccessLevel.ReadWrite,
			AccessLevel.ReadOnly
		].includes(parseInt(accessLevel))
	) {
		return res.status(400).json({
			error: "Invalid access level"
		});
	}

	try {
		const { repository, accessLevel: userRole } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const isWriter = userRole >= AccessLevel.ReadWrite;
		const isOwner =
			AccessLevel.Owner >= userRole ||
			repository.owner.toString() === req.user._id.toString();
		if (!isOwner) {
			return res.status(403).json({
				error: "Access denied (insufficient permissions)."
			});
		}
		const { user, role } = await repository.authorize(
			username,
			parseInt(accessLevel, 10)
		);
		Promise.resolve(1).then(async () => {
			let repoUrl = "https://cloudv.io";
			let granterUrl = "https://cloudv.io";
			const origin = req.headers.origin;

			let senderProfile;
			let receiverProfile;
			let from;
			let to;
			try {
				senderProfile = await User.getUserProfile({
					user: req.user._id
				});
				if (!senderProfile) {
					from = req.user;
				} else {
					from = _.extend(
						senderProfile.toJSON(),
						_.omit(req.user.toJSON(), [
							"password",
							"admin",
							"superAdmin"
						])
					);
				}
			} catch (err) {
				from = req.user;
				console.error(err);
			}
			try {
				receiverProfile = await User.getUserProfile({
					user: user._id
				});
				if (!receiverProfile) {
					to = user;
				} else {
					to = _.extend(
						receiverProfile.toJSON(),
						_.omit(user.toJSON(), [
							"password",
							"admin",
							"superAdmin"
						])
					);
				}
			} catch (err) {
				to = user;
				console.error(err);
			}

			if (config.frontend.host) {
				repoUrl = urlFormatter({
					protocol: req.protocol,
					host: config.frontend.host,
					pathname: `/${ownerName}/${repoName}`,
					query: {}
				});
				granterUrl = urlFormatter({
					protocol: req.protocol,
					host: config.frontend.host,
					pathname: `/${req.user.username}`,
					query: {}
				});
			} else if (origin && origin.length) {
				const parsedURL = new URL(origin);
				repoUrl = urlFormatter({
					protocol: req.protocol,
					host: parsedURL.host,
					pathname: `/${ownerName}/${repoName}`,
					query: {}
				});
				granterUrl = urlFormatter({
					protocol: req.protocol,
					host: parsedURL.host,
					pathname: `/${req.user.username}`,
					query: {}
				});
			} else {
				console.error("Missing URL Configuration");
			}
			const level = role.levelName;
			Mailer.sendAccessEmail({
				from,
				to,
				level,
				url: repoUrl,
				repoTitle: repository.repoTitle,
				granterUrl
			})
				.then(() => {})
				.catch(console.error);
		});

		return res.json({
			user,
			role,
			level: role.levelName
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});
router.post("/deauthorize", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	const {
		body: { username, accessLevel }
	} = req;
	if (!username) {
		return res.status(400).json({
			error: "Username is required"
		});
	}

	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const isWriter = accessLevel >= AccessLevel.ReadWrite;
		const isOwner =
			AccessLevel.Owner >= accessLevel ||
			repository.owner.toString() === req.user._id.toString();
		if (!isOwner) {
			return res.status(403).json({
				error: "Access denied (insufficient permissions)."
			});
		}
		const { user, role } = await repository.deauthorize(
			username,
			accessLevel
		);

		return res.json({
			user,
			role,
			level: role.levelName
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/files", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();

	const filter = (req.query.filter || "").trim().toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);

		const filterFunctions = {
			folder: "getFolderStructure",
			verilog: "getVerilogStructure",
			vcd: "getSimulationStructure",
			testbench: "getTestbenchStructure",
			pcf: "getPCFStructure",
			dcf: "getDCFStructure",
			linker: "getLinkerStructure",
			startup: "getStartupStructure",
			netlist: "getNetlistStructure"
		};
		const functionName =
			!filter.length || filter === "*"
				? "getFileStructure"
				: filterFunctions[filter];
		if (!functionName) {
			return res.status(500).json({
				error: `Invalid filter ${filter}`
			});
		}
		const metaData = {
			build: repository.buildDir,
			sw: repository.swDir,
			swHex: repository.swHexDir,
			topModule: repository.topModule,
			topModuleEntry: repository.topModuleEntry,
			repoId: repository._id,
			accessLevel
		};
		const files = await repository[functionName]();
		return res.status(200).json(
			_.extend(
				{
					files
				},
				metaData
			)
		);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const isWriter = accessLevel >= AccessLevel.ReadWrite;
		const isOwner = repository.owner.toString() === req.user._id.toString();
		const watched = await repository.isWatchedFrom(req.user._id);
		const favorited = await repository.isFavoritedFrom(req.user._id);
		const repoJson = repository.toJSON();
		repoJson.isWriter = isWriter;
		repoJson.isOwner = isOwner;
		repoJson.watched = watched;
		repoJson.favorited = favorited;
		return res.status(200).json({
			repository: repoJson,
			accessLevel,
			isWriter,
			isOwner,
			watched,
			favorited
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/versions", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const versions = await repository.getVersions();
		return res.status(200).json(versions);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/contributors", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const contributors = await repository.getContributors();
		return res.status(200).json(contributors);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.post("/versions/new", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();

	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const isWriter = accessLevel >= AccessLevel.ReadWrite;
		const isOwner =
			AccessLevel.Owner >= accessLevel ||
			repository.owner.toString() === req.user._id.toString();
		if (!isWriter) {
			return res.status(403).json({
				error: "Access denied (insufficient permissions)."
			});
		}
		const version = await repository.createVersion(
			_.extend(req.body, {
				user: req.user._id
			})
		);
		return res.json(version);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/versions/download/:versionId", async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	const { versionId } = req.params;

	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		const version = await repository.getVersion({
			_id: versionId
		});
		if (!version) {
			return next();
		}
		const versionRepo = await version.getVersionRepo();
		if (!versionRepo) {
			return next();
		}
		const downloadName = `${version.repoTitle}-${version.title}-${
			version.number
		}.zip`;
		const { zipPath, tempPath } = await versionRepo.package();
		return res.download(zipPath, downloadName, async err => {
			if (err) {
				console.error(err);
			}
			return rmdir(tempPath, rmerr => {
				if (rmerr) {
					console.error(rmerr);
				}
			});
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.post("/versions/delete/:versionId", async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	const { versionId } = req.params;
	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		const isWriter = accessLevel >= AccessLevel.ReadWrite;
		const isOwner =
			AccessLevel.Owner >= accessLevel ||
			repository.owner.toString() === req.user._id.toString();
		if (!isWriter) {
			return res.status(403).json({
				error: "Access denied (insufficient permissions)."
			});
		}
		const version = await repository.getVersion({
			_id: versionId
		});
		if (!version) {
			return next();
		}
		const deletedVersion = await Repo.deleteRepoVersion(version);
		return res.json(deletedVersion);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.post("/versions/clone/:versionId", async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	const { versionId } = req.params;

	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		const version = await repository.getVersion({
			_id: versionId
		});
		if (!version) {
			return next();
		}
		const versionRepo = await version.getVersionRepo();
		const clonedRepo = await versionRepo.clone(
			_.extend(req.body, {
				owner: req.user._id
			})
		);
		return res.json(clonedRepo);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.post("/certify", async (req, res, next) => {
	if (!req.user.admin) {
		return next();
	}
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const repository = await Repo.getRepo({
			ownerName,
			repoName
		});
		if (!repository) {
			return next();
		}
		const updates = {
			certified: !repository.certified
		};

		const updatedRepo = await repository.edit(updates);
		return res.json(updatedRepo);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.post("/feature", restrict, async (req, res, next) => {
	if (!req.user.admin) {
		return next();
	}
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();
	try {
		const repository = await Repo.getRepo({
			ownerName,
			repoName
		});
		if (!repository) {
			return next();
		}
		const updates = {
			featured: !repository.featured
		};

		const updatedRepo = await repository.edit(updates);
		return res.json(updatedRepo);
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/ws", (req, res, ntext) => {
	Promise.resolve(1).then(() => {
		const pagePath = path.join(__dirname, "../../views", "ws-auth.html");
		fs.readFile(pagePath, "utf8", (err, content) => {
			if (err) {
				return res.status(500).json({
					error: "Failed.."
				});
			}
			const result = minify(content, {
				minifyJS: true
			});
			return res.set("Content-Type", "text/html").send(result);
		});
	});
});

router.get("/soc/templates", restrict, async (req, res, next) => {
	const ownerName = req.local.username.toLowerCase();
	const repoName = req.local.reponame.toLowerCase();

	try {
		const { repository, accessLevel } = await Repo.accessRepo(
			ownerName,
			repoName,
			req.user._id,
			next
		);
		if (accessLevel < AccessLevel.ReadOnly) {
			return next();
		}
		try {
			const busReader = require("../../modules/soc/bus_reader");
			const resp = await busReader();
			return res.json(resp);
		} catch (err) {
			console.error(err);
			return res.status(500).json({
				error: "Failed to load templates"
			});
		}
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

module.exports = router;
