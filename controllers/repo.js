const mongoose = require("../config/db");
const { ObjectId } = require("mongoose").Types;
const shortid = require("shortid");
const clone = require("clone");
const _ = require("underscore");

const Utils = require("../models/utils");
const {
	AccessLevel
} = require("../models/repo_access");
const {
	PrivacyType
} = require("../models/repo");
const {
	EntryType,
	EntryAccess,
	EntrySource,
	EntryState
} = require("../models/repo_entry");

const {
	LicenseType
} = require("../models/ip");

const versionUser = {
	username: require("../config").versionUser.user,
	email: require("../config").versionUser.email
};
const repoModel = require("../models/repo").model;
const accessModel = require("../models/repo_access").model;


const ReposPerPage = 9;
// const ReposPerPage = 8;

const {
	wrapResolveCallback,
	handleMongooseError,
	getMongooseId,
	getRepoAccessPipeline,
	getPaginationFacet
} = require("../modules/utils");

const createRepo = async (repo, cb) => {
	return new Promise(async (resolve, reject) => {
		repo = _.extend(repo, _.pick(_.omit(repo, Utils.nonCloneable), _.pickSchema(repoModel)));
		if (repo.repoTitle != null) {
			repo.repoName = repo.repoTitle.trim().toLowerCase();
		}
		if (typeof repo.privacy === 'string') {
			repo.privacy = parseInt(repo.privacy);
		}
		const newRepo = new repoModel(repo);
		let createdRepo;
		try {
			createdRepo = await newRepo.save();
		} catch (err) {
			return reject(handleMongooseError(err, 'An error occurred while creating the repository.'));
		}
		try {
			await assignRole({
				repo: createdRepo._id,
				user: createdRepo.owner,
				accessLevel: AccessLevel.Owner
			});
			const {
				entry: rootEntry
			} = await createdRepo.createRoot();
			const {
				entry: srcFolderEntry
			} = await createdRepo.createFolder({
				parent: rootEntry._id,
				user: createdRepo.owner,
				title: 'src',
				description: 'Repository source files',
				access: EntryAccess.ReadWrite,
				source: EntrySource.Generated
			}, false);
			const {
				entry: ipFolderEntry
			} = await createdRepo.createFolder({
				parent: rootEntry._id,
				user: createdRepo.owner,
				title: 'IP Cores',
				description: 'Project IP Cores',
				access: EntryAccess.ReadWrite,
				source: EntrySource.Generated
			}, false);
			const {
				entry: swFolderEntry
			} = await createdRepo.createAnchorFolder({
				parent: rootEntry._id,
				user: createdRepo.owner,
				title: 'S/W',
				description: 'S/W Project Files',
				access: EntryAccess.ReadWrite,
				source: EntrySource.Generated
			}, false);
			const {
				entry: swHexEntry
			} = await createdRepo.createFolder({
				parent: swFolderEntry._id,
				user: createdRepo.owner,
				title: 'Hex',
				description: 'Compiled Hex',
				access: EntryAccess.ReadOnly,
				anchor: true,
				source: EntrySource.Generated
			}, false);
			const {
				entry: docFolderEntry
			} = await createdRepo.createFolder({
				parent: rootEntry._id,
				user: createdRepo.owner,
				title: 'docs',
				description: 'Project Documentation',
				access: EntryAccess.ReadWrite,
				source: EntrySource.Generated
			}, false);
			const {
				entry: readmeFileEntry
			} = await createdRepo.createTextfile({
				parent: docFolderEntry._id,
				user: createdRepo.owner,
				title: 'Readme.txt',
				description: ''
			}, '', false);
			const {
				entry: buildFolderEntry
			} = await createdRepo.createFolder({
				parent: rootEntry._id,
				user: createdRepo.owner,
				title: 'build',
				description: 'Repository build files',
				access: EntryAccess.ReadOnly,
				anchor: true,
				source: EntrySource.Generated
			}, false);
			createdRepo.buildDir = buildFolderEntry._id;
			createdRepo.ipCoresDir = ipFolderEntry._id;
			createdRepo.swDir = swFolderEntry._id;
			createdRepo.swHexDir = swHexEntry._id;
		} catch (err) {
			createdRepo.remove().then(() => { }).catch(console.error)
			return reject(err)
		}
		let updatedRepo
		try {
			updatedRepo = await createdRepo.save();
		} catch (err) {
			createdRepo.remove().then(() => { }).catch(console.error);
			return reject(handleMongooseError(err, 'An error occurred while creating the repository.'));
		}
		try {
			updatedRepo = await updatedRepo.refresh();
		} catch (err) {
			return reject(err);
		}
		const repoObj = updatedRepo.toObject();
		return resolve(updatedRepo);
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const cloneRepo = async (sourceRepo, repoData, cb) => {
	const FileManager = require("./file_manager");

	return new Promise(async (resolve, reject) => {
		let newRepo;
		let repoCreated = false;
		try {
			const {
				repoTitle,
				owner,
				description
			} = repoData;
			let privacy = repoData.privacy;
			if (!repoTitle || !owner || (privacy == null)) {
				return reject({
					error: 'Missing data.'
				});
			}
			if (typeof privacy === 'string') {
				privacy = parseInt(privacy);
			}
			if (typeof description !== 'string') {
				description = '';
			}
			const repoName = repoTitle.trim().toLowerCase();
			const newExtension = {
				repoTitle,
				repoName,
				owner,
				primary: false,
				privacy,
				description,
				parent: sourceRepo._id,
				featured: false,
				favorites: 0,
				watches: 0,
				ownerName: '',
			};
			newRepo = new repoModel();
			const cloneablePaths = _.pickSchema(repoModel, Utils.nonCloneable);
			const sourceExtension = _.pick(clone(sourceRepo), cloneablePaths);
			newRepo = _.extend(newRepo, sourceExtension);
			newRepo = _.extend(newRepo, newExtension);
			_.each([
				'buildDir',
				'swDir',
				'swHexDir',
				'ipCoresDir',
				'topModuleEntry',
				'created',
				'createdAt',
				'updatedAt'
			], attr => delete newRepo[attr]);
			const sourceRoot = await sourceRepo.getRoot();
			const sourceFolders = await sourceRepo.getEntries({
				handler: EntryType.Folder
			});
			const cloneMap = {};
			const childrenMap = {};
			const idMap = {};
			idMap[sourceRoot._id] = sourceRoot;
			sourceFolders.forEach(function (sourceFolder) {
				idMap[sourceFolder._id] = sourceFolder;
				if (sourceFolder.parent != null) {
					if ((childrenMap[sourceFolder.parent] == null)) {
						childrenMap[sourceFolder.parent] = [];
					}
					return childrenMap[sourceFolder.parent].push(sourceFolder._id);
				}
			});
			sourceFolders.push(sourceRoot);

			let toVisit = [sourceRoot._id];
			const visitOrder = [];
			while (toVisit.length > 0) {
				const currentNode = toVisit.splice(0, 1)[0];
				visitOrder.push(currentNode);
				if (Array.isArray(childrenMap[currentNode])) {
					toVisit = toVisit.concat(childrenMap[currentNode]);
				}
			}
			const sourceEntries = await sourceRepo.getEntries({
				_id: {
					$ne: sourceRoot._id
				},
				handler: {
					$ne: EntryType.Folder
				}
			});
			sourceEntries.forEach(sourceEntry => idMap[sourceEntry._id] = sourceEntry);
			try {
				newRepo = await newRepo.save();
			} catch (err) {
				return reject(handleMongooseError(err));
			}
			repoCreated = true;
			const role = await assignRole({
				repo: newRepo._id,
				user: newRepo.owner,
				accessLevel: AccessLevel.Owner
			});
			const {
				entry: rootEntry
			} = await newRepo.createRoot(sourceRoot._id);
			cloneMap[sourceRoot._id] = rootEntry._id;
			const folderTasks = [];
			visitOrder.splice(0, 1);
			visitOrder.forEach(node => {
				folderTasks.push(() => new Promise(async (resolve, reject) => {
					const folderEntry = idMap[node];
					try {
						const {
							entry: clonedFolder
						} = await newRepo.createFolder({
							parent: cloneMap[folderEntry.parent],
							user: newRepo.owner,
							title: folderEntry.title,
							description: folderEntry.description,
							access: folderEntry.access,
							anchor: folderEntry.anchor,
							source: folderEntry.source
						}, false);
						cloneMap[folderEntry._id] = clonedFolder._id;
						return resolve(clonedFolder);
					} catch (err) {
						return reject(err);
					}
				}))
			});
			const clonedFolders = [];
			for (let i = 0; i < folderTasks.length; i++) {
				clonedFolders.push(await folderTasks[i]());
			}
			const fileTasks = _.map(sourceEntries, sourceEntry => new Promise(async (resolve, reject) => {
				try {
					const extension = {
						repo: newRepo._id,
						user: newRepo.owner,
						parent: cloneMap[sourceEntry.parent],
						remoteParent: sourceEntry._id
					};
					const newEntry = _.extend(_.omit(clone(sourceEntry), Utils.nonCloneable.concat(['repo', 'user', 'parent', 'remoteParent'])), extension);
					const clonedEntry = await createRepoEntry(newEntry, false);
					let duplicatedFile
					try {
						duplicatedFile = await FileManager.duplicateFile(clonedEntry, sourceEntry);
					} catch (err) {
						clonedEntry.remove().then(() => { }).catch(console.error)
						throw err;
					}
					cloneMap[sourceEntry._id] = clonedEntry._id;
					return resolve(clonedEntry);
				} catch (err) {
					return reject(err);
				}
			}));
			const clonedFiles = await Promise.all(fileTasks);
			const updatedRepo = await updateRepo(newRepo, {
				buildDir: cloneMap[sourceRepo.buildDir],
				swDir: (sourceRepo.swDir != null) ? cloneMap[sourceRepo.swDir] : null,
				swHexDir: (sourceRepo.swHexDir != null) ? cloneMap[sourceRepo.swHexDir] : null,
				buildDir: cloneMap[sourceRepo.buildDir],
				ipCoresDir: cloneMap[sourceRepo.ipCoresDir],
				topModuleEntry: cloneMap[sourceRepo.topModuleEntry]
			});
			const refreshedRepo = await updatedRepo.refresh();
			return resolve(refreshedRepo);
		} catch (err) {
			if (repoCreated) {
				deleteRepo(newRepo).then(() => { }).catch(console.error)
			}
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};
const updateRepoWorkspaceSettings = function (repoId, themeIndex, fontSize, cb) {
	const updates = {
		settings: {
			theme: themeIndex,
			fontSize
		}
	};

	return getRepo({
		_id: repoId
	}, function (err, repo) {
		if (err) {
			return cb(err);
		} else if (!repo) {
			return cb({
				erorr: 'Repository does not exist.'
			});
		} else {
			return updateRepo(repo._id, updates, function (err, updatedRepo) {
				if (err) {
					return cb(err);
				} else {
					return cb(null, updatedRepo);
				}
			});
		}
	});
};
const deleteRepo = async (repo, cb) => {
	const ipModel = require("../models/ip").model;
	return new Promise(async (resolve, reject) => {
		try {
			const root = await repo.getRoot();
			if (!root) {
				const deletedRepo = await updateRepo(repo._id, {
					deleted: true
				});
				return resolve(deletedRepo);
			}
			const deletedEntry = await root.deleteEntry(true);
			const deletedRepo = await updateRepo(repo._id, {
				deleted: true
			});
			resolve(deletedRepo);
			const promises = [
				new Promise(async (resolve, reject) => {
					try {
						const roles = await repo.getRoleEntries({});
						Promise.all(_.map(roles, role => removeRole(role._id))).then(() => { }).catch(console.error);
					} catch (err) {
						return reject(err);
					}
				}),
				new Promise(async (resolve, reject) => {
					try {
						const ips = await ipModel.find({
							repo: repo._id,
							deleted: false
						}).exec();
						_.each(ips, (ip) => {
							ip.deleted = true;
							ip.save().exec().catch(console.error);
						})
					} catch (err) {
						return reject(handleMongooseError(err));
					}
				})
			]
			Promise.all(promises).catch(console.error);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);

};


const createRepoEntry = async (entry, overwrite, cb) => {
	const {
		model: entryModel
	} = require("../models/repo_entry");

	if (typeof overwrite === 'function') {
		cb = overwrite;
		overwrite = false;
	}

	return new Promise(async (resolve, reject) => {
		try {
			const repo = await getRepo({
				_id: entry.repo
			});
			if (!repo) {
				return reject({
					error: 'Repository does not exist.'
				});
			}
			const writeable = await repo.isWriteable(entry.user);
			if (!writeable) {
				return reject({
					error: 'Access denied (insufficient permissions).'
				});
			}
			if (entry.parent == null && entry.handler !== EntryType.RepoRoot) {
				return reject({
					error: 'Entry should have a parent.'
				});
			} else {
				const isRoot = (entry.handler === EntryType.RepoRoot);
				if (isRoot && entry.parent != null) {
					return reject({
						error: 'Repository root cannot have a parent item.'
					});
				}
				const entryExists = await getRepoEntry(isRoot ? {
					handler: EntryType.RepoRoot,
					repo: entry.repo
				} : {
						title: entry.title,
						parent: entry.parent
					});
				if (entryExists) {
					if (isRoot) {
						return reject({
							error: 'Only one root entry per repository is allowed.'
						});
					} else if (!overwrite) {
						return reject({
							error: 'An entry with the same name already exists.'
						});
					}
				}
				let newEntry = new entryModel();
				const entryDefaults = {
					access: EntryAccess.ReadWrite,
					source: EntrySource.User,
					synthesize: false,
					anchor: false,
					included: true,
					attributes: ''
				};
				const entryValidPaths = _.pickSchema(entryModel, Utils.nonCloneable);

				newEntry = _.extend(newEntry, _.pick(entry, entryValidPaths));
				newEntry = _.defaults(newEntry, entryDefaults);
				newEntry.handler = _.values(EntryType).includes(entry.handler) ? entry.handler : EntryType.UnkownEntry;
				if (isRoot) {
					const entryExtensions = {
						handler: EntryType.RepoRoot,
						parent: null,
						description: 'Repository Root',
						access: EntryAccess.ReadWrite,
						source: EntrySource.User,
						synthesize: false,
						anchor: true,
						included: true,
						attributes: ''
					};
					newEntry = _.extend(newEntry, entryExtensions);
				}
				try {
					const savedEntry = await newEntry.save();
					return resolve(savedEntry);
				} catch (err) {
					return reject(handleMongooseError(err, 'An error occurred while creating the entry.'));
				}
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoEntry = async (query, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;
	return new Promise(async (resolve, reject) => {
		const dbQuery = mongoose.model('RepoEntry').findOne(query);
		try {
			return resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the entry.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};


//To-Do: Paginate
const getRepoEntries = async (query, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	return new Promise(async (resolve, reject) => {
		const dbQuery = mongoose.model('RepoEntry')
			.find(query)
			.sort(opts.sort || {
				title: 1
			});
		// if (!opts.noLimit) {
		// 	dbQuery.limit(EntriesPerPage)
		// 		.skip(EntriesPerPage * (opts.page || 0));
		// }
		try {
			resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the entries.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb)
};

const formatJstree = function (entries, buildDir, swDir, swHexDir) {
	const results = [];
	for (let entry of Array.from(entries)) {
		const newEntry = {
			id: entry.id,
			parent: entry.parent,
			text: entry.title,
			li_attr: {
				class: ''
			}
		};

		if (entry.id.toString() === buildDir.toString()) {
			newEntry.type = 'buildFolder';
			newEntry.li_attr.class = 'tree-item tree-folder-item';
		} else if ((swDir != null) && (swDir.toString() === entry.id.toString())) {
			newEntry.type = 'swFolder';
			newEntry.li_attr.class = 'tree-item tree-folder-item';
		} else if ((swHexDir != null) && (swHexDir.toString() === entry.id.toString())) {
			newEntry.type = 'swHexFolder';
			newEntry.li_attr.class = 'tree-item tree-folder-item';
		} else {
			var e, entryData;
			if (entry.handlerName === 'unkown') {
				continue;
			}
			newEntry.type = entry.handlerName;
			if (entry.isRoot) {
				newEntry.li_attr.class = 'tree-item tree-root-item';
				newEntry.parent = '#';
				newEntry.state = {
					'opened': true
				};
			} else if (entry.isFolder) {
				newEntry.li_attr.class = 'tree-item tree-folder-item';
				if (!entry.included) {
					newEntry.type = 'exfolder';
				} else {
					newEntry.type = 'folder';
				}
			} else if (entry.handler === EntryType.HEXFile) {
				newEntry.type = 'hex';
				newEntry.li_attr.class = 'tree-item tree-folder-item';
			} else {
				newEntry.li_attr.class = 'tree-item tree-file-item';
			}

			if (entry.handler === EntryType.VerilogFile) {
				if (!entry.included) {
					newEntry.type = 'exverilog';
				} else {
					newEntry.type = 'verilog';
				}
			}
			if (entry.handler === EntryType.HFile) {
				if (!entry.included) {
					newEntry.type = 'exH';
				} else {
					newEntry.type = 'h';
				}
			}
			if (entry.handler === EntryType.CFile) {
				if (!entry.included) {
					newEntry.type = 'exC';
				} else {
					newEntry.type = 'c';
				}
			}
			if (entry.handler === EntryType.IP) {
				if (!entry.included) {
					newEntry.type = 'exip';
				} else {
					newEntry.type = 'ip';
				}
			}
			if (entry.handler === EntryType.LinkerScript) {
				if (entry.data && entry.data.length) {
					try {
						entryData = JSON.parse(entry.data);
						newEntry.data = entryData;
					} catch (error) {
						e = error;
						console.error(e);
					}
				}
			}
			if (entry.handler === EntryType.StartupScript) {
				if (entry.data && entry.data.length) {
					try {
						entryData = JSON.parse(entry.data);
						newEntry.data = entryData;
					} catch (error1) {
						e = error1;
						console.error(e);
					}
				}
			}
			if (entry.state === EntryState.Pending) {
				newEntry.type = `p_${newEntry.type}`;
			} else if (entry.state === EntryState.Failed) {
				newEntry.type = `f_${newEntry.type}`;
			}
		}

		results.push(newEntry);
	}
	return results;
};

const formatDhtmlx = function (entries, root) {
	let file;
	const filesMap = {};
	const parentMap = {};
	let rootEntry = {};

	if (root != null) {
		rootEntry = {
			id: root._id.toString(),
			text: root.title,
			item: [],
			userdata: [{
				name: 'type',
				content: 'folder'
			}]
		};
		filesMap[root._id.toString()] = rootEntry;
	}

	for (let entry of Array.from(entries)) {
		file = {
			id: entry._id.toString(),
			text: entry.title,
			item: []
		};
		if (entry.handler === EntryType.Folder) {
			file.im0 = 'folderClosed.gif';
			file.im1 = 'folderOpen.gif';
			file.im2 = 'folderClosed.gif';
			file.userdata = [{
				name: 'type',
				content: 'folder'
			},
			{
				name: 'handler',
				content: 'folder'
			}
			];
		} else if (entry.handler === EntryType.RepoRoot) {
			file.im0 = 'folderClosed.gif';
			file.im1 = 'folderOpen.gif';
			file.im2 = 'folderClosed.gif';
			file.open = '1';
			file.userdata = [{
				name: 'type',
				content: 'folder'
			},
			{
				name: 'handler',
				content: 'root'
			}
			];
		} else {
			file.im0 = 'leaf.gif';
			file.im1 = 'leaf.gif';
			file.im2 = 'leaf.gif';
			file.userdata = [{
				name: 'type',
				content: 'file'
			}];
			if (entry.handler === EntryType.TextFile) {
				file.userdata.push({
					name: 'handler',
					content: 'text'
				});

			} else if (entry.handler === EntryType.VerilogFile) {
				file.userdata.push({
					name: 'handler',
					content: 'verilog'
				});
			} else if (entry.handler === EntryType.IP) {
				file.userdata.push({
					name: 'handler',
					content: 'ip'
				});

			} else if (entry.handler === EntryType.TestbenchFile) {
				file.userdata.push({
					name: 'handler',
					content: 'testbench'
				});

			} else if (entry.handler === EntryType.NetlistFile) {
				file.userdata.push({
					name: 'handler',
					content: 'netlist'
				});

			} else if (entry.handler === EntryType.STA) {
				file.userdata.push({
					name: 'handler',
					content: 'sta'
				});
			} else if (entry.handler === EntryType.SynthesisReport) {
				file.userdata.push({
					name: 'handler',
					content: 'srpt'
				});

			} else if (entry.handler === EntryType.ImageFile) {
				file.userdata.push({
					name: 'handler',
					content: 'image'
				});

			} else if (entry.handler === EntryType.BinaryFile) {
				file.userdata.push({
					name: 'handler',
					content: 'binary'
				});

			} else if (entry.handler === EntryType.FSM) {
				file.userdata.push({
					name: 'handler',
					content: 'fsm'
				});
			} else if (entry.handler === EntryType.VCDFile) {
				file.userdata.push({
					name: 'handler',
					content: 'vcd'
				});
			} else {
				file.userdata.push({
					name: 'handler',
					content: 'unknown'
				});
			}
		}

		filesMap[entry._id.toString()] = file;
		if (entry.parent != null) {
			parentMap[entry._id.toString()] = entry.parent.toString();
		}
		if (entry.handler === EntryType.RepoRoot) {
			rootEntry = file;
		}
	}

	for (let fileId in filesMap) {
		file = filesMap[fileId];
		if ((file !== rootEntry) && (!root || (fileId !== rootEntry._id))) {
			filesMap[parentMap[fileId]].item.push(file);
		}
	}

	return rootEntry;
};

const getRepoStructureByType = async (repoId, query, format = 'jstree', cb) => {
	if (typeof format === 'function') {
		cb = format;
		format = 'jstree';
	}
	return new Promise(async (resolve, reject) => {
		try {
			query = format === 'jstree' ? _.defaults({
				repo: repoId
			}, query) : {
					repo: repoId,
					$or: [{
						handler: EntryType.Folder
					},
					{
						handler: EntryType.RepoRoot
					},
						query
					]
				};
			const entries = await getRepoEntries(query);
			if (format === 'json') {
				return resolve(entris);
			} else if (format === 'dhtmlx') {
				return resolve(formatDhtmlx(entries));
			} else if (format === 'jstree') {
				const results = [];
				for (let entry of entries) {
					const toPush = {
						id: entry.id,
						text: entry.title
					};
					if (entry.data) {
						if (typeof entry.data === 'object') {
							toPush.data = entry.data;
						} else if (typeof entry.data === 'string') {
							try {
								const parsedData = JSON.parse(entry.data);
								toPush.data = parsedData;
							} catch (e) {
								console.error(e);
							}
						}
					}
					results.push(toPush);
				}
				return resolve(results);
			} else {
				return reject({
					error: `Invalid format ${format}`
				});
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

const getRepoFileStructure = async (repoId, cb, format = 'jstree') => {
	return new Promise(async (resolve, reject) => {
		try {
			repoId = getMongooseId(repoId)
			const repo = await getRepo({
				_id: repoId
			});
			if (!repo) {
				return reject({
					erorr: 'Repository does not exist.'
				})
			}
			const entries = await getRepoEntries({
				repo: repoId
			});
			if (format === 'dhtmlx') {
				return resolve(formatDhtmlx(entries));
			} else if (!repo.buildDir) {
				return reject({
					error: 'Corrupted repository, missing build directory.'
				});
			} else {
				return resolve(formatJstree(entries, repo.buildDir, repo.swDir, repo.swHexDir));
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoFolderStructure = async (repoId, cb, forma = 'dhtmlx') => {
	return new Promise(async (resolve, reject) => {
		try {
			const entries = await getRepoEntries({
				repo: repoId,
				$or: [{
					handler: EntryType.Folder
				},
				{
					handler: EntryType.RepoRoot
				}
				]
			});
			return resolve(formatDhtmlx(entries))
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoVerilogStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.VerilogFile,
		synthesize: true
	}, format, cb);
};

const getRepoTestbenchStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.TestbenchFile
	}, format, cb);
};

const getRepoPCFStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.PCFFile
	}, format, cb);
};

const getRepoLinkerStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.LinkerScript
	}, format, cb);
};

const getRepoStartupStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.StartupScript
	}, format, cb);
};

const getRepoDCFStructure = (repoId, cb, format) => {
	const FileManager = require("./file_manager");
	return new Promise(async (resolve, reject) => {
		try {
			const files = await getRepoStructureByType(repoId, {
				handler: EntryType.DCFFile
			}, format);
			const promises = _.map(files, file => new Promise(async (resolve, reject) => {
				try {
					const content = await FileManager.getFileContent({
						_id: file.id
					});
					let parsedContent = undefined;
					try {
						parsedContent = JSON.parse(content);
					} catch (e) {
						console.error(e);
						return resolve(null);
					}
					file.stdcell = parsedContent.stdcell;
					return resolve(file);
				} catch (err) {
					return reject(err);
				}
			}));
			const filteredFiles = await Promise.all(promises);
			return resolve(_.filter(filteredFiles));
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

const getRepoNetlistStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.NetlistFile
	}, format, cb);
};

const getRepoSimulationStructure = function (repoId, format, cb) {
	if (format == null) {
		format = 'jstree';
	}
	return getRepoStructureByType(repoId, {
		handler: EntryType.VCDFile
	}, format, cb);
};

const updateUserRole = async (repoId, userId, level, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			const role = await getRepoRoleEntry({
				repo: repoId,
				user: userId
			});
			if (!role) {
				return reject({
					error: "Cannot find user role."
				});
			}
			const updatedRole = await updateRole(role._id, {
				accessLevel: level
			});
			return resolve(updatedRole);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

const assignRole = function (role, cb) {
	return new Promise(async (resolve, reject) => {
		const newRole = new accessModel(role);
		try {
			const createdRole = await newRole.save();
			return resolve(createdRole);
		} catch (err) {
			return reject(handleMongooseError(err, 'An error occurred while assigning the user role.'));
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoRoleEntry = async (query, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	const roleModel = mongoose.model('RepoAccess');
	query.deleted = false;
	return new Promise(async (resolve, reject) => {
		const dbQuery = roleModel.findOne(query);
		try {
			return resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieve repository permissions.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoRoleEntries = async (query, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	const roleModel = mongoose.model('RepoAccess');
	query.deleted = false;
	return new Promise((resolve, reject) => {
		const dbQuery = roleModel.find(query);
		if (!opts.noLimit) {
			if (!opts.noLimit) {
				dbQuery.limit(ReposPerPage)
					.skip(ReposPerPage * (opts.page || 0));
			}
		}
		return dbQuery.exec().then(resolve).catch(err => {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieve repository permissions.'
			});
		})
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoRole = async (repoId, userId, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			const role = await getRepoRoleEntry({
				repo: repoId,
				user: userId
			});
			if (!role) {
				const repo = await getRepo({
					_id: repoId
				});
				if (!repo) {
					return reject({
						error: 'Repository does not exist.'
					});
				} else if (repo.privacy === PrivacyType.Public) {
					return resolve(AccessLevel.ReadOnly);
				} else {
					return resolve(AccessLevel.NoAccess);
				}
			}
			return resolve(role.accessLevel);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

const getRepoRoles = function (repoId, cb) {
	const User = require("./user");
	return getRepoRoleEntries({
		repo: repoId
	},
		function (err, roles) {
			if (err) {
				console.error(err);
				return cb({
					error: 'An error occurred while retrieving the user roles.'
				});
			} else {
				const users = [];
				return async.each(roles,
					((role, callback) =>
						User.getUser({
							'_id': role.user
						},
							function (usrErr, user) {
								if (usrErr) {
									return callback(usrErr);
								} else {
									users.push({
										_id: user._id,
										username: user.username,
										level: role.accessLevel
									});
									return callback();
								}
							})
					),
					function (asyncErr) {
						if (asyncErr) {
							return cb(asyncErr);
						} else {
							return cb(null, users);
						}
					});
			}
		});
};

const updateRole = async (roleId, updates, cb) => {
	return new Promise(async (resolve, reject) => {
		try {
			const role = await getRepoRoleEntry({
				_id: roleId
			});
			if (!role) {
				return reject({
					error: 'Cannot find targeted role.'
				});
			}
			if (updates.accessLevel != null) {
				let needle;
				if (!_.values(AccessLevel).includes(updates.accessLevel)) {
					return reject({
						error: 'Invalid role'
					});
				}
				role.accessLevel = updates.accessLevel;
			}
			if (updates.deleted != null && updates.deleted) {
				role.deleted = true;
			}
			try {
				return resolve(await role.save());
			} catch (err) {
				return reject(handleMongooseError(err, 'An error occurred while updating the permissions.'))
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

const removeRole = (roleId, cb) => updateRole(roleId, {
	deleted: true
}, cb);

const getRepo = async function (query, opts = {}, cb) {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	if (query.repoTitle != null) {
		if ((query.repoName == null)) {
			query.repoName = query.repoTitle;
		}
		query.repoTitle = query.repoTitle.trim();
	}
	if (query.repoName != null) {
		query.repoName = query.repoName.trim().toLowerCase();
	}

	return new Promise(async (resolve, reject) => {
		const dbQuery = mongoose.model('Repo')
			.findOne(query)
			.sort(opts.sort || {
				created: -1
			});
		try {
			return resolve(await dbQuery.exec());
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the repository.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

//To-Do: Paginate
const getRepos = async (query, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	if (query.repoTitle != null) {
		if (query.repoName == null) {
			query.repoName = query.repoTitle;
		}
		query.repoTitle = query.repoTitle.trim();
	}
	if (query.repoName != null) {
		query.repoName = query.repoName.trim().toLowerCase();
	}

	return new Promise(async (resolve, reject) => {
		const dbQuery = mongoose.model('Repo')
			.find(query)
			.sort(opts.sort || {
				created: -1
			});
		if (!opts.noLimit) {
			dbQuery.limit(ReposPerPage)
				.skip(ReposPerPage * (opts.page || 0));
		}
		try {
			resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the repositories.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

//To-Do: Paginate.
const getSharedRepos = async (userId, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	return getUserSharedRepos(userId, userId, opts, cb);
}
const getUserSharedRepos = async (viewerId, userId, opts = {}, cb) => {
	const roleModel = mongoose.model('RepoAccess');
	return new Promise(async (resolve, reject) => {
		try {
			if (userId == null) {
				return resolve([]);
			}
			const stages = [{
				$match: {
					user: userId,
					accessLevel: {
						$ne: AccessLevel.Owner
					},
					deleted: false
				}
			}, {
				$lookup: {
					from: 'repos',
					localField: 'repo',
					foreignField: '_id',
					as: 'repository'
				}
			}, {
				$unwind: {
					path: '$repository'
				}
			}, {
				$replaceRoot: {
					newRoot: '$repository'
				}
			}, {
				$match: {
					deleted: false
				}
			}, ...getRepoAccessPipeline(viewerId)];
			stages.push({
				$sort: opts.sort || {
					createdAt: -1
				}
			})
			if (opts.pagination) {
				stages.push({
					$group: {
						_id: null,
						count: {
							$sum: 1
						}
					}
				})
			} else if (!opts.noLimit) {
				stages.push(getPaginationFacet(opts.page, ReposPerPage));
			}
			try {
				const {
					'0': {
						repositories,
						pageInfo: {
							'0': pageInfo
						}
					}
				} = await roleModel.aggregate(stages);
				return resolve({
					repositories,
					pageInfo: pageInfo || {
						count: 0,
						pageSize: ReposPerPage,
						pageCount: 0
					}
				});
			} catch (err) {
				return reject(handleMongooseError(err, 'Failed to get shared repositories'))
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};


const getWatchingRepos = async (userId, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	return getUserWatchingRepos(userId, userId, opts, cb);
}
const getUserWatchingRepos = async (viewerId, userId, opts = {}, cb) => {
	const watchModel = mongoose.model('Watch');
	return new Promise(async (resolve, reject) => {
		try {
			if (userId == null) {
				return resolve([]);
			}
			const stages = [{
				$match: {
					user: userId,
					deleted: false
				}
			}, {
				$lookup: {
					from: 'repos',
					localField: 'repo',
					foreignField: '_id',
					as: 'repository'
				}
			}, {
				$unwind: {
					path: '$repository'
				}
			}, {
				$replaceRoot: {
					newRoot: '$repository'
				}
			}, {
				$match: {
					deleted: false
				}
			}, ...getRepoAccessPipeline(viewerId)];
			stages.push({
				$sort: opts.sort || {
					createdAt: -1
				}
			})
			if (opts.pagination) {
				stages.push({
					$group: {
						_id: null,
						count: {
							$sum: 1
						}
					}
				})
			} else if (!opts.noLimit) {
				stages.push(getPaginationFacet(opts.page, ReposPerPage));
			}
			try {
				const {
					'0': {
						repositories,
						pageInfo: {
							'0': pageInfo
						}
					}
				} = await watchModel.aggregate(stages);
				return resolve({
					repositories,
					pageInfo: pageInfo || {
						count: 0,
						pageSize: ReposPerPage,
						pageCount: 0
					}
				});
			} catch (err) {
				return reject(handleMongooseError(err, 'Failed to get shared repositories'))
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getAccessibleRepos = async (query, userId, opts = {}, cb) => {
	const repoModel = mongoose.model('Repo');
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	return new Promise(async (resolve, reject) => {
		if (userId == null) {
			query.privacy = PrivacyType.Public;
		}

		const stages = [{
			$match: query
		}, ...getRepoAccessPipeline(userId)];
		stages.push({
			$sort: opts.sort || {
				createdAt: -1
			}
		})
		if (opts.pagination) {
			stages.push({
				$group: {
					_id: null,
					count: {
						$sum: 1
					}
				}
			})
		} else if (!opts.noLimit) {
			stages.push(getPaginationFacet(opts.page, ReposPerPage, 'repositories', opts.limit));
		}

		try {
			try {
				const {
					'0': {
						repositories,
						pageInfo: {
							'0': pageInfo
						}
					}
				} = await repoModel.aggregate(stages);
				return resolve({
					repositories,
					pageInfo: pageInfo || {
						count: 0,
						pageSize: ReposPerPage,
						pageCount: 0
					}
				});
			} catch (err) {
				return reject(handleMongooseError(err, 'An error occurred while retrieving the repositories.'));
			}
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the repositories.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

//---------
const updateRepo = async (repoId, updates, cb) => {
	return new Promise(async (resolve, reject) => {
		repoId = getMongooseId(repoId)
		try {
			let repo = await getRepo({
				_id: repoId
			});
			if (!repo) {
				return reject({
					error: 'Cannot find targeted repository.'
				});
			}
			const validPaths = _.pickSchema(require("../models/repo").model, Utils.nonCloneable);
			updates = _.pick(updates, validPaths);
			repo = _.extend(repo, updates);
			if ((updates.settings != null) && (typeof updates.settings === 'object')) {
				repo.settings = repo.settings || {};
				if (updates.settings.theme != null) {
					repo.settings.theme = updates.settings.theme;
				}
				if (updates.settings.fontSize != null) {
					repo.settings.fontSize = updates.settings.fontSize;
				}
			}
			let updatedRepo
			try {
				updatedRepo = await repo.save();
			} catch (err) {
				return reject(handleMongooseError(err, 'An error occurred while updating/deleting the repository.'))
			}
			if (!updatedRepo.deleted) {
				await updatedRepo.refresh();
			}
			return resolve(updatedRepo);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}


const updateRepoEntry = async (entryId, updates, cb) => {
	return new Promise(async (resolve, reject) => {
		entryId = getMongooseId(entryId);
		try {
			let entry = await getRepoEntry({
				_id: entryId
			});
			if (!entry) {
				return reject({
					error: 'Cannot find targeted entry.'
				});
			}
			const validPaths = _.pickSchema(require("../models/repo_entry").model, Utils.nonCloneable);
			updates = _.pick(updates, validPaths);
			entry = _.extend(entry, updates);
			let savedEntry;
			try {
				savedEntry = await entry.save();
			} catch (err) {
				return reject(handleMongooseError(err, 'An error occurred while updating/deleting the repository'))
			}
			return resolve(savedEntry);
		} catch (err) {
			return reject(err);
		}

	}).then(wrapResolveCallback(cb)).catch(cb);
}

const accessRepo = async (ownerName, repoName, userId, next, cb) => {
	const User = require("./user");
	return new Promise(async (resolve, reject) => {
		try {
			const user = await User.getUser({
				username: ownerName
			});
			if (!user) {
				return next();
			}
			const repository = await getRepo({
				owner: user._id,
				repoName
			});
			if (!repository) {
				return next();
			}
			const accessLevel = await getRepoRole(repository._id, userId);
			if (accessLevel < AccessLevel.ReadOnly) {
				return next();
			} else {
				return resolve({
					repository,
					accessLevel
				});
			}
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
	return User.getUser({
		username: ownerName
	},
		function (err, user) {
			if (err) {
				return cb(err);
			} else if (!user) {
				return next();
			} else {
				return getRepo({
					owner: user._id,
					repoName
				}, function (err, repo) {
					if (err) {
						return cb(err);
					} else if (!repo) {
						return next();
					} else {
						return getRepoRole(repo._id, userId, function (err, role) {
							if (err) {
								cb(err);
							}
							if (role < AccessLevel.ReadOnly) {
								return next();
							} else {
								return cb(null, repo, role);
							}
						});
					}
				});
			}
		});
};

const deleteRepoEntry = async (entryId, cb) => {
	const FileManager = require("./file_manager");
	return new Promise(async (resolve, reject) => {
		entryId = getMongooseId(entryId);
		try {
			const entry = await getRepoEntry({
				_id: entryId
			});
			const children = await entry.getChildren({});
			const promises = _.map(children, (child) => new Promise(async (resolve, reject) => {
				try {
					const deletedEntry = await deleteRepoEntry(child._id);
					const deletedFileEntry = await FileManager.clearFileEntry(deletedEntry);
					return resolve();
				} catch (err) {
					return reject(err);
				}
			}));
			await Promise.all(promises);
			const deletedEntry = await updateRepoEntry(entryId, {
				deleted: true
			});
			const deletedFileEntry = await FileManager.clearFileEntry(deletedEntry);
			return resolve(deletedFileEntry);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const updateEntryContent = function (entryId, content, cb) {
	const FileManager = require("./file_manager");
	return getRepoEntry({
		_id: entryId
	},
		function (err, entry) {
			if (err) {
				return cb(err);
			} else {
				return FileManager.updateFile(entry, content, function (err, fileEntry) {
					if (err) {
						return cb(err);
					} else {
						return cb(null, entry);
					}
				});
			}
		});
};

const updateEntryAttributes = (entryId, content, cb) => updateRepoEntry(entryId, {
	attributes: content
}, cb);

const updateEntryData = (entryId, content, cb) => updateRepoEntry(entryId, {
	data: content
}, cb);

const cleanupRepoEntries = function (query, cb) {
	if (query == null) {
		query = {};
	}
	query.deleted = true;
	const repoEntryModel = mongoose.model('RepoEntry');
	const repoFileModel = mongoose.model('RepoFile');

	return repoEntryModel.find(query, function (err, entries) {
		if (err) {
			return cb(err);
		} else {
			entries.forEach(function (entry) {
				repoFileModel.find({
					repoEntry: entry._id
				}, function (err, files) {
					if (err) {
						return console.error(err);
					} else {
						return files.forEach(file => FileManager.clearFile(file.fsId, function (err) {
							if (err) {
								return console.error(err);
							}
						}));
					}
				});
				return repoFileModel.remove({
					repoEntry: entry._id
				}, function (err) {
					if (err) {
						return console.error(err);
					}
				});
			});
			return repoEntryModel.remove(query, cb);
		}
	});
};

const cleanupRepos = function (query, cb) {
	if (query == null) {
		query = {};
	}
	query.deleted = true;
	const repoModel = mongoose.model('Repo');
	const repoAccessModel = mongoose.model('RepoAccess');
	return repoModel.find(query, function (err, repos) {
		if (err) {
			return cb(err);
		} else {
			repos.forEach(function (repo) {
				cleanupRepoEntries({
					repo: repo._id
				}, function (err) {
					if (err) {
						return console.error(err);
					}
				});
				return repoAccessModel.remove({
					repo: repo._id
				}, function (err) {
					if (err) {
						return console.error(err);
					}
				});
			});
			return repoModel.remove(query, cb);
		}
	});
};

const getRepoContributors = async (repo, cb) => {
	const User = require("./user");
	return new Promise(async (resolve, reject) => {
		try {
			const roles = await getRepoRoleEntries({
				repo: repo._id
			});
			const promises = _.map(roles, ({
				_id,
				accessLevel,
				createdAt,
				updatedAt,
				user: userId
			}) => new Promise(async (resolve, reject) => {
				try {
					const user = (await User.getUser({
						_id: userId
					})).toJSON();
					let role = '';
					if (accessLevel === AccessLevel.Owner) {
						role = 'Owner';
					} else if (accessLevel === AccessLevel.NoAccess) {
						role = 'NoAccess';
					} else if (accessLevel === AccessLevel.ReadOnly) {
						role = 'ReadOnly';
					} else if (accessLevel === AccessLevel.ReadWrite) {
						role = 'ReadWrite';
					} else {
						return resolve(null);
					}
					delete user.password;
					return resolve({
						_id,
						accessLevel,
						createdAt,
						updatedAt,
						user,
						role
					});
				} catch (err) {
					return reject(err);
				}
			}));
			const contributors = _.filter(await Promise.all(promises));
			return resolve(contributors)
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const refreshRepo = async (repoId, cb) => {
	const User = require("./user");
	return new Promise(async (resolve, reject) => {
		try {
			const repo = await getRepo({
				_id: repoId
			});
			if (!repo) {
				return reject({
					error: 'Repository does not exist.'
				});
			}
			const owner = await User.getUser({
				_id: repo.owner
			});
			if (!owner) {
				return reject({
					error: 'Cannot find repository owner.'
				});
			}
			repo.ownerName = owner.username;
			let updatedRepo;
			let count;
			try {
				updatedRepo = await repo.save();
				count = await getRepoFavoriteCount(updatedRepo);
				updatedRepo.favorites = count;
				updatedRepo = await updatedRepo.save();
				count = await getRepoWatchCount(updatedRepo);
				updatedRepo.watches = count;
				updatedRepo = await updatedRepo.save();
			} catch (err) {
				console.error(err);
				return reject({
					error: 'An error occurred while updating the repository.'
				});
			}
			return resolve(updatedRepo);
		} catch (err) {
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
	return getRepo({
		_id: repoId
	}, function (err, repo) {
		if (err) {
			return cb(err);
		} else if (!repo) {
			return cb({
				error: 'Repository does not exist.'
			});
		} else {
			// TODO: PARALLELIZE
			return User.getUser({
				_id: repo.owner
			}, function (err, owner) {
				if (err) {
					return cb(err);
				} else if (!owner) {
					return cb({
						error: 'Cannot find repository owner.'
					});
				} else {
					repo.ownerName = owner.username;
					return repo.save(function (err, updatedRepo) {
						if (err) {
							console.error(err);
							return cb({
								error: 'An error occurred while updating the repository.'
							});
						} else {
							return getRepoFavoriteCount(updatedRepo, function (err, count) {
								if (err) {
									return cb(err);
								} else {
									updatedRepo.favorites = count;
									return updatedRepo.save(function (err, updatedRepo) {
										if (err) {
											console.error(err);
											return cb({
												error: 'An error occurred while updating the repository.'
											});
										} else {
											return getRepoWatchCount(updatedRepo, function (err, count) {
												if (err) {
													console.error(err);
													return cb({
														error: 'An error occurred while updating the repository.'
													});
												} else {
													updatedRepo.watches = count;
													return updatedRepo.save(function (err, updatedRepo) {
														if (err) {
															console.error(err);
															return cb({
																error: 'An error occurred while updating the repository.'
															});
														} else {
															return cb(null, updatedRepo);
														}
													});
												}
											});
										}
									});
								}
							});
						}
					});
				}
			});
		}
	});
};

const refreshAllRepos = cb =>
	getRepos({}, {
		noLimit: true
	}, function (err, repos) {
		if (err) {
			return cb(err);
		} else {
			return repos.forEach(repo => repo.refresh(function (err) {
				if (err) {
					return console.error(err);
				}
			}));
		}
	});

const search = function (query, userId, opts = {}, cb) {
	const escapeStringRegexp = require("escape-regex-string");
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (!query.length) {
		return new Promise(async (resolve, reject) => {
			return resolve({
				repositories: [],
				pageInfo: {
					count: 0,
					pageSize: ReposPerPage,
					pageCount: 0
				}
			});
		}).then(wrapResolveCallback(cb)).catch(cb);
	}
	const dbQuery = {
		$or: [{
			repoTitle: {
				$regex: escapeStringRegexp(query),
				$options: 'i'
			}
		},
		{
			description: {
				$regex: escapeStringRegexp(query),
				$options: 'i'
			}
		}
		],
		deleted: false
	};
	if (opts.featured) {
		dbQuery.featured = true;
	}
	opts.sort = {
		featured: -1
	};
	delete opts.featured;
	return getAccessibleRepos(dbQuery, userId, opts, cb);
};

const isRepoFavoritedFrom = async (repo, userId, cb) => {
	return new Promise(async (resolve, reject) => {
		if (userId == null) {
			return resolve(false);
		}
		const query = {
			deleted: false,
			repo: repo._id,
			user: userId
		};
		try {
			const dbQuery = mongoose.model('Favorite').countDocuments(query);
			const count = await dbQuery.exec();
			return resolve(!!count);
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the favorites.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const isRepoWatchedFrom = async (repo, userId, cb) => {
	return new Promise(async (resolve, reject) => {
		if (userId == null) {
			return resolve(false);
		}
		const query = {
			deleted: false,
			repo: repo._id,
			user: userId
		};
		try {
			const dbQuery = mongoose.model('Watch').countDocuments(query);
			const count = await dbQuery.exec();
			return resolve(!!count);
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the watch list.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
}

const getRepoFavoriteCount = async (repo, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	return new Promise(async (resolve, reject) => {
		const repoId = getMongooseId(repo);
		const query = {
			deleted: false,
			repo: repoId
		};
		const dbQuery = mongoose.model('Favorite')
			.countDocuments(query);
		try {
			return resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the favorites.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoFavorites = function (repo, cb) {
	const query = {
		deleted: false,
		repo: repo._id
	};
	return mongoose.model('Favorite').find(query).sort({
		created: -1
	}).exec(function (err, favs) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving the favorites.'
			});
		} else {
			return async.each(favs, ((fav, callback) =>
				fav.getUser(function (err, user) {
					if (err) {
						return callback(err);
					} else {
						fav.username = user.username;
						return callback();
					}
				})),
				function (err) {
					if (err) {
						return cb(err);
					} else {
						return cb(null, favs);
					}
				});
		}
	});
};

const getRepoWatchCount = async (repo, opts = {}, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	return new Promise(async (resolve, reject) => {
		const repoId = getMongooseId(repo);
		const query = {
			deleted: false,
			repo: repoId
		};
		const dbQuery = mongoose.model('Watch')
			.countDocuments(query);
		try {
			return resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the watch list.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getRepoWatches = function (repo, cb) {
	const query = {
		deleted: false,
		repo: repo._id
	};
	return mongoose.model('Watch').find(query).sort({
		created: -1
	}).exec(function (err, watches) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving the watch list.'
			});
		} else {
			return async.each(watches, ((watch, callback) =>
				watch.getUser(function (err, user) {
					if (err) {
						return callback(err);
					} else {
						watch.username = user.username;
						return callback();
					}
				})),
				function (err) {
					if (err) {
						return cb(err);
					} else {
						return cb(null, watches);
					}
				});
		}
	});
};

const favoriteRepo = async (repoId, userId, cb) => {
	const favModel = mongoose.model('Favorite');
	repoId = getMongooseId(repoId);
	return new Promise(async (resolve, reject) => {
		try {
			const repo = await getRepo({
				_id: repoId
			});
			if (!repo) {
				return reject({
					error: 'Repository not found'
				});
			}
			let fav = await favModel.findOne({
				deleted: false,
				repo: repo._id,
				user: userId
			}).exec();
			let isNew = false;
			if (fav) {
				await fav.remove();
			} else {
				isNew = true;
				fav = new favModel({
					user: userId,
					repo: repoId
				});
				fav = await fav.save();
			}
			await repo.refresh();
			const count = await getRepoFavoriteCount(repo);
			return resolve({
				count,
				favorited: isNew
			});
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while completing the operation.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);

};

const watchRepo = async (repoId, userId, cb) => {
	const watchModel = mongoose.model('Watch');
	repoId = getMongooseId(repoId);
	return new Promise(async (resolve, reject) => {
		try {
			const repo = await getRepo({
				_id: repoId
			});
			if (!repo) {
				return reject({
					error: 'Repository not found'
				});
			}
			let watch = await watchModel.findOne({
				deleted: false,
				repo: repo._id,
				user: userId
			}).exec();
			let isNew = false;
			if (watch) {
				await watch.remove();
			} else {
				isNew = true;
				watch = new watchModel({
					user: userId,
					repo: repoId
				});
				watch = await watch.save();
			}
			await repo.refresh();
			const count = await getRepoWatchCount(repo);
			return resolve({
				count,
				watched: isNew
			});
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while completing the operation.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const getTopRepos = function (limit, cb) {
	let query = {
		deleted: false,
		privacy: PrivacyType.Public,
		primary: true,
		featured: true
	};
	return mongoose.model('Repo').find(query).sort({
		favorites: -1
	}).limit(limit).exec(function (err, featuredRepos) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving repositories.'
			});
		} else {
			query = {
				deleted: false,
				privacy: PrivacyType.Public,
				primary: true,
				$or: [{
					featured: false
				},
				{
					featured: {
						$exists: false
					}
				}
				]
			};
			const newLimit = limit - featuredRepos.length;
			return mongoose.model('Repo').find(query).sort({
				favorites: -1
			}).limit(newLimit).exec(function (err, unfeaturedRepos) {
				if (err) {
					console.error(err);
					return cb({
						error: 'An error occurred while retrieving repositories.'
					});
				} else {

					return cb(null, featuredRepos.concat(unfeaturedRepos));
				}
			});
		}
	});
};

const getLatestRepos = function (limit, cb) {
	let query = {
		deleted: false,
		privacy: PrivacyType.Public,
		primary: true,
		featured: true
	};
	return mongoose.model('Repo').find(query).sort({
		created: -1
	}).limit(limit).exec(function (err, featuredRepos) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving repositories.'
			});
		} else {
			query = {
				deleted: false,
				privacy: PrivacyType.Public,
				primary: true,
				$or: [{
					featured: false
				},
				{
					featured: {
						$exists: false
					}
				}
				]
			};
			const newLimit = limit - featuredRepos.length;
			return mongoose.model('Repo').find(query).sort({
				created: -1
			}).limit(newLimit).exec(function (err, unfeaturedRepos) {
				if (err) {
					console.error(err);
					return cb({
						error: 'An error occurred while retrieving repositories.'
					});
				} else {
					return cb(null, featuredRepos.concat(unfeaturedRepos));
				}
			});
		}
	});
};

const getTrendingRepos = function (limit, cb) {
	let query = {
		_id: {
			$gt: ObjectId.createFromTime((Date.now() * 1000) - (24 * 60 * 60))
		},
		deleted: false,
		privacy: PrivacyType.Public,
		primary: true,
		featured: true
	};
	return mongoose.model('Repo').find(query).sort({
		favorites: -1,
		created: -1
	}).limit(limit).exec(function (err, featuredRepos) {
		if (err) {
			console.error(err);
			return cb({
				error: 'An error occurred while retrieving repositories.'
			});
		} else {
			query = {
				_id: {
					$gt: ObjectId.createFromTime((Date.now() * 1000) - (24 * 60 * 60))
				},
				deleted: false,
				privacy: PrivacyType.Public,
				primary: true,
				$or: [{
					featured: false
				},
				{
					featured: {
						$exists: false
					}
				}
				]
			};
			const newLimit = limit - featuredRepos.length;
			return mongoose.model('Repo').find(query).sort({
				favorites: -1,
				created: -1
			}).limit(limit).exec(function (err, unfeaturedRepos) {
				if (err) {
					console.error(err);
					return cb({
						error: 'An error occurred while retrieving repositories.'
					});
				} else {
					return cb(null, featuredRepos.concat(unfeaturedRepos));
				}
			});
		}
	});
};

const countRepos = function (query, cb) {
	if (typeof query !== 'object') {
		return cb({
			error: 'Invalid query.'
		});
	}

	query.deleted = false;
	return new Promise(async (resolve, reject) => {
		try {
			return resolve(await mongoose.model('Repo').countDocuments(query))
		} catch (err) {
			return reject(handleMongooseError(err, 'An error occurred while retrieving the count'))
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const countRepoEntries = function (query, cb) {
	if (typeof query !== 'object') {
		return cb({
			error: 'Invalid query.'
		});
	}

	query.deleted = false;
	return new Promise(async (resolve, reject) => {
		try {
			return resolve(await mongoose.model('RepoEntry').countDocuments(query));
		} catch (err) {
			return reject(handleMongooseError(err, 'An error occurred while retrieving the count'))
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const publishRepoIP = function (repo, ip, cb) {
	const ipModel = require("../models/ip").model;
	return repo.getIP(function (err, existingIp) {
		let data, input, output, version;
		if (err) {
			return cb(err);
		} else if (!existingIp) {
			data = {};
			let newIp = new ipModel();
			const validPaths = _.pickSchema(ipModel, Utils.nonCloneable.concat(['inputs', 'outputs']));
			const extension = _.pick(ip, validPaths);
			newIp = _.extend(newIp, extension);
			newIp.title = newIp.title.trim();

			version = parseInt(ip.version);
			if (isNaN(version)) {
				newIp.version = 0;
			} else {
				newIp.version = version;
			}

			if (typeof ip.inputs === 'string') {
				newIp.inputs = ip.inputs.split(/\s*,\s*/gmi);
			} else if (Array.isArray(ip.inputs)) {
				newIp.inputs = [];
				for (input of Array.from(ip.inputs)) {
					if (typeof input !== 'string') {
						return cb({
							error: 'Invalid input parameter.'
						});
					} else if (!/^\w+$/gmi.test(input)) {
						return cb({
							error: `Invalid input parameter ${input}.`
						});
					} else {
						newIp.inputs.push(input);
					}
				}
			} else {
				return cb({
					error: 'Invalid input parameters.'
				});
			}

			if (typeof ip.outputs === 'string') {
				newIp.outputs = ip.outputs.split(/\s*,\s*/gmi);
			} else if (Array.isArray(ip.outputs)) {
				newIp.outputs = [];
				for (output of Array.from(ip.outputs)) {
					if (typeof output !== 'string') {
						return cb({
							error: 'Invalid output parameters.'
						});
					} else if (!/^\w+$/gmi.test(output)) {
						return cb({
							error: `Invalid output parameter ${output}.`
						});
					} else {
						newIp.outputs.push(output);
					}
				}
			} else {
				return cb({
					error: 'Invalid output parameter.'
				});
			}
			newIp.data = JSON.stringify(data);
			newIp.price = ip.price;
			//newIp.category = TODO
			//newIp.licenseType = TODO
			//newIp.visible = TODO
			return newIp.save(function (err, savedIp) {
				if (err) {
					console.error(err);
					return cb({
						error: 'Failed to publish the IP.'
					});
				} else {
					return cb(null, savedIp);
				}
			});
		} else {
			({
				data
			} = existingIp);
			let updated = false;

			if ((ip.inputs != null) && ((typeof ip.inputs === 'string') || Array.isArray(ip.inputs))) {
				updated = true;
				if (typeof ip.inputs === 'string') {
					existingIp.inputs = ip.inputs.split(/\s*,\s*/gmi);
				} else if (Array.isArray(ip.inputs)) {
					existingIp.inputs = [];
					for (input of Array.from(ip.inputs)) {
						if (typeof input !== 'string') {
							return cb({
								error: 'Invalid input parameter.'
							});
						} else if (!/^\w+$/gmi.test(input)) {
							return cb({
								error: `Invalid input parameter ${input}.`
							});
						} else {
							existingIp.inputs.push(input);
						}
					}
				} else {
					return cb({
						error: 'Invalid input parameters.'
					});
				}
			}

			if ((ip.outputs != null) && ((typeof ip.outputs === 'string') || Array.isArray(ip.outputs))) {
				updated = true;
				if (typeof ip.outputs === 'string') {
					existingIp.outputs = ip.outputs.split(/\s*,\s*/gmi);
				} else if (Array.isArray(ip.outputs)) {
					existingIp.outputs = [];
					for (output of Array.from(ip.outputs)) {
						if (typeof output !== 'string') {
							return cb({
								error: 'Invalid output parameters.'
							});
						} else if (!/^\w+$/gmi.test(output)) {
							return cb({
								error: `Invalid output parameter ${output}.`
							});
						} else {
							existingIp.outputs.push(output);
						}
					}
				} else {
					return cb({
						error: 'Invalid output parameter.'
					});
				}
			}

			if ((ip.topModule != null) && (ip.topModule.toString().trim() !== '')) {
				updated = true;
				existingIp.topModule = ip.topModule;
			}

			if ((ip.repo != null) && (ip.repo.toString().trim() !== '')) {
				updated = true;
				existingIp.repo = ip.repo;
			}
			if ((ip.user != null) && (ip.user.toString().trim() !== '')) {
				updated = true;
				existingIp.user = ip.user;
			}
			if ((ip.title != null) && (ip.title.trim() !== '')) {
				updated = true;
				existingIp.title = ip.title.trim();
			}
			if ((ip.description != null) && (ip.description.trim() !== '')) {
				updated = true;
				existingIp.description = ip.description;
			}
			if ((ip.price != null) && (ip.price.toString().trim() !== '')) {
				updated = true;
				existingIp.price = ip.price;
			}
			version = parseInt(ip.version);
			if (!isNaN(version)) {
				updated = true;
				existingIp.version = version;
			}
			if (updated) {
				existingIp.sequence = (existingIp.sequence || 0) + 1;
			}
			//existingIp.category = TODO
			//existingIp.licenseType = TODO
			//existingIp.visible = TODO
			return existingIp.save(function (err, savedIp) {
				if (err) {
					console.error(err);
					return cb({
						error: 'Failed to publish the IP.'
					});
				} else {
					return cb(null, savedIp);
				}
			});
		}
	});
};

const getRepoIP = function (query, cb) {
	const ipModel = require("../models/ip").model;
	query.deleted = false;
	return ipModel.findOne(query, function (err, ip) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to retrieve IP core.'
			});
		} else {
			return cb(null, ip);
		}
	});
};

const getRepoIPs = function (query, cb) {
	const ipModel = require("../models/ip").model;
	query.deleted = false;
	return ipModel.find(query, function (err, ips) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to retrieve IP cores.'
			});
		} else {
			return cb(null, ips);
		}
	});
};

const getAvailableIPs = function (cb) {
	const ipModel = require("../models/ip").model;
	const query = {
		deleted: false,
		visible: true
	};
	return ipModel.find(query, function (err, ips) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to retrieve IP cores.'
			});
		} else {
			const ipList = {};
			const User = require("./user");
			return async.each(ips, (function (ip, callback) {
				if (!ipList[ip.categoryName]) {
					ipList[ip.categoryName] = [];
				}
				return User.getUser({
					_id: ip.user
				}, function (err, user) {
					if (err) {
						return callback(err);
					} else if (!user) {
						console.error(`Cannot find the owner of IP ${ip.title}`);
						return callback();
					} else {
						const validPaths = _.pickSchema(ipModel, ['repo', 'user', 'created', '__v', 'visible', 'deleted']);
						const ipEl = _.pick(clone(ip), validPaths);
						ipEl.id = ipEl._id;
						ipEl.licenseType = ip.licenseType === LicenseType.Paid ? 'paid' : 'free';
						ipEl.owner = user.username;
						ipList[ip.categoryName].push(ipEl);
						return callback();
					}
				});
			}), function (err) {
				if (err) {
					return cb(err);
				} else {
					return cb(null, ipList);
				}
			});
		}
	});
};

const createRepoVersion = async (query, versionData, cb) => {
	const versionModel = require("../models/version").model;
	return new Promise(async (resolve, reject) => {
		let clonedRepo;
		let repoCreated = false;
		try {
			const repo = await getRepo(query);
			if (!repo) {
				return reject({
					error: 'Repository not found.'
				});
			}
			try {
				const versionQuery = versionModel.findOne({
					deleted: false,
					repo: repo._id,
					title: versionData.title,
					number: versionData.number
				});
				const exisitingVersion = await versionQuery.exec();
				if (exisitingVersion) {
					return reject({
						error: 'Version title and number already exists.'
					});
				}
			} catch (err) {
				return reject(handleMongooseError(err, 'An error occurred while creating the version.'))
			}
			const user = await User.getUser(versionUser);
			let newVersion = new versionModel(_.pick(_.omit(versionData, Utils.nonCloneable), _.pickSchema(versionModel)));
			newVersion.repo = repo._id;
			newVersion.repoOwner = repo.owner;
			newVersion.repoTitle = repo.repoTitle;
			newVersion.repoPrivacy = repo.privacy;
			newVersion.repoName = repo.repoName;
			newVersion.versionUser = user._id;
			const cloneName = `${repo.repoName}_${newVersion.title}_${newVersion.number}_${shortid.generate()}`.replace(/[^\w]+/gm, '_');
			clonedRepo = await repo.clone({
				owner: user._id,
				repoTitle: cloneName,
				description: repo.description,
				privacy: PrivacyType.Private
			});
			newVersion.versionRepo = clonedRepo._id;
			try {
				newVersion = await newVersion.save();
				return resolve(newVersion);
			} catch (err) {
				console.error(err);
				if (repoCreated) {
					deleteRepo(clonedRepo).then(() => { }).catch(console.error);
				}
				return reject({
					error: 'An error occurred while creating the version.'
				})
			}
		} catch (err) {
			if (repoCreated) {
				deleteRepo(clonedRepo).then(() => { }).catch(console.error);
			}
			return reject(err);
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
	return getRepo(query, function (err, repo) {
		if (err) {
			return cb(err);
		} else if (!repo) {
			return cb({
				error: 'Repository not found.'
			});
		} else {
			return versionModel.findOne({
				deleted: false,
				repo: repo._id,
				title: versionData.title,
				number: versionData.number
			}, function (err, exisitingVersion) {
				if (err) {
					console.error(err);
					return cb({
						error: 'An error occurred while creating the version.'
					});
				} else if (exisitingVersion) {
					return cb({
						error: 'Version title and number already exists.'
					});
				} else {
					return User.getUser(versionUser, function (err, user) {
						if (err) {
							return cb(err);
						} else {
							let newVersion = new versionModel();
							newVersion = _.extend(newVersion, _.pick(_.omit(versionData, Utils.nonCloneable), _.pickSchema(versionModel)));
							if ((typeof newVersion.title !== 'string') || (newVersion.title.trim() === '')) {
								return cb({
									error: 'Missing parameter "title"'
								});
							}
							if ((typeof newVersion.number !== 'string') || (newVersion.number.trim() === '')) {
								return cb({
									error: 'Missing parameter "number"'
								});
							}
							if ((newVersion.user == null)) {
								return cb({
									error: 'Missing parameter user'
								});
							}
							newVersion.repo = repo._id;
							newVersion.repoOwner = repo.owner;
							newVersion.repoTitle = repo.repoTitle;
							newVersion.repoPrivacy = repo.privacy;
							newVersion.repoName = repo.repoName;
							newVersion.versionUser = user._id;
							// deleteRepo newRepo, (err) -> console.error err if err
							let cloneName = `${repo.repoName}_${newVersion.title}_${newVersion.number}_${shortid.generate()}`;
							cloneName = cloneName.replace(/[^\w]+/gm, '_');
							return repo.clone({
								owner: user._id,
								repoTitle: cloneName,
								description: repo.description,
								privacy: PrivacyType.Private
							}, function (err, clonedRepo) {
								if (err) {
									return cb(err);
								} else {
									newVersion.versionRepo = clonedRepo._id;
									return newVersion.save(function (err, savedVersion) {
										if (err) {
											deleteRepo(clonedRepo, function (err) {
												if (err) {
													return console.error(err);
												}
											});
											console.error(err);
											return cb({
												error: 'An error occurred while creating the version.'
											});
										} else {
											return cb(null, savedVersion);
										}
									});
								}
							});
						}
					});
				}
			});
		}
	});
};

//To-Do: Paginate
const getRepoVersions = async (query, opts = {}, cb) => {
	const versionModel = require("../models/version").model;
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;

	return new Promise(async (resolve, reject) => {
		const dbQuery = versionModel
			.find(query)
			.sort(opts.sort || {
				createdAt: -1
			});
		// if (!opts.noLimit) {
		// 	dbQuery.limit(VersionsPerPage)
		// 		.skip(VersionsPerPage * (opts.page || 0));
		// }
		try {
			resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the versions.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb)
};

const getRepoVersion = async (query, opts = {}, cb) => {
	const versionModel = require("../models/version").model;
	if (typeof opts === 'function') {
		cb = opts;
		opts = {};
	}
	if (query == null) {
		query = {};
	}
	query.deleted = false;
	return new Promise(async (resolve, reject) => {
		const dbQuery = versionModel.findOne(query);
		try {
			return resolve(await dbQuery.exec())
		} catch (err) {
			console.error(err);
			return reject({
				error: 'An error occurred while retrieving the version.'
			});
		}
	}).then(wrapResolveCallback(cb)).catch(cb);
};

const deleteRepoVersion = async (versionId, cb) => {
	const versionModel = require("../models/version").model;
	return new Promise(async (resolve, reject) => {
		try {
			versionId = getMongooseId(versionId);
			let version;
			try {
				version = await versionModel.findOne({
					_id: versionId
				});
			} catch (err) {
				console.error(err);
				return reject({
					error: 'Version not found.'
				});
			}
			if (!version) {
				return reject({
					error: 'Version not found.'
				});
			}

			const repo = await version.getVersionRepo();
			if (!repo) {
				console.error('Source file do not exist!');
			} else {
				deleteRepo(repo).then(() => { }).catch(console.error);
			}
			version.deleted = true;
			try {
				const deletedVersion = await version.save();
				return resolve(deletedVersion);
			} catch (err) {
				console.error(err);
				return reject({
					error: 'Failed to delete the version'
				});
			}
		} catch (err) {
			return reject(err);
		}

	}).then(wrapResolveCallback(cb)).catch(cb);
};



module.exports = {
	assignRole,
	updateUserRole,
	accessRepo,
	createRepo,
	createRepoEntry,
	cloneRepo,
	countRepos,
	countRepoEntries,
	deleteRepo,
	removeRole,
	getRepo,
	getRepos,
	getRepoEntry,
	getRepoEntries,
	getRepoFileStructure,
	getRepoFolderStructure,
	getRepoVerilogStructure,
	getRepoTestbenchStructure,
	getRepoPCFStructure,
	getRepoDCFStructure,
	getRepoStartupStructure,
	getRepoLinkerStructure,
	getRepoNetlistStructure,
	getRepoSimulationStructure,
	getRepoRole,
	getRepoRoles,
	getRepoRoleEntry,
	getRepoRoleEntries,
	getAccessibleRepos,
	getSharedRepos,
	getUserSharedRepos,
	getWatchingRepos,
	getUserWatchingRepos,
	getRepoContributors,
	updateRepo,
	updateRepoWorkspaceSettings,
	updateRepoEntry,
	updateEntryContent,
	updateEntryAttributes,
	updateEntryData,
	deleteRepoEntry,
	formatDhtmlx,
	formatJstree,
	cleanupRepoEntries,
	cleanupRepos,
	refreshRepo,
	refreshAllRepos,
	isRepoFavoritedFrom,
	isRepoWatchedFrom,
	getRepoFavoriteCount,
	getRepoFavorites,
	getRepoWatchCount,
	getRepoWatches,
	favoriteRepo,
	watchRepo,
	search,
	getTopRepos,
	getLatestRepos,
	getTrendingRepos,
	publishRepoIP,
	getRepoIP,
	getRepoIPs,
	getAvailableIPs,
	createRepoVersion,
	getRepoVersions,
	getRepoVersion,
	deleteRepoVersion
};