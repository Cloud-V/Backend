const tools = require("../../templates/tools");
const about = require("../../templates/about");
const { terms, privacy } = require("../../templates/policy");

const restrict = require("../../passport/restrict");

const Repo = require("../../controllers/repo");
const User = require("../../controllers/user");
const CallbackToken = require("../../controllers/callback_token");
const FileManager = require("../../controllers/file_manager");

const repoModel = require("../../models/repo");
const repoEntryModel = require("../../models/repo_entry");
const userModel = require("../../models/user");
const { model: InvalidToken } = require("../../models/invalid_token");

const Mailer = require("../../modules/mailer");
const S3Manager = require("../../modules/s3_manager");

const _ = require("underscore");
const TurndownService = require("turndown");
const C = require("canvas");
const shortid = require("shortid");
const rmdir = require("rimraf");

const multer = require("multer");
const express = require("express");
const generateName = require("project-name-generator");
const fs = require("fs-extra");
const { minify } = require("html-minifier");

const path = require("path");

const { verify } = require('hcaptcha')

const { PrivacyType } = repoModel;
const { EntryType } = repoEntryModel;
const { UserType, AuthType } = userModel;

const router = express.Router();
const turndownService = new TurndownService();

const DefaultImageWidth = 400;
const DefaultImageHeight = 400;

const storage = multer.diskStorage({
	destination(req, file, next) {
		const uploadPath = path.join(process.cwd(), "uploads");
		return next(null, uploadPath);
	},
	filename(req, file, next) {
		return next(
			null,
			`${file.fieldname}-${path.basename(
				file.originalname,
				path.extname(file.originalname)
			)}-${shortid.generate()}-${(req.user || {})._id ||
			""}-${Date.now()}${path.extname(file.originalname)}`
		);
	}
});

const avatarUploader = multer({
	storage: storage,
	fileFilter: (req, file, next) => {
		const ext = (path.extname(file.originalname) || "").toLowerCase();
		if ([".png", ".jpg", ".jpeg", ".gif"].indexOf(ext) === -1) {
			return next({
				error: "Invalid image file"
			});
		}
		next(null, true);
	},
	limits: {
		fileSize: 4000000
	}
}).single("avatar");

router.get("/heartbeat", (req, res, next) => res.status(200).end());

router.get("/admin", restrict, async (req, res, next) => {
	if (!req.user.admin) {
		return next();
	}
	const statFns = [
		User.countUsers({}),
		Repo.countRepos({}),
		Repo.countRepoEntries({}),
		Repo.countRepoEntries({
			handler: EntryType.VerilogFile
		}),
		Repo.countRepoEntries({
			handler: EntryType.NetlistFile
		}),
		Repo.countRepoEntries({
			handler: EntryType.TestbenchFile
		}),
		Repo.countRepoEntries({
			handler: EntryType.VCDFile
		})
	];
	try {
		const [
			users,
			repositories,
			repoEntries,
			verilogEntries,
			netlistEntries,
			testbenchEntries,
			simulationEntries
		] = await Promise.all(statFns);
		return res.json({
			users,
			repositories,
			repoEntries,
			verilogEntries,
			netlistEntries,
			testbenchEntries,
			simulationEntries
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}
});

router.get("/search", async (req, res, next) => {
	const query = (req.query.q || "").trim();
	const repositoriesPage = parseInt(
		req.query.rpage || req.query.rp || req.query.page || req.query.p || 0,
		10
	);
	const usersPage = parseInt(
		req.query.upage || req.query.up || req.query.page || req.query.p || 0,
		10
	);
	try {
		const { "0": repositories, "1": users } = await Promise.all([
			Repo.search(query, (req.user || {})._id, {
				page: repositoriesPage
			}),
			User.search(query, {
				page: usersPage
			})
		]);

		return res.status(200).json({
			users,
			repositories
		});
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/explore", async (req, res, next) => {
	const featuredPage = parseInt(
		req.query.fpage || req.query.fp || req.query.page || req.query.p || 0,
		10
	);
	const popularPage = parseInt(
		req.query.ppage || req.query.pp || req.query.page || req.query.p || 0,
		10
	);
	const latestPage = parseInt(
		req.query.lpage || req.query.lp || req.query.page || req.query.p || 0,
		10
	);
	try {
		const { "0": featured, "1": popular, "2": latest } = await Promise.all([
			Repo.getAccessibleRepos(
				{
					featured: true
				},
				(req.user || {})._id,
				{
					page: featuredPage,
					sort: {
						favorites: -1,
						watches: -1,
						createdAt: -1
					},
					limit: 9 * 3
				}
			),
			Repo.getAccessibleRepos({}, (req.user || {})._id, {
				page: popularPage,
				sort: {
					favorites: -1,
					watches: -1
				},
				limit: 9 * 3
			}),
			Repo.getAccessibleRepos({}, (req.user || {})._id, {
				page: latestPage,
				sort: {
					createdAt: -1
				},
				limit: 9 * 3
			})
		]);

		return res.status(200).json({
			featured,
			popular,
			latest
		});
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/about", function (req, res, next) {
	return res.json(about);
});

router.get("/tools", function (req, res, next) {
	return res.json(tools);
});

router.get("/privacy", function (req, res, next) {
	return res.json({
		privacy: turndownService.turndown(privacy)
	});
});

router.get("/terms", function (req, res, next) {
	return res.json({
		terms: turndownService.turndown(terms)
	});
});

router.post("/bug", restrict, function (req, res, next) {
	const params = req.body;

	if (params.title == null || params.title.trim() === "") {
		return res.status(400).json({
			error: 'Missing parameter "title"'
		});
	}
	if (params.body == null || params.body.trim() === "") {
		return res.status(400).json({
			error: 'Missing parameter "body"'
		});
	}

	const title = `[Bug Report] ${params.title.trim()}`;
	const body = `The current bug has been reported by @${req.user.username}(${req.user.email
		}):

${params.body.trim()}
\
`;

	return Mailer.sendEmailFromUser("agiza@cloudv.io", title, body, function (
		err
	) {
		if (err) {
			return res.status(500).json(err);
		} else {
			res.status(200).json({
				success: 1
			});
			return Mailer.sendEmailFromUser(
				"ahmedagiza@aucegypt.edu",
				title,
				body,
				function (err) {
					if (err) {
						return console.error(err);
					}
				}
			);
		}
	});
});

router.post("/try", async function (req, res, next) {
	const logged = req.isAuthenticated() || false;
	if (logged) {
		return res.status(400).json({ error: "You are already registered" });
	}

	let exists = true;
	let username = `try_cloudv_${shortid.generate() +
		shortid.generate()}`.replace(/[^\w]/, "_");
	let password = `Ab123${shortid.generate()}`;
	let email = `try_cloudv_${shortid
		.generate()
		.replace(/[^\w]/, "_")}@cloudv-trial.com`;
	while (exists) {
		try {
			const usernameUser = await User.getUser({ username });
			if (usernameUser) {
				username = `${shortid.generate() + shortid.generate()}`.replace(
					/[^\w]/,
					"_"
				);
				continue;
			}
			const emailUser = await User.getUser({ email });
			if (emailUser) {
				email = `try_cloudv_${shortid
					.generate()
					.replace(/[^\w]/, "_")}@trial.cloudv.com`;
				continue;
			}
		} catch (err) {
			return res.status(500).json(err);
		}
		exists = false;
	}

	const { user, token } = await User.createUser(
		_.extend(
			{
				username,
				password,
				email
			},
			{
				authType: AuthType.Local,
				authComplete: true,
				type: UserType.Trial
			}
		)
	);
	delete user.password;
	user.token = await User.signTrialUser(user);

	const profile = await User.getUserProfile({
		user: user._id
	});

	const displayName = generateName()
		.raw.map(el => el.charAt(0).toUpperCase() + el.substr(1))
		.join(" ");
	const repoName = shortid.generate().replace(/[^\w]/, "_");
	const updatedprofile = await User.updateUserProfile(profile._id, {
		displayName
	});

	let repository;
	try {
		repository = await Repo.createRepo({
			repoTitle: repoName,
			privacy: PrivacyType.Private,
			description: "",
			owner: user._id,
			isTrial: true
		});
	} catch (err) {
		return res.status(500).json(err);
	}

	const merged = _.extend(
		updatedprofile.toJSON(),
		_.omit(user, ["password"])
	);
	return res.status(200).json({ user: merged, repository });
});

router.get("/users", function (req, res, next) {
	const term = req.query.q || "";

	if (term == null || term.length < 3) {
		return res.json([]);
	}
	return User.getSuggestions(term, function (err, suggestions) {
		if (err) {
			return res.status(500).json(err);
		} else {
			if (req.user != null && req.user.authComplete) {
				if (suggestions.includes(req.user.username)) {
					suggestions.splice(
						suggestions.indexOf(req.user.username),
						1
					);
				}
			}
			return res.json(suggestions);
		}
	});
});

router.post("/login", async (req, res, next) => {
	const { body } = req;
	let loginResult;
	const { captcha_token } = req.body
	if (!captcha_token) {
		console.log('error1')
		return res.status(500).json({ error: 'captcha not done correctly' })
	}
	try {
		let { success } = await verify(process.env.CAPTCHA_SECRET, captcha_token)
		if (!success) {
			console.log('error2')
			return res.status(500).json({ error: 'captcha not done correctly' })
		}
		try {
			loginResult = await User.login(body);
		} catch (err) {
			return res.status(500).json(err);
		}

		const { user, token } = loginResult;
		user.token = token;

		return res.status(200).json(user);
	}
	catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}

});

router.get("/logout", async (req, res, next) => {
	if (
		req.user != null &&
		global.userSockets !== undefined &&
		Array.isArray(global.userSockets[req.user._id.toString()])
	) {
		for (let sock of Array.from(
			global.userSockets[req.user._id.toString()]
		)) {
			sock.disconnect(false);
		}
	}
	if (req.user && req.userToken) {
		try {
			const token = await InvalidToken.create({
				user: req.user._id,
				token: req.userToken,
				reason: "logout"
			});
		} catch (err) {
			return res.status(500).json(err);
		}
	}
	req.logout();
	if (req.session) {
		req.session.afterAuth = undefined;
		req.session.destroy();
	}
	return res.json({});
});

router.post("/signup", async (req, res, next) => {
	const { username, password, email, captcha_token } = req.body;
	if (!captcha_token) {
		console.log('error1')
		return res.status(500).json({ error: 'captcha not done correctly' })
	}
	try {
		let { success } = await verify(process.env.CAPTCHA_SECRET, captcha_token)
		if (!success) {
			console.log('error2')
			return res.status(500).json({ error: 'captcha not done correctly' })
		}
		try {
			const { user, token } = await User.createUser(
				_.extend(
					{
						username,
						password,
						email
					},
					{
						authType: AuthType.Local,
						authComplete: true
					}
				)
			);
			delete user.password;
			user.token = token;
			const profile = await User.getUserProfile({
				user: user._id
			});
			const merged = _.extend(profile.toJSON(), _.omit(user, ["password"]));
			return res.status(200).json(merged);
		} catch (err) {
			console.error(err);
			return res.status(500).json(err);
		}
	}
	catch (err) {
		console.error(err);
		return res.status(500).json(err);
	}

});

router.post("/edit/password", restrict, async (req, res, next) => {
	const { currentPassword, password } = req.body;
	if (!currentPassword || !password) {
		return res.status(400).json({
			error: "Bad request"
		});
	}
	try {
		let loginResult;
		try {
			loginResult = await User.login({
				username: req.user.username,
				password: currentPassword
			});
		} catch (err) {
			return res.status(500).json({
				error: "You have provided a wrong password."
			});
		}

		const { user, token } = await User.updateUserPassword(
			{
				_id: req.user._id
			},
			password
		);
		user.token = token;
		const profile = await User.getUserProfile({
			user: user._id
		});
		const merged = _.extend(profile.toJSON(), _.omit(user, ["password"]));
		return res.json(merged);
	} catch (err) {
		return res.status(500).json(err);
	}
});
router.post("/edit", restrict, async (req, res, next) => {
	avatarUploader(req, res, async err => {
		if (err) {
			console.error(err);
			return res.status(500).json({
				error: "Image upload failed"
			});
		}

		const omitNull = !!req.query.nonull;

		const {
			displayName,
			personalURL,
			about,
			dashboardTour,
			workspaceTour,
			repositoryTour
		} = req.body;
		const updates = {
			displayName,
			personalURL,
			about
		};
		const tourUpdates = {
			dashboardTour,
			workspaceTour,
			repositoryTour
		};
		if (omitNull) {
			for (let k in updates) {
				if (typeof updates[k] === "undefined" || updates[k] === "") {
					delete updates[k];
				}
			}
		}
		if (req.file) {
			req.file.extension = ".png";
			const resizedPath = `${req.file.path}_resized.png`;
			try {
				const canvas = C.createCanvas(DefaultImageWidth, DefaultImageHeight);
				const context = canvas.getContext("2d");
				context.fillStyle = "white";
				context.fillRect(0, 0, canvas.width, canvas.height);
				context.patternQuality = 'best';
				const sourceImage = await C.loadImage(req.file.path);

				let finalHeight = (DefaultImageWidth / sourceImage.width) * sourceImage.height;
				let heightOffset = (DefaultImageHeight - finalHeight) / 2;

				context.drawImage(
					sourceImage,
					0,
					0,
					sourceImage.width,
					sourceImage.height,
					0,
					heightOffset,
					DefaultImageWidth,
					finalHeight
				);

				let data = canvas.toBuffer();
				console.error(resizedPath);
				await fs.writeFile(
					resizedPath,
					data
				);
			} catch (e) {
				console.error(e);
				fs.unlink(req.file.path, err => console.error(err));
				return res.status(500).json({
					error: "Image upload failed"
				});
			}
			fs.unlink(req.file.path, err => console.error(err));

			try {
				const createdFile = await FileManager.createMediaFile({
					path: resizedPath
				}, {
					user: req.user._id,
					...req.file
				});
				updates.avatarFile = createdFile._id;
			} catch (e) {
				fs.unlink(resizedPath, err => console.error(err));
				return res.status(500).json({
					error: "Image upload failed"
				});
			}
			fs.unlink(resizedPath, err => console.error(err));
		}

		try {
			const user = await User.getUser({
				_id: req.user._id
			});
			if (!user) {
				if (req.file) {
					FileManager.clearMediaFileEntry(updates.avatarFile)
						.then(() => { })
						.catch(console.error);
				}
				return res.status(500).json({
					error: "Update failed."
				});
			}
			const profile = await User.getUserProfile({
				user: user._id
			});
			if (!profile) {
				if (req.file) {
					FileManager.clearMediaFileEntry(updates.avatarFile)
						.then(() => { })
						.catch(console.error);
				}
				return res.status(500).json({
					error: "Update failed."
				});
			}
			for (let k in tourUpdates) {
				if (typeof tourUpdates[k] === "undefined") {
					tourUpdates[k] = !!profile[k];
				}
			}

			const currentAvatarFile = profile.avatarFile;
			const updatedprofile = await User.updateUserProfile(
				profile._id,
				_.extend(updates, tourUpdates)
			);
			const merged = _.extend(
				updatedprofile.toJSON(),
				_.omit(user.toJSON(), ["password"])
			);

			if (req.file && currentAvatarFile) {
				FileManager.clearMediaFileEntry(currentAvatarFile)
					.then(() => { })
					.catch(console.error);
			}
			merged.token = req.userToken;
			return res.json(merged);
		} catch (err) {
			return res.status(500).json(err);
		}
	});
});

router.post("/contact", async (req, res, next) => {
	const name = `${req.body.name}`.trim();
	const email = `${req.body.email}`.trim();
	const typeNo = parseInt(`${req.body.type}`);
	const subject = `${req.body.subject}`.trim();
	const content = `${req.body.content}`.trim();
	if (!name || !email || !subject || !content) {
		return res.status(400).json({
			error: "Bad Request"
		});
	}
	let type = "inquiry";
	if (typeNo === 0) {
		type = "bug";
	} else if (typeNo === 2) {
		type = "other";
	}
	const emailData = {
		name,
		email,
		type,
		subject,
		content
	};
	try {
		await Mailer.sendContactUsEmail(emailData);
		return res.status(200).json({
			success: 1
		});
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/port", async (req, res, next) => {
	Promise.resolve(1).then(() => {
		const pagePath = path.join(__dirname, "../../views", "port.html");
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

router.post("/webhook", function (req, res, next) {
	const { token } = req.query;
	const { repo } = req.query;
	if (token != null && repo != null) {
		return CallbackToken.getValidToken(
			{
				value: token,
				repo
			},
			function (err, token) {
				if (err) {
					return res.status(500).json(err);
				}
				let tempDownloadPath = undefined;
				let outputBucket = undefined;
				let outputKey = undefined;
				const cleanup = function () {
					if (tempDownloadPath != null) {
						rmdir(tempDownloadPath, function (err) {
							if (err) {
								return console.error(err);
							}
						});
					}
					if (outputBucket != null && outputKey) {
						return S3Manager.remove(
							outputBucket,
							outputKey,
							function (err) {
								if (err) {
									return console.error(err);
								}
							}
						);
					}
				};
				const cleanupWithFail = function (repo, entry, reportEntry) {
					cleanup();
					if (entry) {
						entry.setFailed(function (err) {
							if (err) {
								return console.error(err);
							}
						});
					}
					if (reportEntry) {
						return reportEntry.setFailed(function (err) {
							if (err) {
								return console.error(err);
							}
						});
					}
				};
				return Repo.getRepo(
					{
						_id: token.repo
					},
					function (err, repo) {
						if (err) {
							cleanup();
							return res.status(500).json(err);
						}
						if (!repo) {
							cleanup();
							return res.status(500).json({
								error: "Not found"
							});
						}
						return repo.getEntry(
							{
								_id: token.entry
							},
							function (err, entry) {
								if (err) {
									cleanup();
									return res.status(500).json(err);
								} else if (!entry) {
									cleanup();
									return res.status(500).json({
										error: "Not found"
									});
								} else {
									return repo.getEntry(
										{
											_id: token.reportEntry
										},
										function (err, reportEntry) {
											if (err) {
												console.error(err);
											}
											tempDownloadPath = path.join(
												"temp",
												`${shortid.generate()}-${shortid.generate()}-${Date.now()}-${repo.owner
												}-${repo._id}-output`
											);
											const tempDownloadFile = path.join(
												tempDownloadPath,
												"output-log.json"
											);
											outputBucket = token.resultBucket;
											outputKey = token.resultPath;
											return fs.mkdir(
												tempDownloadPath,
												function (err) {
													if (err) {
														cleanupWithFail(
															repo,
															entry,
															reportEntry
														);
														return res
															.status(500)
															.json({
																error:
																	"Failed to get results"
															});
													} else {
														return S3Manager.download(
															outputBucket,
															outputKey,
															tempDownloadFile,
															function (err) {
																if (err) {
																	cleanupWithFail(
																		repo,
																		entry,
																		reportEntry
																	);
																	return res
																		.status(
																			500
																		)
																		.json(
																			err
																		);
																} else {
																	return fs.readFile(
																		tempDownloadFile,
																		function (
																			err,
																			content
																		) {
																			if (
																				err
																			) {
																				cleanupWithFail(
																					repo,
																					entry,
																					reportEntry
																				);
																				console.error(
																					err
																				);
																				return res
																					.status(
																						500
																					)
																					.json(
																						{
																							error:
																								"Failed to get results"
																						}
																					);
																			} else {
																				let parsedContent = undefined;
																				try {
																					parsedContent = JSON.parse(
																						content
																					);
																				} catch (e) {
																					console.error(
																						e
																					);
																					cleanupWithFail(
																						repo,
																						entry,
																						reportEntry
																					);
																					return res
																						.status(
																							500
																						)
																						.json(
																							{
																								error:
																									"Failed to get results"
																							}
																						);
																				}
																				const {
																					reportErr
																				} = parsedContent;
																				const {
																					synthContent
																				} = parsedContent;
																				const {
																					synthLog
																				} = parsedContent;
																				const reportContent =
																					parsedContent.reportContent ||
																					"";
																				const sendNotificationAndLogs = function (
																					entry,
																					reportEntry
																				) {
																					cleanup();
																					const repoSockets =
																						global
																							.repoSockets[
																						repo._id.toString()
																						];
																					if (
																						repoSockets !=
																						null
																					) {
																						return (() => {
																							const result1 = [];
																							for (let repoSocket of Array.from(
																								repoSockets
																							)) {
																								if (
																									repoSocket.socket !=
																									null &&
																									typeof repoSocket
																										.socket
																										.emit ===
																									"function"
																								) {
																									const result = {
																										synthLog,
																										reportErr,
																										repoId:
																											repo._id,
																										entry: {
																											parentId:
																												entry.parent,
																											fileId:
																												entry._id,
																											fileName:
																												entry.title,
																											fileType:
																												entry.prefixedName,
																											content: synthContent
																										},
																										type:
																											"synthesis"
																									};
																									if (
																										reportEntry
																									) {
																										result.reportEntry = {
																											parentId:
																												reportEntry.parent,
																											fileId:
																												reportEntry._id,
																											fileName:
																												reportEntry.title,
																											fileType:
																												reportEntry.prefixedName,
																											content: reportContent
																										};
																									}
																									result1.push(
																										repoSocket.socket.emit(
																											"result",
																											result
																										)
																									);
																								} else {
																									result1.push(
																										undefined
																									);
																								}
																							}
																							return result1;
																						})();
																					}
																				};

																				if (
																					synthLog
																						.errors
																						.length ===
																					0
																				) {
																					return entry.updateContent(
																						synthContent,
																						function (
																							err
																						) {
																							if (
																								err
																							) {
																								console.error(
																									err
																								);
																								cleanupWithFail(
																									repo,
																									entry,
																									reportEntry
																								);
																								return res
																									.status(
																										500
																									)
																									.json(
																										{
																											error:
																												"Failed to get results"
																										}
																									);
																							} else {
																								if (
																									reportEntry
																								) {
																									return reportEntry.updateContent(
																										reportContent,
																										function (
																											rerr
																										) {
																											if (
																												rerr
																											) {
																												console.error(
																													rerr
																												);
																											}
																											return entry.setReady(
																												function (
																													err,
																													entry
																												) {
																													if (
																														err
																													) {
																														console.error(
																															err
																														);
																														cleanupWithFail(
																															repo,
																															entry,
																															reportEntry
																														);
																														return res
																															.status(
																																500
																															)
																															.json(
																																{
																																	error:
																																		"Failed to get results"
																																}
																															);
																													} else if (
																														rerr
																													) {
																														return reportEntry.setFailed(
																															function (
																																err,
																																reportEntry
																															) {
																																if (
																																	err
																																) {
																																	console.error(
																																		err
																																	);
																																}
																																sendNotificationAndLogs(
																																	entry,
																																	reportEntry
																																);
																																return res
																																	.status(
																																		200
																																	)
																																	.json(
																																		{
																																			done: 1
																																		}
																																	);
																															}
																														);
																													} else {
																														return reportEntry.setReady(
																															function (
																																err,
																																reportEntry
																															) {
																																if (
																																	err
																																) {
																																	console.error(
																																		err
																																	);
																																	return reportEntry.setFailed(
																																		function (
																																			err,
																																			reportEntry
																																		) {
																																			if (
																																				err
																																			) {
																																				console.error(
																																					err
																																				);
																																			}
																																			sendNotificationAndLogs(
																																				entry,
																																				reportEntry
																																			);
																																			return res
																																				.status(
																																					200
																																				)
																																				.json(
																																					{
																																						done: 1
																																					}
																																				);
																																		}
																																	);
																																} else {
																																	sendNotificationAndLogs(
																																		entry,
																																		reportEntry
																																	);
																																	return res
																																		.status(
																																			200
																																		)
																																		.json(
																																			{
																																				done: 1
																																			}
																																		);
																																}
																															}
																														);
																													}
																												}
																											);
																										}
																									);
																								}
																							}
																						}
																					);
																				} else {
																					return entry.setFailed(
																						function (
																							err,
																							entry
																						) {
																							if (
																								err
																							) {
																								console.error(
																									err
																								);
																								return res
																									.status(
																										500
																									)
																									.json(
																										{
																											error:
																												"Failed to get results"
																										}
																									);
																							} else {
																								if (
																									reportEntry
																								) {
																									return reportEntry.setFailed(
																										function (
																											err,
																											reportEntry
																										) {
																											if (
																												err
																											) {
																												console.error(
																													err
																												);
																											}
																											sendNotificationAndLogs(
																												entry,
																												reportEntry
																											);
																											return res
																												.status(
																													200
																												)
																												.json(
																													{
																														failed: 1
																													}
																												);
																										}
																									);
																								} else {
																									sendNotificationAndLogs(
																										entry,
																										reportEntry
																									);
																									return res
																										.status(
																											200
																										)
																										.json(
																											{
																												failed: 1
																											}
																										);
																								}
																							}
																						}
																					);
																				}
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
									);
								}
							}
						);
					}
				);
			}
		);
	} else {
		return res.status(400).json({
			error: "Bad Request"
		});
	}
});

router.get("/avatar/:username.png", async (req, res, next) => {
	const { username } = req.params;
	try {
		const user = await User.getUser({
			username,
			type: UserType.Regular
		});
		if (!user) {
			return next();
		}
		const profile = await user.getProfile();
		if (profile.avatarFile) {
			try {
				const avatarStream = await FileManager.getMediaFileStream(
					profile.avatarFile
				);
				return avatarStream.pipe(res);
			} catch (err) {
				return res.status(500).json(err);
			}
		}

		const base64Data = profile.generatedAvatar.replace(
			/^data:image\/png;base64,/,
			""
		);
		const imgBuffer = Buffer.from(base64Data, "base64");
		res.end(imgBuffer, "binary");
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/repositories/:username", restrict, async (req, res, next) => {
	const { username } = req.params;
	const page = parseInt(req.query.page || req.query.p || 0, 10);
	try {
		const user = await User.getUser({
			username
		});
		if (!user) {
			return next();
		}
		const repos = await Repo.getAccessibleRepos(
			{
				owner: user._id
			},
			req.user._id,
			{
				page
			}
		);
		return res.json(repos);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/shared/:username", restrict, async (req, res, next) => {
	const { username } = req.params;
	const page = parseInt(req.query.page || req.query.p || 0, 10);
	try {
		const user = await User.getUser({
			username
		});
		if (!user) {
			return next();
		}
		const repos = await Repo.getUserSharedRepos(req.user._id, user._id, {
			page
		});
		return res.json(repos);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/watching/:username", restrict, async (req, res, next) => {
	const { username } = req.params;
	const page = parseInt(req.query.page || req.query.p || 0, 10);
	try {
		const user = await User.getUser({
			username
		});
		if (!user) {
			return next();
		}
		const repos = await Repo.getUserWatchingRepos(req.user._id, user._id, {
			page
		});
		return res.json(repos);
	} catch (err) {
		return res.status(500).json(err);
	}
});

router.get("/:username", async (req, res, next) => {
	const { username } = req.params;
	try {
		const user = await User.getUser({
			username,
			type: UserType.Regular,
			authComplete: true
		});
		if (!user) {
			return next();
		}
		const isMe =
			user._id.toString() === ((req.user || {})._id || "").toString();
		const profile = await user.getProfile();
		const merged = _.extend(
			profile.toJSON(),
			_.omit(user.toJSON(), [
				"password",
				...(isMe
					? []
					: [
						"admin",
						"superAdmin",
						"notificationEndpoints",
						"allowNotifications",
						"allowNotificationsPrompted"
					])
			])
		);
		return res.json(merged);
	} catch (err) {
		return res.status(500).json(err);
	}
});

module.exports = router;
