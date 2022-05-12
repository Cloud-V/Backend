const promisifyMethods = require("./_promisify_methods");
const { AccessLevel } = require("./repo_access");
const {
    EntryType,
    EntrySource,
    EntryAccess,
    EntryState,
    WriteableTypes,
} = require("./repo_entry");
const { LicenseType } = require("./ip");

const Parser = require("../modules/parser");
const mongoose = require("../config/db");
const config = require("../config");
const { wrapResolveCallback } = require("../modules/utils");

const async = require("async");
const { Schema } = require("mongoose");
const { ObjectId } = Schema;

const _ = require("underscore");
const fileExists = require("file-exists");

const PrivacyType = {
    Private: 0,
    Public: 1,
};

const AllowReviews = {
    NoOne: 0,
    Owner: 1,
    Writers: 2,
    Readers: 3,
    Anyone: 4,
};

const validateFSM = function (fsmContent) {
    if (fsmContent == null) {
        console.error("FSM file is empty!");
        return false;
    }
    if (typeof fsmContent !== "object") {
        try {
            fsmContent = JSON.parse(fsmContent);
        } catch (parseError) {
            return false;
        }
    }

    if (!Array.isArray(fsmContent.nodes || !Array.isArray(fsmContent.links))) {
        return false;
    }
    return true;
};
const validateSOC = function (fsmContent) {
    if (fsmContent == null) {
        console.error("SOC file is empty!");
        return false;
    }
    if (typeof fsmContent !== "object") {
        try {
            fsmContent = JSON.parse(fsmContent);
        } catch (parseError) {
            return false;
        }
    }

    return true;
};
const validateSYS = function (fsmContent) {
    if (fsmContent == null) {
        console.error("SYS file is empty!");
        return false;
    }
    if (typeof fsmContent !== "object") {
        try {
            fsmContent = JSON.parse(fsmContent);
        } catch (parseError) {
            return false;
        }
    }

    return true;
};

const repoSchema = new Schema(
    {
        repoName: {
            type: String,
            required: "You must provide a valid name for the repository.",
            lowercase: true,
            validate: {
                validator: async function (repoName, cb) {
                    if (!/^\w+$/gm.test(repoName)) {
                        throw "The repository name can only contain letters, numbers and underscores.";
                    }

                    const Repo = require("../controllers/repo");
                    try {
                        const repos = await Repo.getRepos({
                            _id: {
                                $ne: this._id,
                            },
                            owner: this.owner,
                            repoName,
                        });
                        if (repos.length) {
                            throw "A repository with the same name already exists.";
                        }
                        return true;
                    } catch (err) {
                        console.error(err);
                        return false;
                    }
                },
                message: "Invalid repository name.",
            },
        },
        repoTitle: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
        owner: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        primary: {
            type: Boolean,
            required: true,
            default: true,
        },
        certified: {
            type: Boolean,
            required: true,
            default: false,
        },
        allowClone: {
            type: Boolean,
            required: true,
            default: true,
        },
        featured: {
            type: Boolean,
            default: false,
        },
        buildDir: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        swDir: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        swHexDir: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        ipCoresDir: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        parent: {
            type: ObjectId,
            ref: "Repo",
        },
        project: {
            type: ObjectId,
            ref: "Project",
        },
        isTrial: {
            type: Boolean,
            required: true,
            default: false,
        },
        favorites: {
            type: Number,
            default: 0,
        },
        watches: {
            type: Number,
            default: 0,
        },
        ownerName: {
            type: String,
            default: "",
        },
        topModule: {
            type: String,
            default: "",
        },
        topModuleEntry: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        privacy: {
            type: Number,
            required: true,
            default: PrivacyType.Public,
        },
        internal: {
            type: Boolean,
            default: false,
        },
        internalOwner: {
            type: ObjectId,
            ref: "User",
        },
        organizationalProject: {
            type: Boolean,
            default: false,
        },
        allowReviews: {
            type: Number,
            required: true,
            default: AllowReviews.NoOne,
        },
        external: {
            type: Boolean,
            required: true,
            default: false,
        },
        settings: {
            theme: {
                type: Number,
                default: 0,
            },
            fontSize: {
                type: Number,
                default: 15,
            },
        },
        created: {
            type: Date,
            required: true,
            default: Date.now,
        },
        deleted: {
            type: Boolean,
            required: true,
            default: false,
        },
    },
    {
        timestamps: {
            createdAt: "createdAt",
            updatedAt: "updatedAt",
        },
    }
);

repoSchema.path("privacy").validate(function (privacy) {
    let needle;
    return (
        (needle = privacy),
        Array.from(
            (() => {
                const result = [];
                for (let key in PrivacyType) {
                    const value = PrivacyType[key];
                    result.push(value);
                }
                return result;
            })()
        ).includes(needle)
    );
}, "Invalid privacy type.");

repoSchema.methods.getUser = function (cb) {
    const User = require("../controllers/user");
    return User.getUser(
        {
            _id: this.owner,
        },
        cb
    );
};

repoSchema.methods.getIP = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoIP(
        {
            repo: this._id,
        },
        cb
    );
};

repoSchema.methods.getOwnerName = async function (cb) {
    const User = require("../controllers/user");
    const thisOwner = this.owner;
    return new Promise(async (resolve, reject) => {
        try {
            const user = await User.getUser({
                _id: thisOwner,
            });
            if (!user) {
                return reject({
                    error: "User not found.",
                });
            }
            return resolve(user.username);
        } catch (err) {
            return cb(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.clone = function (repoData, cb) {
    const Repo = require("../controllers/repo");
    return Repo.cloneRepo(this, repoData, cb);
};

repoSchema.methods.writeTemp = function (cb) {
    const FileManager = require("../controllers/file_manager");
    return FileManager.writeTempRepo(this, cb);
};

repoSchema.methods.package = function (cb) {
    const FileManager = require("../controllers/file_manager");
    return FileManager.packageRepo(this, cb);
};

repoSchema.methods.stream = function (cb) {
    const FileManager = require("../controllers/file_manager");
    return FileManager.streamRepo(this, cb);
};

repoSchema.methods.getBuildEntry = function (cb) {
    const thisRepo = this;
    if (this.buildDir != null) {
        return this.getEntry(
            {
                _id: this.buildDir,
            },
            function (err, entry) {
                if (err) {
                    return cb(err);
                } else if (!entry) {
                    return cb({
                        error: "Cannot find build directory.",
                    });
                } else {
                    return cb(null, entry);
                }
            }
        );
    } else {
        return this.getRoot(function (err, root) {
            if (err) {
                return cb(err);
            } else if (!root) {
                return cb({
                    error: "Cannot find the targeted entry",
                });
            } else {
                return thisRepo.getEntry(
                    {
                        handler: EntryType.Folder,
                        title: "build (read-only)",
                        source: EntrySource.Generated,
                        anchor: true,
                        parent: root._id,
                    },
                    function (err, entry) {
                        if (err) {
                            return cb(err);
                        } else if (!entry) {
                            return cb({
                                error: "Cannot find build directory.",
                            });
                        } else {
                            return cb(null, entry);
                        }
                    }
                );
            }
        });
    }
};
repoSchema.methods.getSwEntry = function (cb) {
    const thisRepo = this;
    if (this.swDir != null) {
        return this.getEntry(
            {
                _id: this.swDir,
            },
            function (err, entry) {
                if (err) {
                    return cb(err);
                } else if (!entry) {
                    return cb({
                        error: "Cannot find S/W directory.",
                    });
                } else {
                    return cb(null, entry);
                }
            }
        );
    } else {
        return this.getRoot(function (err, root) {
            if (err) {
                return cb(err);
            } else if (!root) {
                return cb({
                    error: "Cannot find the targeted entry",
                });
            } else {
                return thisRepo.getEntry(
                    {
                        handler: EntryType.Folder,
                        title: "S/W",
                        source: EntrySource.Generated,
                        anchor: true,
                        parent: root._id,
                    },
                    function (err, entry) {
                        if (err) {
                            return cb(err);
                        } else if (!entry) {
                            return cb({
                                error: "Cannot find S/W directory.",
                            });
                        } else {
                            return cb(null, entry);
                        }
                    }
                );
            }
        });
    }
};

repoSchema.methods.getSwHexEntry = function (cb) {
    const thisRepo = this;
    if (this.swHexDir != null) {
        return this.getEntry(
            {
                _id: this.swHexDir,
            },
            function (err, entry) {
                if (err) {
                    return cb(err);
                } else if (!entry) {
                    return cb({
                        error: "Cannot find S/W build directory.",
                    });
                } else {
                    return cb(null, entry);
                }
            }
        );
    } else {
        return this.getSwEntry(function (err, sw) {
            if (err) {
                return cb(err);
            } else if (!sw) {
                return cb({
                    error: "Cannot find the targeted entry",
                });
            } else {
                return thisRepo.getEntry(
                    {
                        handler: EntryType.Folder,
                        title: "Hex",
                        source: EntrySource.Generated,
                        anchor: true,
                        parent: sw._id,
                    },
                    function (err, entry) {
                        if (err) {
                            return cb(err);
                        } else if (!entry) {
                            return cb({
                                error: "Cannot find S/W build directory.",
                            });
                        } else {
                            return cb(null, entry);
                        }
                    }
                );
            }
        });
    }
};

repoSchema.methods.getFileStructure = function (format, cb) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoFileStructure(this._id, cb, format);
};

repoSchema.methods.getFolderStructure = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoFolderStructure(this._id, cb);
};

repoSchema.methods.getVerilogStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoVerilogStructure(this._id, cb, format);
};

repoSchema.methods.getTestbenchStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoTestbenchStructure(this._id, cb, format);
};

repoSchema.methods.getPCFStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoPCFStructure(this._id, cb, format);
};

repoSchema.methods.getDCFStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoDCFStructure(this._id, cb, format);
};

repoSchema.methods.getLinkerStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoLinkerStructure(this._id, cb, format);
};

repoSchema.methods.getStartupStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoStartupStructure(this._id, cb, format);
};

repoSchema.methods.getNetlistStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoNetlistStructure(this._id, format, cb);
};

repoSchema.methods.getSimulationStructure = function (cb, format) {
    if (format == null) {
        format = "jstree";
    }
    const Repo = require("../controllers/repo");
    return Repo.getRepoSimulationStructure(this._id, cb, format);
};

repoSchema.methods.getVerilogModules = function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return this.getEntries(
        {
            repo: thisId,
            handler: EntryType.VerilogFile,
        },
        cb
    );
};

repoSchema.methods.getSynthesizable = function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return this.getEntries(
        {
            repo: thisId,
            handler: EntryType.VerilogFile,
            synthesize: true,
            included: true,
        },
        cb
    );
};
repoSchema.methods.getExcludedVerilog = function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return this.getEntries(
        {
            repo: thisId,
            handler: EntryType.VerilogFile,
            synthesize: true,
            included: false,
        },
        cb
    );
};
repoSchema.methods.getCompileable = function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return this.getEntries(
        {
            repo: thisId,
            handler: {
                $in: [
                    EntryType.CFile,
                    EntryType.HFile,
                    EntryType.LinkerScript,
                    EntryType.StartupScript,
                ],
            },
        },
        cb
    );
};
repoSchema.methods.getExcludedSW = function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return this.getEntries(
        {
            repo: thisId,
            handler: {
                $in: [
                    EntryType.CFile,
                    EntryType.HFile,
                    EntryType.LinkerScript,
                    EntryType.StartupScript,
                ],
            },
            included: false,
        },
        cb
    );
};

repoSchema.methods.isIPCoresIncluded = async function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return new Promise(async (resolve, reject) => {
        try {
            const ips = await this.getEntries({
                repo: thisId,
                handler: EntryType.IP,
                included: true,
            });
            if (ips.length) {
                return resolve({
                    isIncluded: true,
                    names: ips.map((ip) => ip.title).join(", "),
                });
            }
            return resolve({
                isIncluded: false,
            });
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);

    return this.getEntries(
        {
            repo: thisId,
            handler: EntryType.IP,
            included: true,
        },
        function (err, ips) {
            if (err) {
                return cb(err);
            } else if (ips.length) {
                return cb(
                    null,
                    true,
                    Array.from(ips)
                        .map((ip) => ip.title)
                        .join(", ")
                );
            } else {
                return cb(null, false);
            }
        }
    );
};

repoSchema.methods.getEntry = function (query, cb) {
    if (query == null) {
        query = {};
    }
    const Repo = require("../controllers/repo");
    query.repo = this._id;
    return Repo.getRepoEntry(query, cb);
};

repoSchema.methods.getEntries = function (query, cb) {
    if (query == null) {
        query = {};
    }
    const Repo = require("../controllers/repo");
    query.repo = this._id;
    return Repo.getRepoEntries(query, cb);
};

repoSchema.methods.getRoot = function (cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;
    return this.getEntry(
        {
            handler: EntryType.RepoRoot,
        },
        cb
    );
};

repoSchema.methods.createFile = function (
    entryData,
    fileData,
    content,
    overwrite = false,
    force = false,
    cb
) {
    const Repo = require("../controllers/repo");
    const FileManager = require("../controllers/file_manager");
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
        force = false;
    } else if (typeof force === "function") {
        cb = force;
        force = false;
    }

    return new Promise(async (resolve, reject) => {
        try {
            const parentEntry = await this.getEntry({
                _id: entryData.parent,
            });
            if (!parentEntry) {
                return reject({
                    error: "Cannot find parent item.",
                });
            } else if (
                ![EntryType.RepoRoot, EntryType.Folder].includes(
                    parentEntry.handler
                )
            ) {
                return reject({
                    error: "Parent item should be a folder.",
                });
            } else if (parentEntry.access !== EntryAccess.ReadWrite && !force) {
                return reject({
                    error: "Cannot create entry inside read-only directory.",
                });
            } else if (
                this.swDir != null &&
                [
                    EntryType.CFile,
                    EntryType.HFile,
                    EntryType.LinkerScript,
                    EntryType.StartupScript,
                ].includes(entryData.handler) &&
                parentEntry._id.toString() !== this.swDir.toString()
            ) {
                return reject({
                    error: "S/W Files should be placed under S/W folder",
                });
            } else if (
                this.swDir != null &&
                ![
                    EntryType.CFile,
                    EntryType.HFile,
                    EntryType.LinkerScript,
                    EntryType.StartupScript,
                    EntryType.TextFile,
                ].includes(entryData.handler) &&
                parentEntry._id.toString() === this.swDir.toString()
            ) {
                return reject({
                    error: "Only S/W files should be placed in S/W folder",
                });
            } else if (
                this.swHexDir != null &&
                entryData.handler === EntryType.HEXFile &&
                parentEntry._id.toString() !== this.swHexDir.toString()
            ) {
                return reject({
                    error: "HEX Files should be placed under S/W Hex folder",
                });
            } else if (
                this.swHexDir != null &&
                ![EntryType.HEXFile, EntryType.TextFile].includes(
                    entryData.handler
                ) &&
                parentEntry._id.toString() === this.swHexDir.toString()
            ) {
                return reject({
                    error: "Only HEX files should be placed in S/W Hex folder",
                });
            }

            const entry = {
                repo: this._id,
                user: entryData.user,
                handler: entryData.handler,
                parent: entryData.parent,
                title: entryData.title,
                description: entryData.description,
                access:
                    entryData.access != null
                        ? entryData.access
                        : EntryAccess.ReadWrite,
                source:
                    entryData.source != null
                        ? entryData.source
                        : EntrySource.User,
                anchor: entryData.anchor != null ? entryData.anchor : false,
                synthesize:
                    entryData.synthesize != null ? entryData.synthesize : false,
                data: entryData.data != null ? entryData.data : "",
                attributes:
                    entryData.attributes != null ? entryData.attributes : "",
                state:
                    entryData.state != null
                        ? entryData.state
                        : EntryState.Ready,
            };

            const existingEntry = await this.getEntry({
                title: entryData.title,
                parent: entryData.parent,
            });
            if (existingEntry && !overwrite) {
                return reject({
                    error: "An entry with the same name already exists.",
                });
            } else {
                const newEntry = await Repo.createRepoEntry(entry, overwrite);
                const fileEntry = {
                    originalname: fileData.originalname,
                    mimetype: fileData.mimetype,
                    encoding: fileData.encoding,
                    extension: fileData.extension,
                };
                try {
                    const createdFile = await FileManager.createFile(
                        newEntry,
                        fileEntry,
                        content
                    );
                    if (existingEntry) {
                        try {
                            const deletedEntry = await Repo.deleteRepoEntry(
                                existingEntry._id
                            );
                        } catch (err) {
                            await FileManager.clearFileEntry(newEntry);
                            throw err;
                        }
                    }
                    return resolve({
                        entry: newEntry,
                        content,
                    });
                } catch (err) {
                    newEntry
                        .remove()
                        .then(() => {})
                        .catch(console.error);
                    throw err;
                }
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.createVerilogModule = function (
    parentId,
    user,
    moduleName,
    description,
    seq,
    build,
    overwrite,
    cb
) {
    let moduleContent;
    if (seq == null) {
        seq = false;
    }
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    const { _id: userId, username } = user;
    if (moduleName.indexOf(".v", moduleName.length - 2) !== -1) {
        moduleName = moduleName.substring(0, moduleName.length - 2);
    }
    if (moduleName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const moduleFileName = `${moduleName}.v`;

    if (!seq) {
        moduleContent = `// file: ${moduleFileName}
// author: @${username}

\`timescale 1ns/1ns

module ${moduleName};

endmodule`;
    } else {
        moduleContent = `// file: ${moduleFileName}
// author: @${username}

\`timescale 1ns/1ns

module ${moduleName}(clk, rst);
    input clk, rst;

    always @(posedge clk) begin
        if (!rst) begin
            //Reset logic goes here.
        end
        else begin
            //Sequential logic goes here.
        end
    end
endmodule`;
    }
    return this.createVerilogModuleWithContent(
        parentId,
        user,
        moduleName,
        description,
        seq,
        build,
        moduleContent,
        overwrite,
        cb
    );
};
repoSchema.methods.createVerilogModuleWithContent = function (
    parentId,
    user,
    moduleName,
    description,
    seq,
    build,
    moduleContent,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const userId = user._id;
    const { username } = user;
    if (moduleName.indexOf(".v", moduleName.length - 2) !== -1) {
        moduleName = moduleName.substring(0, moduleName.length - 2);
    }
    const moduleFileName = moduleName + ".v";
    const entryData = {
        user: userId,
        handler: EntryType.VerilogFile,
        parent: parentId,
        title: moduleFileName,
        description,
        access: EntryAccess.ReadWrite,
        source: build ? EntrySource.Generated : EntrySource.User,
        anchor: false,
        synthesize: !build,
    };

    const fileData = {
        originalname: moduleName,
        mimetype: "text/x-verilog",
        encoding: "7bit",
        extension: "v",
    };

    return this.createFile(
        entryData,
        fileData,
        moduleContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.importVerilogModule = function (
    parentId,
    user,
    moduleName,
    content,
    description,
    build,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    const { _id: userId, username } = user;
    if (moduleName.indexOf(".v", moduleName.length - 2) !== -1) {
        moduleName = moduleName.substring(0, moduleName.length - 2);
    }

    if (moduleName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const moduleFileName = `${moduleName}.v`;

    const moduleContent = `// file: ${moduleFileName}
// author: @${username}

${content}`;
    const entryData = {
        user: userId,
        handler: EntryType.VerilogFile,
        parent: parentId,
        title: moduleFileName,
        description,
        access: EntryAccess.ReadWrite,
        source: build ? EntrySource.Generated : EntrySource.User,
        anchor: false,
        synthesize: !build,
    };

    const fileData = {
        originalname: moduleName,
        mimetype: "text/x-verilog",
        encoding: "7bit",
        extension: "v",
    };

    return this.createFile(
        entryData,
        fileData,
        moduleContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.importIPCore = function (
    parentId,
    user,
    ipImportName,
    ipId,
    description,
    build,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    const { _id: userId, username } = user;
    if (ipImportName.indexOf(".ip", ipImportName.length - 3) !== -1) {
        ipImportName = ipImportName.substring(0, ipImportName.length - 3);
    }

    if (ipImportName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const ipFileName = `${ipImportName}.ip`;

    let moduleContent = "";
    const entryData = {
        user: userId,
        handler: EntryType.IP,
        parent: parentId,
        title: ipFileName,
        description,
        access: EntryAccess.ReadWrite,
        source: build ? EntrySource.Generated : EntrySource.User,
        anchor: false,
        synthesize: !build,
    };

    const fileData = {
        originalname: ipImportName,
        mimetype: "text/json",
        encoding: "UTF-8",
        extension: "ip",
    };
    const Repo = require("../controllers/repo");
    return Repo.getRepoIP(
        {
            _id: ipId,
            visible: true,
        },
        (err, ip) => {
            if (err) {
                return cb(err);
            } else if (!ip) {
                return cb({
                    error: "Cannot find the specified IP core.",
                });
            } else {
                const User = require("../controllers/user");
                return User.getUser(
                    {
                        _id: ip.user,
                    },
                    (err, user) => {
                        if (err) {
                            return cb(err);
                        } else if (!user) {
                            return cb({
                                error: `Cannot find the owner of IP ${ip.title}`,
                            });
                        } else {
                            entryData.data = JSON.stringify({
                                ip: ip._id,
                            });
                            moduleContent = {
                                _id: ip._id,
                                id: ip._id,
                                title: ip.title,
                                description: ip.description,
                                topModule: ip.topModule,
                                inputs: ip.inputs,
                                outputs: ip.outputs,
                                data: ip.data,
                                category: ip.categoryName,
                                licenseType:
                                    ip.licenseType === LicenseType.Paid
                                        ? "paid"
                                        : "free",
                                price: ip.price,
                                owner: user.username,
                                user: ip.user,
                            };
                            moduleContent = JSON.stringify(moduleContent);
                            return this.createFile(
                                entryData,
                                fileData,
                                moduleContent,
                                overwrite,
                                false,
                                cb
                            );
                        }
                    }
                );
            }
        }
    );
};

repoSchema.methods.createNetlist = function (
    user,
    netlistName,
    netlistContent,
    description,
    state,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getBuildEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (netlistName.indexOf(".v", netlistName.length - 2) !== -1) {
            netlistName = netlistName.substring(0, netlistName.length - 2);
        }

        if (netlistName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const netlistFileName = `${netlistName}.v`;

        return thisRepo.getEntry(
            {
                title: netlistFileName,
                parent: buildDir._id,
            },
            function (err, currentSynth) {
                if (err) {
                    return cb(err);
                } else if (!currentSynth) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.NetlistFile,
                        title: netlistFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                        state,
                    };

                    const fileData = {
                        originalname: netlistName,
                        mimetype: "text/x-verilog",
                        encoding: "7bit",
                        extension: "v",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        netlistContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return currentSynth.setState(
                            state,
                            function (err, entry) {
                                if (err) {
                                    return cb(err);
                                }
                                return thisRepo.updateFileContent(
                                    currentSynth._id,
                                    netlistContent,
                                    true,
                                    false,
                                    function (err, content) {
                                        if (err) {
                                            return cb(err);
                                        }
                                        return cb(null, {
                                            entry,
                                            content: netlistContent,
                                        });
                                    }
                                );
                            }
                        );
                    } else {
                        return cb({
                            error: "No permission to override current netlist.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createCompiledObject = function (
    user,
    objName,
    objContent,
    description,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getBuildEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (objName.indexOf(".obj", objName.length - 4) !== -1) {
            objName = objName.substring(0, objName.length - 4);
        }

        if (objName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const objFileName = `${objName}.obj`;

        return thisRepo.getEntry(
            {
                title: objFileName,
                parent: buildDir._id,
            },
            function (err, currentObj) {
                if (err) {
                    return cb(err);
                } else if (!currentObj) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.OBJFile,
                        title: objFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                    };

                    const fileData = {
                        originalname: objName,
                        mimetype: "text/octet-stream",
                        extension: "obj",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        objContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return thisRepo.updateFileContent(
                            currentObj._id,
                            objContent,
                            true,
                            false,
                            cb
                        );
                    } else {
                        return cb({
                            error: "No permission to override current file.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createHexFile = function (
    user,
    objName,
    objContent,
    description,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getSwHexEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (objName.indexOf(".hex", objName.length - 4) !== -1) {
            objName = objName.substring(0, objName.length - 4);
        }

        if (objName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const objFileName = `${objName}.hex`;

        return thisRepo.getEntry(
            {
                title: objFileName,
                parent: buildDir._id,
            },
            function (err, currentObj) {
                if (err) {
                    return cb(err);
                } else if (!currentObj) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.TextFile,
                        title: objFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                    };

                    const fileData = {
                        originalname: objName,
                        mimetype: "text/plain",
                        extension: "hex",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        objContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return thisRepo.updateFileContent(
                            currentObj._id,
                            objContent,
                            true,
                            false,
                            function (err, content) {
                                if (err) {
                                    return cb(err);
                                }
                                return cb(null, {
                                    entry: currentObj,
                                });
                            }
                        );
                    } else {
                        return cb({
                            error: "No permission to override current file.",
                        });
                    }
                }
            }
        );
    });
};
repoSchema.methods.createListFile = function (
    user,
    objName,
    objContent,
    description,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getSwHexEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (objName.indexOf(".lst", objName.length - 4) !== -1) {
            objName = objName.substring(0, objName.length - 4);
        }

        if (objName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const objFileName = `${objName}.lst`;

        return thisRepo.getEntry(
            {
                title: objFileName,
                parent: buildDir._id,
            },
            function (err, currentObj) {
                if (err) {
                    return cb(err);
                } else if (!currentObj) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.TextFile,
                        title: objFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                    };

                    const fileData = {
                        originalname: objName,
                        mimetype: "text/plain",
                        extension: "lst",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        objContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return thisRepo.updateFileContent(
                            currentObj._id,
                            objContent,
                            true,
                            false,
                            function (err, content) {
                                if (err) {
                                    return cb(err);
                                }
                                return cb(null, {
                                    entry: currentObj,
                                });
                            }
                        );
                    } else {
                        return cb({
                            error: "No permission to override current file.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createBitstream = function (
    user,
    bitstreamName,
    bistreamContent,
    description,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const thisRepo = this;
    return this.getBuildEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (bitstreamName.indexOf(".bin", bitstreamName.length - 4) !== -1) {
            bitstreamName = bitstreamName.substring(
                0,
                bitstreamName.length - 4
            );
        }

        if (bitstreamName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const bitstreamFileName = `${bitstreamName}.bin`;

        return thisRepo.getEntry(
            {
                title: bitstreamFileName,
                parent: buildDir._id,
            },
            function (err, currentBitstream) {
                if (err) {
                    return cb(err);
                } else if (!currentBitstream) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.BinaryFile,
                        title: bitstreamFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                    };

                    const fileData = {
                        originalname: bitstreamName,
                        mimetype: "application/octet-stream",
                        extension: "bin",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        bistreamContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return thisRepo.updateFileContent(
                            currentBitstream._id,
                            bistreamContent,
                            true,
                            false,
                            function (err, content) {
                                if (err) {
                                    return cb(err);
                                }
                                return cb(null, {
                                    entry: currentBitstream,
                                });
                            }
                        );
                    } else {
                        return cb({
                            error: "No permission to override current bistream.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createSynthesisReport = function (
    user,
    reportName,
    reportContent,
    description,
    state,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getBuildEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (reportName.indexOf(".rpt.txt", reportName.length - 8) !== -1) {
            reportName = reportName.substring(0, reportName.length - 8);
        }

        if (reportName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const reportFileName = `${reportName}.rpt.txt`;

        return thisRepo.getEntry(
            {
                title: reportFileName,
                parent: buildDir._id,
            },
            function (err, currentReport) {
                if (err) {
                    return cb(err);
                } else if (!currentReport) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.SynthesisReport,
                        title: reportFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                        state,
                    };

                    const fileData = {
                        originalname: reportName,
                        mimetype: "text/x-verilog",
                        encoding: "7bit",
                        extension: "v",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        reportContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return currentReport.setState(
                            state,
                            function (err, entry) {
                                if (err) {
                                    return cb(err);
                                }
                                return thisRepo.updateFileContent(
                                    currentReport._id,
                                    reportContent,
                                    true,
                                    false,
                                    function (err, content) {
                                        if (err) {
                                            return cb(err);
                                        }
                                        return cb(null, {
                                            entry,
                                            content: reportContent,
                                        });
                                    }
                                );
                            }
                        );
                    } else {
                        return cb({
                            error: "No permission to override current netlist.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createSTA = function (
    user,
    reportName,
    reportContent,
    netlistEntry,
    description,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getBuildEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (reportName.indexOf(".sta", reportName.length - 4) !== -1) {
            reportName = reportName.substring(0, reportName.length - 4);
        }

        if (reportName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const reportFileName = `${reportName}.sta`;
        reportContent = JSON.stringify(reportContent);

        return thisRepo.getEntry(
            {
                title: reportFileName,
                parent: buildDir._id,
            },
            function (err, currentReport) {
                if (err) {
                    return cb(err);
                } else if (!currentReport) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.STA,
                        title: reportFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                    };

                    const fileData = {
                        originalname: reportName,
                        mimetype: "text/json",
                        encoding: "7bit",
                        extension: "sta",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        reportContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        return thisRepo.updateFileContent(
                            currentReport._id,
                            reportContent,
                            true,
                            false,
                            cb
                        );
                    } else {
                        return cb({
                            error: "No permission to override current report.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createVCD = function (
    user,
    sourceTestbench,
    isNetlist,
    netlistId,
    stdcell,
    vcdName,
    vcdContent,
    description,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    const thisRepo = this;
    return this.getBuildEntry(function (err, buildDir) {
        if (err) {
            return cb(err);
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }
        let userId = null;
        if (user instanceof require("mongoose").Types.ObjectId) {
            userId = user;
        } else if (typeof user === "object") {
            userId = user._id;
        } else {
            userId = user;
        }

        if (vcdName.indexOf(".vcd", vcdName.length - 4) !== -1) {
            vcdName = vcdName.substring(0, vcdName.length - 4);
        }

        if (vcdName.trim().length === 0) {
            return cb({
                error: "Invalid filename.",
            });
        }

        const vcdFileName = `${vcdName}.vcd`;

        const vcdData = {
            source: sourceTestbench,
            netlist: isNetlist,
        };

        if (isNetlist) {
            vcdData.netlistId = netlistId;
            vcdData.stdcell = stdcell;
        }

        return thisRepo.getEntry(
            {
                title: vcdFileName,
                parent: buildDir._id,
            },
            function (err, currentVCD) {
                if (err) {
                    return cb(err);
                } else if (!currentVCD) {
                    const entryData = {
                        user: userId,
                        handler: EntryType.VCDFile,
                        title: vcdFileName,
                        parent: buildDir._id,
                        remoteParent: null,
                        description,
                        access: EntryAccess.ReadOnly,
                        anchor: false,
                        source: EntrySource.Generated,
                        synthesize: false,
                        data: JSON.stringify({
                            source: sourceTestbench,
                        }),
                    };

                    const fileData = {
                        originalname: vcdName,
                        mimetype: "text/plain",
                        encoding: "7bit",
                        extension: "vcd",
                    };
                    return thisRepo.createFile(
                        entryData,
                        fileData,
                        vcdContent,
                        overwrite,
                        true,
                        cb
                    );
                } else {
                    if (overwrite) {
                        let data = undefined;
                        try {
                            data = JSON.parse(currentVCD.data);
                            if (data.source === sourceTestbench) {
                                return thisRepo.updateFileContent(
                                    currentVCD._id,
                                    vcdContent,
                                    true,
                                    false,
                                    function (err, content) {
                                        if (err) {
                                            return cb(err);
                                        }
                                        return cb(null, {
                                            entry: currentVCD,
                                            content: vcdContent,
                                        });
                                    }
                                );
                            } else {
                                return thisRepo.updateEntryAttributes(
                                    currentVCD._id,
                                    "",
                                    function (err, updatedEntry) {
                                        if (err) {
                                            return cb(err);
                                        } else {
                                            return thisRepo.updateEntryData(
                                                currentVCD._id,
                                                JSON.stringify({
                                                    source: sourceTestbench,
                                                }),
                                                function (err, updatedEntry) {
                                                    if (err) {
                                                        return cb(err);
                                                    } else {
                                                        return thisRepo.updateFileContent(
                                                            currentVCD._id,
                                                            vcdContent,
                                                            true,
                                                            false,
                                                            function (
                                                                err,
                                                                content
                                                            ) {
                                                                if (err) {
                                                                    return cb(
                                                                        err
                                                                    );
                                                                }
                                                                return cb(
                                                                    null,
                                                                    {
                                                                        entry: updatedEntry,
                                                                        content:
                                                                            vcdContent,
                                                                    }
                                                                );
                                                            }
                                                        );
                                                    }
                                                }
                                            );
                                        }
                                    }
                                );
                            }
                        } catch (e) {
                            console.error(e);
                            return thisRepo.updateEntryAttributes(
                                currentVCD._id,
                                "",
                                function (err, updatedEntry) {
                                    if (err) {
                                        return cb(err);
                                    } else {
                                        return thisRepo.updateEntryData(
                                            currentVCD._id,
                                            JSON.stringify(
                                                {
                                                    source: sourceTestbench,
                                                },
                                                function (err, updatedEntry) {
                                                    if (err) {
                                                        return cb(err);
                                                    } else {
                                                        return thisRepo.updateFileContent(
                                                            currentVCD._id,
                                                            vcdContent,
                                                            true,
                                                            false,
                                                            cb
                                                        );
                                                    }
                                                }
                                            )
                                        );
                                    }
                                }
                            );
                        }
                    } else {
                        return cb({
                            error: "No permission to override current VCD.",
                        });
                    }
                }
            }
        );
    });
};

repoSchema.methods.createPCF = function (
    parentId,
    user,
    pcfName,
    boardId,
    description,
    build,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    const { _id: userId } = user;
    if (pcfName.indexOf(".pcf", pcfName.length - 4) !== -1) {
        pcfName = pcfName.substring(0, pcfName.length - 4);
    }
    pcfName = `${pcfName}.pcf`;

    if (pcfName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const entryData = {
        user: userId,
        handler: EntryType.PCFFile,
        parent: parentId,
        remoteParent: null,
        title: pcfName,
        description,
        access: EntryAccess.ReadWrite,
        anchor: false,
        source: build ? EntrySource.Generated : EntrySource.User,
        synthesize: false,
        attributes: JSON.stringify({
            board: boardId,
        }),
    };

    const fileData = {
        originalname: pcfName,
        mimetype: "text/plain",
        encoding: "7bit",
        extension: "pcf",
    };

    return this.createFile(entryData, fileData, "", overwrite, false, cb);
};

repoSchema.methods.createDCF = function (
    parentId,
    user,
    dcfName,
    stdcell,
    constr,
    description,
    build,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    const { _id: userId, username } = user;
    if (dcfName.indexOf(".dcf", dcfName.length - 4) !== -1) {
        dcfName = dcfName.substring(0, dcfName.length - 4);
    }
    dcfName = `${dcfName}.dcf`;

    if (dcfName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const stdcellConstrPath = path.join(
        config.stdcellRepo,
        stdcell,
        "constraints.json"
    );

    return fileExists(stdcellConstrPath, (err, exists) => {
        if (err) {
            console.error(err);
            return cb({
                error: "There is an error with the selected standard cell library.",
            });
        } else if (!exists) {
            return cb({
                error: "No valid constraints for the selected standard cell library.",
            });
        } else {
            const validConstr = require(`../${stdcellConstrPath}`);
            const constrContent = {
                stdcell: stdcell,
                clock: validConstr.clockMin,
                outputLoad: validConstr.outputLoadMin,
                inputDrivingCell: validConstr.inputDrivingCells[0],
                maxTransition: validConstr.maxTransitionMin,
                maxFanout: validConstr.maxFanoutMin,
            };
            if (typeof constr === "string") {
                try {
                    constr = JSON.parse(constr);
                } catch (e) {
                    console.error(e);
                    return cb({
                        error: "Invalid constraints content.",
                    });
                }
            }
            if (typeof constr !== "object") {
                return cb({
                    error: "Invalid constraints content.",
                });
            }
            const numberOpts = [
                "clock",
                "outputLoad",
                "maxTransition",
                "maxFanout",
            ];
            for (let opt of Array.from(numberOpts)) {
                if (constr[opt] != null) {
                    const optValue = parseFloat(constr[opt]);
                    if (isNaN(optValue)) {
                        return cb({
                            error: `Invalid constraint value ${constr[opt]} for option ${opt}.`,
                        });
                    }
                    if (
                        optValue < validConstr[opt + "Min"] ||
                        optValue > validConstr[opt + "Max"]
                    ) {
                        return cb({
                            error: `Invalid constraint value ${
                                constr[opt]
                            } for option ${opt}, it should be between ${
                                validConstr[opt + "Min"]
                            } and ${validConstr[opt + "Max"]}.`,
                        });
                    }
                    constrContent[opt] = optValue;
                }
            }
            if (
                Array.from(validConstr.inputDrivingCells).includes(
                    constr.inputDrivingCell
                )
            ) {
                constrContent.inputDrivingCell = constr.inputDrivingCell;
            }
            const content = JSON.stringify(constrContent);
            const entryData = {
                user: userId,
                handler: EntryType.DCFFile,
                parent: parentId,
                remoteParent: null,
                title: dcfName,
                description,
                access: EntryAccess.ReadWrite,
                anchor: false,
                source: build ? EntrySource.Generated : EntrySource.User,
                synthesize: false,
            };

            const fileData = {
                originalname: dcfName,
                mimetype: "text/json",
                encoding: "7bit",
                extension: "dcf",
            };
            return this.createFile(
                entryData,
                fileData,
                content,
                overwrite,
                false,
                cb
            );
        }
    });
};

repoSchema.methods.createVerilogTestbench = function (
    parentId,
    user,
    testbenchName,
    sourceModule,
    sourceFile,
    description,
    build,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    const { _id: userId, username } = user;
    if (testbenchName.indexOf(".v", testbenchName.length - 2) !== -1) {
        testbenchName = testbenchName.substring(0, testbenchName.length - 2);
    }

    if (testbenchName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const thisRepo = this;
    if (sourceModule) {
        return this.getEntry(
            {
                _id: sourceFile,
            },
            function (err, sourceEntry) {
                if (err) {
                    return cb(err);
                } else if (!sourceEntry) {
                    return cb({
                        error: "Source entry does not exist.",
                    });
                } else {
                    return Parser.generateTestbench(
                        sourceModule,
                        sourceEntry,
                        testbenchName,
                        function (err, moduleContent) {
                            if (err) {
                                return cb(err);
                            } else {
                                const testbenchFileName = `${testbenchName}.v`;
                                moduleContent = `\
// file: ${testbenchFileName}
// author: @${username}
// Testbench for ${sourceModule}

${moduleContent}`;
                                return thisRepo.createVerilogTestbenchWithContent(
                                    parentId,
                                    user,
                                    testbenchName,
                                    sourceModule,
                                    sourceFile,
                                    description,
                                    build,
                                    moduleContent,
                                    overwrite,
                                    cb
                                );
                            }
                        }
                    );
                }
            }
        );
    } else {
        const moduleName = testbenchName;
        const testbenchFileName = `${testbenchName}.v`;
        const moduleContent = `// file: ${testbenchFileName}
// author: @${username}
// Testbench ${moduleName}

\`timescale 1ns/1ns

module ${moduleName};

endmodule`;
        return thisRepo.createVerilogTestbenchWithContent(
            parentId,
            user,
            testbenchName,
            sourceModule,
            sourceFile,
            description,
            build,
            moduleContent,
            overwrite,
            cb
        );
    }
};

repoSchema.methods.createVerilogTestbenchWithContent = function (
    parentId,
    user,
    testbenchName,
    sourceModule,
    sourceFile,
    description,
    build,
    moduleContent,
    overwrite,
    cb
) {
    if (build == null) {
        build = false;
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const userId = user._id;
    const { username } = user;
    if (testbenchName.indexOf(".v", testbenchName.length - 2) !== -1) {
        testbenchName = testbenchName.substring(0, testbenchName.length - 2);
    }
    const testbenchFileName = testbenchName + ".v";
    const entryData = {
        user: userId,
        handler: EntryType.TestbenchFile,
        parent: parentId,
        remoteParent: null,
        title: testbenchFileName,
        description,
        access: EntryAccess.ReadWrite,
        anchor: false,
        source: build ? EntrySource.Generated : EntrySource.User,
        synthesize: false,
    };

    const fileData = {
        originalname: testbenchName,
        mimetype: "text/x-verilog",
        encoding: "7bit",
        extension: "v",
    };
    return this.createFile(
        entryData,
        fileData,
        moduleContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createTextfile = async function (
    entry,
    content = "",
    overwrite = false,
    cb
) {
    if (typeof content === "function") {
        cb = content;
        content = "";
        overwrite = false;
    } else if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    if (typeof content !== "string") {
        content = "";
    }
    return new Promise(async (resolve, reject) => {
        const userId = entry.user;
        entry.handler = EntryType.TextFile;
        entry.remoteParent = null;
        entry.description = entry.description || "";
        entry.access = EntryAccess.ReadWrite;
        entry.source = EntrySource.User;
        entry.anchor = false;
        entry.synthesize = false;

        const fileData = {
            originalname: entry.title,
            mimetype: "text/plain",
            encoding: "7bit",
            extension: "txt",
        };
        try {
            const createdFile = await this.createFile(
                entry,
                fileData,
                content,
                overwrite,
                false
            );
            return resolve(createdFile);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.createCFile = function (
    parentId,
    user,
    fileName,
    description,
    textContent,
    overwrite,
    cb
) {
    if (textContent == null) {
        textContent = "";
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }
    if (fileName.indexOf(".c", fileName.length - 2) !== -1) {
        fileName = fileName.substring(0, fileName.length - 2);
    }

    if (fileName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    fileName = `${fileName}.c`;

    if (!textContent.length) {
        textContent = `\
int func() {

	return 0;
}`;
    }

    const entryData = {
        user: userId,
        handler: EntryType.CFile,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
        included: true,
    };

    const fileData = {
        originalname: fileName,
        mimetype: "text/x-c",
        encoding: "7bit",
        extension: "c",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createHFile = function (
    parentId,
    user,
    fileName,
    description,
    textContent,
    overwrite,
    cb
) {
    if (textContent == null) {
        textContent = "";
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }
    if (fileName.indexOf(".h", fileName.length - 2) !== -1) {
        fileName = fileName.substring(0, fileName.length - 2);
    }

    if (fileName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }
    fileName = `${fileName}.h`;

    const ifdefHeaderName = fileName.toUpperCase().replace(/\./, "_");

    if (!textContent.length) {
        textContent = `\
#ifndef ${ifdefHeaderName}
#define ${ifdefHeaderName}

int func();

#endif`;
    }

    const entryData = {
        user: userId,
        handler: EntryType.HFile,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
    };

    const fileData = {
        originalname: fileName,
        mimetype: "text/x-h",
        encoding: "7bit",
        extension: "h",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createLinkerFile = function (
    parentId,
    user,
    fileName,
    target,
    description,
    textContent,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }

    if (fileName.indexOf(".ld", fileName.length - 3) !== -1) {
        fileName = fileName.substring(0, fileName.length - 3);
    }

    if (fileName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }
    fileName = `${fileName}.ld`;

    if (textContent == null) {
        textContent = require("../templates/linker")[target] || "";
    }

    const entryData = {
        user: userId,
        handler: EntryType.LinkerScript,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
        data: JSON.stringify({
            target: target || "",
        }),
    };

    const fileData = {
        originalname: fileName,
        mimetype: "text/plain",
        encoding: "7bit",
        extension: "ld",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createStartupFile = function (
    parentId,
    user,
    fileName,
    target,
    description,
    textContent,
    overwrite,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }

    if (fileName.indexOf(".s", fileName.length - 2) !== -1) {
        fileName = fileName.substring(0, fileName.length - 2);
    }

    if (fileName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }
    fileName = `${fileName}.s`;

    if (textContent == null) {
        textContent = require("../templates/startup")[target] || "";
    }

    const entryData = {
        user: userId,
        handler: EntryType.StartupScript,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
        data: JSON.stringify({
            target: target || "",
        }),
    };

    const fileData = {
        originalname: fileName,
        mimetype: "text/plain",
        encoding: "7bit",
        extension: "s",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createFSM = function (
    parentId,
    user,
    fsmName,
    description,
    textContent,
    overwrite,
    cb
) {
    if (textContent == null) {
        textContent = '{"nodes":[],"links":[]}';
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }

    if (fsmName.indexOf(".fsm", fsmName.length - 4) !== -1) {
        fsmName = fsmName.substring(0, fsmName.length - 4);
    }

    if (fsmName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const fileName = `${fsmName}.fsm`;

    if (!validateFSM(textContent)) {
        return cb({
            error: "Invalid FSM file.",
        });
    }

    if (typeof textContent === "object") {
        textContent = JSON.stringify(textContent);
    }

    const entryData = {
        user: userId,
        handler: EntryType.FSM,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
    };

    const fileData = {
        originalname: fsmName,
        mimetype: "text/json",
        encoding: "7bit",
        extension: "fsm",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createSOC = function (
    parentId,
    user,
    socName,
    description,
    textContent,
    overwrite,
    cb
) {
    if (textContent == null) {
        textContent = "[]";
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }

    if (socName.indexOf(".soc", socName.length - 4) !== -1) {
        socName = socName.substring(0, socName.length - 4);
    }

    if (socName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const fileName = `${socName}.soc`;

    if (!validateSOC(textContent)) {
        return cb({
            error: "Invalid SOC file.",
        });
    }

    if (typeof textContent === "object") {
        textContent = JSON.stringify(textContent);
    }

    const entryData = {
        user: userId,
        handler: EntryType.SOC,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
    };

    const fileData = {
        originalname: socName,
        mimetype: "text/json",
        encoding: "7bit",
        extension: "fsm",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createSYS = function (
    parentId,
    user,
    sysName,
    description,
    textContent,
    overwrite,
    cb
) {
    if (textContent == null) {
        textContent = '{"nodes":[],"links":[]}';
    }
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    let userId = null;
    if (user instanceof require("mongoose").Types.ObjectId) {
        userId = user;
    } else if (typeof user === "object") {
        userId = user._id;
    } else {
        userId = user;
    }

    if (sysName.indexOf(".sys", sysName.length - 4) !== -1) {
        sysName = sysName.substring(0, sysName.length - 4);
    }

    if (sysName.trim().length === 0) {
        return cb({
            error: "Invalid filename.",
        });
    }

    const fileName = `${sysName}.sys`;

    if (!validateSYS(textContent)) {
        return cb({
            error: "Invalid sys file.",
        });
    }

    if (typeof textContent === "object") {
        textContent = JSON.stringify(textContent);
    }

    const entryData = {
        user: userId,
        handler: EntryType.SYS,
        parent: parentId,
        remoteParent: null,
        title: fileName,
        description,
        access: EntryAccess.ReadWrite,
        source: EntrySource.User,
        anchor: false,
        synthesize: false,
    };

    const fileData = {
        originalname: sysName,
        mimetype: "text/json",
        encoding: "7bit",
        extension: "fsm",
    };

    return this.createFile(
        entryData,
        fileData,
        textContent,
        overwrite,
        false,
        cb
    );
};

repoSchema.methods.createImageEntry = function (
    parentId,
    user,
    imageName,
    description,
    imagePath,
    overwrite,
    cb
) {
    // TODO
    if (overwrite == null) {
        overwrite = false;
    }
    return cb({
        _id: "",
        title: "",
        parent: "",
    });
};

repoSchema.methods.createBinaryEntry = function (
    parentId,
    user,
    fileName,
    description,
    filePath,
    overwrite,
    cb
) {
    //TODO
    if (overwrite == null) {
        overwrite = false;
    }
    return cb({
        _id: "",
        title: "",
        parent: "",
    });
};

repoSchema.methods.createFolder = async function (
    folder,
    overwrite = false,
    cb
) {
    const Repo = require("../controllers/repo");
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    return new Promise(async (resolve, reject) => {
        try {
            const parentEntry = await this.getEntry({
                _id: folder.parent,
            });
            if (!parentEntry) {
                return reject({
                    error: "Cannot find parent item.",
                });
            } else if (
                ![EntryType.RepoRoot, EntryType.Folder].includes(
                    parentEntry.handler
                )
            ) {
                return reject({
                    error: "Parent item should be a folder.",
                });
            } else if (
                parentEntry.access !== EntryAccess.ReadWrite &&
                folder.source !== EntrySource.Generated
            ) {
                return reject({
                    error: "Cannot create folder inside read-only directory.",
                });
            }
            folder.repo = this._id;
            folder.handler = EntryType.Folder;
            folder.remoteParent = null;
            folder.description = folder.description || "";
            folder.synthesize = false;
            const existingEntry = await this.getEntry({
                title: folder.title,
                parent: parentEntry._id,
            });
            if (existingEntry && !overwrite) {
                return reject({
                    error: "A folder with the same name already exists.",
                });
            } else {
                const createdFolder = await Repo.createRepoEntry(
                    folder,
                    overwrite
                );
                if (existingEntry) {
                    try {
                        await existingEntry.deleteEntry(false);
                    } catch (err) {
                        createdFolder
                            .deleteEntry()
                            .then(() => {})
                            .catch(console.error);
                        return reject(err);
                    }
                }
                return resolve({
                    entry: createdFolder,
                });
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.createAnchorFolder = async function (
    folder,
    overwrite = false,
    cb
) {
    folder.anchor = true;
    return this.createFolder(folder, overwrite, cb);
};

repoSchema.methods.createRoot = async function (remoteRoot, cb) {
    const Repo = require("../controllers/repo");
    if (typeof remoteRoot === "function") {
        cb = remoteRoot;
        remoteRoot = null;
    }
    return new Promise(async (resolve, reject) => {
        const entry = {
            repo: this._id,
            user: this.owner,
            handler: EntryType.RepoRoot,
            parent: null,
            remoteParent: remoteRoot,
            title: this.repoTitle,
            description: "Root Entry",
            access: EntryAccess.ReadWrite,
            source: EntrySource.Generated,
            anchor: true,
            synthesize: false,
        };
        try {
            const existingRoot = await this.getEntry({
                handler: EntryType.RepoRoot,
            });
            if (existingRoot) {
                return reject({
                    error: "Only one root per repository is allowed.",
                });
            }
            const rootEntry = await Repo.createRepoEntry(entry);
            return resolve({
                entry: rootEntry,
            });
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.relocateMultiple = async function ({
    entryId,
    targetId,
    overwrite,
    copy = false,
    cb,
}) {
    try {
        if (overwrite === null) {
            overwrite = false;
        }
        if (!Array.isArray(entryId)) {
            entryId = [entryId];
        }
        if (typeof overwrite === "function") {
            cb = overwrite;
            overwrite = false;
        }

        let allFolders = await this.p.getEntries({ handler: EntryType.Folder });

        const foldersMap = {};
        allFolders.forEach((elem) => {
            return (foldersMap[elem.id] = elem);
        });

        const allEntriesQuery = [];
        for (let el of Array.from(entryId)) {
            if (typeof el !== "string") {
                return cb({
                    error: "Invalid entry.",
                });
            }
            allEntriesQuery.push({
                _id: el,
            });
        }

        let allEntries = await self.p.getEntries({ $or: allEntriesQuery });

        const processedItems = [];
        const failedItems = [];
        const failErrors = [];

        const action = copy ? "copyTo" : "moveTo";

        let recurseEntry = async (entry, targetId) => {
            await entry.p[action](targetId, overwrite, false)
                .then(async (processedItem) => {
                    if (allEntriesMap[entry._id.toString()]) {
                        processedItem.isTarget = true;
                    } else {
                        processedItem.isTarget = false;
                    }
                    processedItem.original = entry._id;
                    processedItems.push(processedItem);
                    if (entry.handler === EntryType.Folder) {
                        return;
                    }

                    let allChildren = await this.p.getEntries({
                        parent: entry._id,
                    });
                    let validChildren = allChildren.filter(
                        (child) =>
                            child.id !== self.buildDir &&
                            ![
                                EntryType.UnkownEntry,
                                EntryType.RepoRoot,
                                EntryType.NetlistFile,
                                EntryType.VCDFile,
                                EntryType.VVPFile,
                                EntryType.STA,
                                EntryType.SynthesisReport,
                                EntryType.IP,
                            ].includes(child.handler)
                    );

                    for (let child of validChildren) {
                        await recurseEntry(child, processedItem._id);
                    }
                })
                .catch((err) => {
                    failedItems.push(entry);
                    failErrors.push(err);
                });
        };

        if (!allEntries.length) {
            return cb({
                error: "No entries to copy/move.",
            });
        }

        let allEntriesMap = {};
        let allNames = {};
        let isConflict = false;

        allEntries.forEach((elem) => {
            allEntriesMap[elem.id] = elem;
            if (allNames[elem.title]) {
                if (!isConflict) {
                    return (isConflict = elem.title);
                }
            } else {
                return (allNames[elem.title] = true);
            }
        });
        if (isConflict) {
            throw {
                error: `Cannot copy/move more than one file with the same name "${isConflict}" to the same destination.`,
            };
        }

        for (elem of Array.from(allEntries)) {
            if (
                elem._id.toString() === self.buildDir ||
                [
                    EntryType.UnkownEntry,
                    EntryType.RepoRoot,
                    EntryType.NetlistFile,
                    EntryType.VCDFile,
                    EntryType.VVPFile,
                    EntryType.STA,
                    EntryType.SynthesisReport,
                    EntryType.IP,
                ].includes(elem.handler)
            ) {
                throw {
                    error: `Cannot copy/move "${elem.title}".`,
                };
            }
            let elemParent = foldersMap[elem.parent.toString()];
            while (elemParent) {
                if (allEntriesMap[elemParent._id.toString()]) {
                    throw {
                        error: `Cannot copy/move the entry "${elem.title}" with one of its parent directories "${elemParent.title}" at the same time.`,
                    };
                }
                elemParent = foldersMap[elemParent.parent.toString()];
            }
        }

        for (let entry of allEntries) {
            await recurseEntry(entry, targetId, callback);
        }

        return cb(null, processedItems, failedItems, failErrors);
    } catch (err) {
        return cb(err);
    }
};

repoSchema.methods.moveMultiple = function (entryId, targetId, overwrite, cb) {
    this.relocateMultiple({ entryId, targetId, overwrite, copy: false, cb });
};

repoSchema.methods.copyMultiple = function (entryId, targetId, overwrite, cb) {
    this.relocateMultiple({ entryId, targetId, overwrite, copy: true, cb });
};

repoSchema.methods.moveEntry = function (entryId, targetId, overwrite, cb) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const thisId = this._id;
    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else {
                return itemEntry.moveTo(targetId, overwrite, false, cb);
            }
        }
    );
};

repoSchema.methods.copyEntry = function (entryId, targetId, overwrite, cb) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const thisId = this._id;
    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else {
                return itemEntry.copyTo(targetId, overwrite, false, cb);
            }
        }
    );
};

repoSchema.methods.deleteEntry = async function (
    entryId,
    overwrite = false,
    cb
) {
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }
    return new Promise(async (resolve, reject) => {
        try {
            itemEntry = await this.getEntry({
                _id: entryId,
            });
            if (!itemEntry) {
                return reject({
                    error: "Entry does not exist.",
                });
            }
            const deletedEntry = await itemEntry.deleteEntry(overwrite);
            return resolve(deletedEntry);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.deleteMultiple = function (entryIds, overwrite, cb) {
    if (overwrite == null) {
        overwrite = false;
    }
    const deletedItems = [];
    const failedItems = [];
    const failErrors = [];
    return async.each(
        entryIds,
        (entryId, callback) => {
            return this.getEntry(
                {
                    _id: entryId,
                },
                (err, entry) => {
                    if (err) {
                        failedItems.push(
                            entry
                                ? entry
                                : {
                                      _id: entryId,
                                  }
                        );
                        failErrors.push(err);
                        return callback();
                    } else if (!entry) {
                        failedItems.push({
                            _id: entryId,
                        });
                        failErrors.push({
                            error: `Item ${entryId} not found`,
                        });
                        return callback();
                    } else if (
                        entry.access <= EntryAccess.ReadOnly &&
                        ![
                            EntryType.NetlistFile,
                            EntryType.TextFile,
                            EntryType.VCDFile,
                            EntryType.SynthesisReport,
                            EntryType.IP,
                            EntryType.BinaryFile,
                        ].includes(entry.handler)
                    ) {
                        failedItems.push(entry);
                        failErrors.push({
                            error: "Cannot delete read-only entry.",
                        });
                        return callback();
                    } else {
                        return this.deleteEntry(
                            entry._id,
                            false,
                            (err, deletedItem) => {
                                if (err) {
                                    failedItems.push(entry);
                                    failErrors.push(err);
                                    return callback();
                                } else {
                                    deletedItems.push(deletedItem);
                                    return callback();
                                }
                            }
                        );
                    }
                }
            );
        },
        (err) => {
            if (err) {
                return cb(err);
            }
            return cb(null, deletedItems, failedItems, failErrors);
        }
    );
};

repoSchema.methods.duplicateEntry = function (entryId, newname, overwrite, cb) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const Repo = require("../controllers/repo");
    const thisId = this._id;

    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else {
                return itemEntry.duplicate(newname, false, false, cb);
            }
        }
    );
};

repoSchema.methods.renameEntry = function (entryId, newname, overwrite, cb) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (typeof overwrite === "function") {
        cb = overwrite;
        overwrite = false;
    }

    const Repo = require("../controllers/repo");
    const thisId = this._id;

    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else {
                return itemEntry.renameTo(newname, overwrite, false, cb);
            }
        }
    );
};

repoSchema.methods.updateEntryAttributes = function (entryId, newAttrs, cb) {
    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else if (
                ![EntryType.VCDFile, EntryType.PCFFile].includes(
                    itemEntry.handler
                )
            ) {
                return cb({
                    error: "File does not support attribute updates.",
                });
            } else {
                return itemEntry.updateAttributes(newAttrs, cb);
            }
        }
    );
};

repoSchema.methods.updateEntryData = function (entryId, newData, cb) {
    const Repo = require("../controllers/repo");
    const thisId = this._id;

    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else if (itemEntry.handler !== EntryType.VCDFile) {
                return cb({
                    error: "Currently only VCD files can be updated.",
                });
            } else {
                return itemEntry.updateData(newData, cb);
            }
        }
    );
};

repoSchema.methods.updateFileContent = function (
    entryId,
    newContent,
    overwrite,
    force,
    cb
) {
    if (overwrite == null) {
        overwrite = false;
    }
    if (force == null) {
        force = false;
    }
    if (typeof force === "function") {
        cb = force;
        force = false;
    }
    const Repo = require("../controllers/repo");
    const thisId = this._id;

    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, itemEntry) {
            if (err) {
                return cb(err);
            } else if (!itemEntry) {
                return cb({
                    error: "Entry does not exist.",
                });
            } else if (itemEntry.handler === EntryType.NetlistFile) {
                if (!overwrite) {
                    return cb({
                        error: "Cannot save to a netlist file.",
                    });
                } else {
                    return itemEntry.updateContent(newContent, cb);
                }
            } else if (itemEntry.handler === EntryType.STA) {
                if (!overwrite) {
                    return cb({
                        error: "Cannot save to an STA.",
                    });
                } else {
                    return itemEntry.updateContent(newContent, cb);
                }
            } else if (itemEntry.handler === EntryType.VCDFile) {
                if (!overwrite) {
                    return cb({
                        error: "Cannot update VCD file.",
                    });
                } else {
                    return itemEntry.updateContent(newContent, cb);
                }
            } else if (itemEntry.handler === EntryType.SynthesisReport) {
                if (!overwrite) {
                    return cb({
                        error: "Cannot update synthesis report",
                    });
                } else {
                    return itemEntry.updateContent(newContent, cb);
                }
            } else if (itemEntry.handler === EntryType.FSM) {
                if (!validateFSM(newContent)) {
                    return cb({
                        error: "Invalid FSM file.",
                    });
                } else {
                    return itemEntry.updateContent(newContent, cb);
                }
            } else if (itemEntry.handler === EntryType.SOC) {
                if (!validateSOC(newContent)) {
                    return cb({
                        error: "Invalid SoC file.",
                    });
                } else {
                    return itemEntry.updateContent(newContent, cb);
                }
            } else if (!WriteableTypes.includes(itemEntry.handler)) {
                return cb({
                    error: "Entry not updateable.",
                });
            } else {
                return itemEntry.updateContent(newContent, cb);
            }
        }
    );
};

repoSchema.methods.isReadable = async function (userId, cb) {
    const Repo = require("../controllers/repo");
    return new Promise(async (resolve, reject) => {
        if (userId == null) {
            return resolve(this.privacy === PrivacyType.Public);
        }
        try {
            if (this.organizationalProject) {
                const { repository, role } = await Repo.accessRepo(
                    {
                        _id: this._id,
                    },
                    userId,
                    () => resolve(false)
                );
                return resolve(role >= AccessLevel.ReadOnly);
            } else {
                const role = await this.getRole(userId);
                return resolve(role >= AccessLevel.ReadOnly);
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.isWriteable = function (userId, cb) {
    const Repo = require("../controllers/repo");
    return new Promise(async (resolve, reject) => {
        if (userId == null) {
            return resolve(false);
        }
        try {
            if (this.organizationalProject) {
                const { repository, role } = await Repo.accessRepo(
                    {
                        _id: this._id,
                    },
                    userId,
                    () => resolve(false)
                );
                return resolve(role >= AccessLevel.ReadWrite);
            } else {
                const role = await this.getRole(userId);
                return resolve(role >= AccessLevel.ReadWrite);
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.setTopModule = function (entryId, module, cb) {
    const Repo = require("../controllers/repo");
    const Synthesizer = require("../modules/synthesizer");

    const thisId = this.id;

    return this.getEntry(
        {
            _id: entryId,
        },
        function (err, item) {
            if (err) {
                return cb(err);
            } else if (!item) {
                return cb({
                    error: "Cannot find the targeted item.",
                });
            } else if (item.handler !== EntryType.VerilogFile) {
                return cb({
                    error: "The target file is not a verilog module file.",
                });
            } else {
                return Parser.moduleExistsInFile(
                    entryId,
                    module,
                    function (err, exists) {
                        if (err) {
                            return cb(err);
                        } else if (!exists) {
                            return cb({
                                error: `Cannot find the module ${module} in ${item.title}.`,
                            });
                        } else {
                            return Repo.updateRepo(
                                {
                                    _id: thisId,
                                },
                                {
                                    topModule: module,
                                    topModuleEntry: item._id,
                                },
                                function (err, updatedRepo) {
                                    if (err) {
                                        return cb(err);
                                    } else {
                                        return cb(null, {
                                            name: updatedRepo.topModule,
                                            entry: updatedRepo.topModuleEntry,
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
};

repoSchema.methods.getRole = function (userId, cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoRole(this._id, userId, cb);
};

repoSchema.methods.getRoles = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoRoles(this._id, cb);
};

repoSchema.methods.getRoleEntry = function (query, cb) {
    if (query == null) {
        query = {};
    }
    const Repo = require("../controllers/repo");
    query.repo = this._id;
    return Repo.getRepoRoleEntry(query, cb);
};

repoSchema.methods.getRoleEntries = function (query, cb) {
    if (query == null) {
        query = {};
    }
    const Repo = require("../controllers/repo");
    query.repo = this._id;
    return Repo.getRepoRoleEntries(query, cb);
};

repoSchema.methods.getContributors = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoContributors(this, cb);
};

repoSchema.methods.authorize = async function (username, accessLevel, cb) {
    const User = require("../controllers/user");
    const Repo = require("../controllers/repo");
    const repoId = this._id;
    return new Promise(async (resolve, reject) => {
        try {
            const user = await User.getUser({
                username,
            });
            if (!user) {
                return reject({
                    error: `User ${username} does not exist.`,
                });
            }
            const role = await Repo.getRepoRoleEntry({
                repo: this._id,
                user: user._id,
            });
            if (!role) {
                return resolve({
                    role: await Repo.assignRole({
                        repo: this._id,
                        user: user._id,
                        accessLevel,
                    }),
                    user,
                });
            } else if (role === AccessLevel.Owner) {
                return reject({
                    error: "Cannot update owner's role.",
                });
            } else {
                return resolve({
                    role: await Repo.updateUserRole(
                        this._id,
                        user._id,
                        accessLevel,
                        cb
                    ),
                    user,
                });
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.deauthorize = async function (username, cb) {
    const User = require("../controllers/user");
    const Repo = require("../controllers/repo");
    const repoId = this._id;
    return new Promise(async (resolve, reject) => {
        try {
            const user = await User.getUser({
                username,
            });
            if (!user) {
                return reject({
                    error: `User ${username} does not exist.`,
                });
            }
            const role = await Repo.getRepoRoleEntry({
                repo: this._id,
                user: user._id,
            });
            if (!role) {
                return reject({
                    error: "Role does not exist.",
                });
            } else if (role === AccessLevel.Owner) {
                return reject({
                    error: "Cannot remove owner's role.",
                });
            } else {
                return resolve({
                    role: await Repo.removeRole(role._id),
                    user,
                });
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoSchema.methods.refresh = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.refreshRepo(this._id, cb);
};

repoSchema.methods.getFavorites = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoFavorites(this, cb);
};

repoSchema.methods.getWatches = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoWatches(this, cb);
};

repoSchema.methods.favorite = function (userId, cb) {
    const Repo = require("../controllers/repo");
    return Repo.favoriteRepo(this, userId, cb);
};

repoSchema.methods.watch = function (userId, cb) {
    const Repo = require("../controllers/repo");
    return Repo.watchRepo(this, userId, cb);
};

repoSchema.methods.isFavoritedFrom = function (userId, cb) {
    const Repo = require("../controllers/repo");
    return Repo.isRepoFavoritedFrom(this, userId, cb);
};

repoSchema.methods.isWatchedFrom = function (userId, cb) {
    const Repo = require("../controllers/repo");
    return Repo.isRepoWatchedFrom(this, userId, cb);
};

repoSchema.methods.update = function (updates, cb) {
    const Repo = require("../controllers/repo");
    return Repo.updateRepo(this._id, updates, cb);
};
repoSchema.methods.edit = function (updates, cb) {
    const Repo = require("../controllers/repo");
    return Repo.updateRepo(this._id, updates, cb);
};

repoSchema.methods.updateWorkspaceSettings = function (
    themeIndex,
    fontSize,
    cb
) {
    const Repo = require("../controllers/repo");
    return Repo.updateRepoWorkspaceSettings(this._id, themeIndex, fontSize, cb);
};

repoSchema.methods.getEntryByPath = function (entryPath, cb) {
    const thisRepo = this;
    const filesTree = entryPath
        .split("/")
        .filter((filePath) => filePath.trim() !== "");
    return this.getRoot(function (err, rootEntry) {
        if (err) {
            return cb(err);
        } else {
            const tasks = [];
            tasks.push(
                (
                    (fileName) => (callback) =>
                        thisRepo.getEntry(
                            {
                                parent: rootEntry._id,
                                title: fileName,
                            },
                            function (err, entry) {
                                if (err) {
                                    return callback(err);
                                } else {
                                    return callback(null, entry);
                                }
                            }
                        )
                )(filesTree[0])
            );

            filesTree.shift();

            filesTree.forEach(function (fileName, ind) {
                if (fileName == null || fileName.trim() === "") {
                    return;
                }
                return tasks.push(
                    ((fileTitle, isLast) =>
                        function (parentEntry, callback) {
                            if (parentEntry == null) {
                                return callback(null, null);
                            } else {
                                return thisRepo.getEntry(
                                    {
                                        parent: parentEntry._id,
                                        title: fileTitle,
                                    },
                                    function (err, entry) {
                                        if (err) {
                                            return callback(err);
                                        } else if (!entry) {
                                            return callback(null, null);
                                        } else {
                                            return callback(null, entry);
                                        }
                                    }
                                );
                            }
                        })(fileName, ind === filesTree.length - 1)
                );
            });
            return async.waterfall(tasks, function (err, result) {
                if (err) {
                    return cb(err);
                } else {
                    return cb(null, result);
                }
            });
        }
    });
};

repoSchema.methods.createVersion = function (versionData, cb) {
    const Repo = require("../controllers/repo");
    return Repo.createRepoVersion(
        {
            _id: this._id,
        },
        versionData,
        cb
    );
};

repoSchema.methods.getVersions = function (cb) {
    const Repo = require("../controllers/repo");
    return Repo.getRepoVersions(
        {
            repo: this._id,
        },
        cb
    );
};

repoSchema.methods.getVersion = function (query, cb) {
    query.repo = this._id;
    const Repo = require("../controllers/repo");
    return Repo.getRepoVersion(query, cb);
};

promisifyMethods(repoSchema);

module.exports = {
    model: mongoose.model("Repo", repoSchema),
    PrivacyType,
    AllowReviews,
};
