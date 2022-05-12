const promisifyMethods = require("./_promisify_methods");

const mongoose = require("../config/db");

const _ = require("underscore");
const { Schema } = require("mongoose");

const { ObjectId } = Schema;

const EntryType = {
    UnkownEntry: 0,
    RepoRoot: 1,
    Folder: 2,
    TextFile: 3,
    VerilogFile: 4,
    NetlistFile: 5,
    TestbenchFile: 6,
    VCDFile: 7,
    VVPFile: 8,
    ImageFile: 9,
    BinaryFile: 10,
    FSM: 11,
    STA: 12,
    SynthesisReport: 13,
    IP: 14,
    PCFFile: 15,
    SOC: 16,
    SYS: 17,
    CFile: 18,
    HFile: 19,
    OBJFile: 20,
    HEXFile: 21,
    LinkerScript: 22,
    StartupScript: 23,
    DCFFile: 24,
    SVGFile: 25,
};

const ReadbleTypes = [
    EntryType.TextFile,
    EntryType.VerilogFile,
    EntryType.TestbenchFile,
    EntryType.NetlistFile,
    EntryType.FSM,
    EntryType.SOC,
    EntryType.SYS,
    EntryType.STA,
    EntryType.SynthesisReport,
    EntryType.IP,
    EntryType.PCFFile,
    EntryType.CFile,
    EntryType.HFile,
    EntryType.StartupScript,
    EntryType.LinkerScript,
    EntryType.OBJFile,
    EntryType.HEXFile,
    EntryType.DCFFile,
];
const WriteableTypes = [
    EntryType.VerilogFile,
    EntryType.TestbenchFile,
    EntryType.TextFile,
    EntryType.CFile,
    EntryType.HFile,
    EntryType.TextFile,
    EntryType.PCFFile,
    EntryType.DCFFile,
    EntryType.BinaryFile,
    EntryType.StartupScript,
    EntryType.LinkerScript,
];

const EntryAccess = {
    NoRead: 0,
    ReadOnly: 1,
    ReadWrite: 2,
};

const EntrySource = {
    User: 0,
    Generated: 1,
};

const EntryState = {
    Ready: 0,
    Pending: 1,
    Failed: 2,
};

const { wrapResolveCallback } = require("../modules/utils");

const repoEntrySchema = new Schema(
    {
        repo: {
            type: ObjectId,
            required: true,
            ref: "Repo",
        },
        user: {
            type: ObjectId,
            required: true,
            ref: "User",
        },
        handler: {
            type: Number,
            required: true,
            default: EntryType.UnkownEntry,
        },
        parent: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        remoteParent: {
            type: ObjectId,
            ref: "RepoEntry",
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        data: {
            type: String,
            default: "",
        },
        access: {
            type: Number,
            default: EntryAccess.ReadWrite,
            required: true,
        },
        source: {
            type: Number,
            default: EntrySource.User,
            required: true,
        },
        anchor: {
            type: Boolean,
            default: false,
            required: true,
        },
        synthesize: {
            type: Boolean,
            default: false,
            required: true,
        },
        included: {
            type: Boolean,
            default: true,
            required: true,
        },
        attributes: {
            type: String,
            default: "",
            required: false,
        },
        state: {
            type: Number,
            default: EntryState.Ready,
            enum: _.values(EntryState),
            required: true,
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

repoEntrySchema.path("handler").validate(function (handler) {
    let needle;
    return (
        (needle = handler),
        Array.from(
            (() => {
                const result = [];
                for (let key in EntryType) {
                    const value = EntryType[key];
                    result.push(value);
                }
                return result;
            })()
        ).includes(needle)
    );
}, "Invalid handler.");

repoEntrySchema.path("access").validate(function (access) {
    let needle;
    return (
        (needle = access),
        Array.from(
            (() => {
                const result = [];
                for (let key in EntryAccess) {
                    const value = EntryAccess[key];
                    result.push(value);
                }
                return result;
            })()
        ).includes(needle)
    );
}, "Invalid access type.");

repoEntrySchema.path("source").validate(function (source) {
    let needle;
    return (
        (needle = source),
        Array.from(
            (() => {
                const result = [];
                for (let key in EntrySource) {
                    const value = EntrySource[key];
                    result.push(value);
                }
                return result;
            })()
        ).includes(needle)
    );
}, "Invalid source type.");
repoEntrySchema.virtual("isFolder").get(function () {
    return this.handler === EntryType.Folder;
});
repoEntrySchema.virtual("isRoot").get(function () {
    return this.handler === EntryType.RepoRoot;
});
repoEntrySchema.virtual("excluded").get(function () {
    return !this.included;
});
repoEntrySchema.virtual("handlerName").get(function () {
    if (this.handler === EntryType.BinaryFile) {
        return "bin";
    }
    if (this.handler === EntryType.SynthesisReport) {
        return "srpt";
    }
    if (this.handler === EntryType.StartupScript) {
        return "startup";
    }
    if (this.handler === EntryType.LinkerScript) {
        return "linker";
    }
    for (let k in EntryType) {
        const v = EntryType[k];
        if (this.handler === v) {
            return k.replace(/file/i, "").replace(/repo/i, "").toLowerCase();
        }
    }
    return "unkown";
});

repoEntrySchema.virtual("prefixedName").get(function () {
    if (this.state === EntryState.Ready) {
        return this.handlerName;
    } else if (this.state === EntryState.Pending) {
        return `p_${this.handlerName}`;
    } else if (this.state === EntryState.Failed) {
        return `f_${this.handlerName}`;
    }
});

repoEntrySchema.virtual("includable").get(function () {
    return [
        EntryType.VerilogFile,
        EntryType.IP,
        EntryType.CFile,
        EntryType.HFile,
        EntryType.Folder,
    ].includes(this.handler);
});

repoEntrySchema.methods.isReadableFile = function () {
    return Array.from(ReadbleTypes).includes(this.handler);
};

repoEntrySchema.methods.moveTo = function (parentId, overwrite, force, cb) {
    if (this.parent === parentId) {
        return cb({
            error: "Cannot move to the same parent.",
        });
    }

    if (typeof force === "function") {
        cb = force;
        force = false;
    }

    const Repo = require("../controllers/repo");
    const FileManager = require("../controllers/file_manager");

    const thisId = this._id;
    const thisTitle = this.title;
    const thisParent = this.parent;
    const thisParentRepo = this.repo;
    const thisSource = this.source;

    if (this.handler === EntryType.RepoRoot) {
        return cb({
            error: "Cannot move root item.",
        });
    } else {
        return Repo.getRepoEntry(
            {
                _id: parentId,
                repo: thisParentRepo,
            },
            function (err, parentEntry) {
                if (err) {
                    return cb(err);
                } else if (!parentEntry) {
                    return cb({
                        error: "Cannot find parent item.",
                    });
                } else if (
                    ![EntryType.RepoRoot, EntryType.Folder].includes(
                        parentEntry.handler
                    )
                ) {
                    return cb({
                        error: "Parent item should be a folder.",
                    });
                } else if (
                    parentEntry.access !== EntryAccess.ReadWrite &&
                    !force
                ) {
                    return cb({
                        error: "Cannot move to a read-only directory.",
                    });
                } else if (thisSource === EntrySource.Generated && !force) {
                    return cb({
                        error: "Cannot move generated entry.",
                    });
                } else {
                    return Repo.getRepoEntry(
                        {
                            title: thisTitle,
                            parent: parentEntry._id,
                        },
                        function (err, existingEntry) {
                            if (err) {
                                return cb(err);
                            } else if (existingEntry) {
                                if (!overwrite) {
                                    return cb({
                                        error: "An entry with the same name already exists.",
                                    });
                                } else {
                                    return Repo.getRepoEntry(
                                        {
                                            _id: thisId,
                                        },
                                        function (err, currentEntry) {
                                            if (err || !currentEntry) {
                                                return cb(
                                                    err || {
                                                        error: "Cannot find the source entry.",
                                                    }
                                                );
                                            } else {
                                                return Repo.deleteRepoEntry(
                                                    existingEntry._id,
                                                    function (
                                                        err,
                                                        deletedEntry
                                                    ) {
                                                        if (err) {
                                                            return cb(err);
                                                        } else {
                                                            return Repo.updateRepoEntry(
                                                                currentEntry._id,
                                                                {
                                                                    parent: parentEntry._id,
                                                                },
                                                                function (
                                                                    err,
                                                                    updatedItem
                                                                ) {
                                                                    if (err) {
                                                                        return cb(
                                                                            err
                                                                        );
                                                                    } else {
                                                                        return cb(
                                                                            null,
                                                                            updatedItem
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
                            } else {
                                return Repo.getRepoEntry(
                                    {
                                        _id: thisId,
                                    },
                                    function (err, currentEntry) {
                                        if (err || !currentEntry) {
                                            return cb(
                                                err || {
                                                    error: "Cannot find the source entry.",
                                                }
                                            );
                                        } else {
                                            return Repo.updateRepoEntry(
                                                currentEntry._id,
                                                {
                                                    parent: parentEntry._id,
                                                },
                                                function (err, updatedItem) {
                                                    if (err) {
                                                        return cb(err);
                                                    } else {
                                                        return cb(
                                                            null,
                                                            updatedItem
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
};

repoEntrySchema.methods.copyTo = function (parentId, overwrite, force, cb) {
    if (this.parent === parentId) {
        return cb({
            error: "Cannot copy to the same parent.",
        });
    }

    if (typeof force === "function") {
        cb = force;
        force = false;
    }

    const Repo = require("../controllers/repo");
    const FileManager = require("../controllers/file_manager");

    const thisId = this._id;
    const thisTitle = this.title;
    const thisParentRepo = this.repo;
    const thisSource = this.source;

    if (this.handler === EntryType.RepoRoot) {
        return cb({
            error: "Cannot copy root item.",
        });
    } else {
        return Repo.getRepoEntry(
            {
                _id: parentId,
                repo: thisParentRepo,
            },
            function (err, parentEntry) {
                if (err) {
                    return cb(err);
                } else if (!parentEntry) {
                    return cb({
                        error: "Cannot find parent item.",
                    });
                } else if (
                    ![EntryType.RepoRoot, EntryType.Folder].includes(
                        parentEntry.handler
                    )
                ) {
                    return cb({
                        error: "Parent item should be a folder.",
                    });
                } else if (
                    parentEntry.access !== EntryAccess.ReadWrite &&
                    !force
                ) {
                    return cb({
                        error: "Cannot copy to a read-only directory.",
                    });
                } else if (thisSource === EntrySource.Generated && !force) {
                    return cb({
                        error: "Cannot copy generated entry.",
                    });
                } else {
                    return Repo.getRepoEntry(
                        {
                            title: thisTitle,
                            parent: parentEntry._id,
                        },
                        function (err, existingEntry) {
                            if (err) {
                                return cb(err);
                            } else if (existingEntry) {
                                if (!overwrite) {
                                    return cb({
                                        error: "An entry with the same name already exists.",
                                    });
                                } else {
                                    return Repo.getRepoEntry(
                                        {
                                            _id: thisId,
                                        },
                                        function (err, currentEntry) {
                                            if (err || !currentEntry) {
                                                return cb(
                                                    err || {
                                                        error: "Cannot find the source entry.",
                                                    }
                                                );
                                            } else {
                                                const newEntry = {
                                                    repo: currentEntry.repo,
                                                    user: currentEntry.user,
                                                    handler:
                                                        currentEntry.handler,
                                                    parent: parentEntry._id,
                                                    remoteParent: null,
                                                    title: currentEntry.title,
                                                    description:
                                                        currentEntry.description,
                                                    data: currentEntry.data,
                                                    access: currentEntry.access,
                                                    source: currentEntry.source,
                                                    anchor: currentEntry.anchor,
                                                    synthesize:
                                                        currentEntry.synthesize,
                                                    included:
                                                        currentEntry.included,
                                                    attributes:
                                                        currentEntry.attributes,
                                                };

                                                return Repo.createRepoEntry(
                                                    newEntry,
                                                    overwrite,
                                                    function (
                                                        err,
                                                        createdEntry
                                                    ) {
                                                        if (err) {
                                                            return cb(err);
                                                        } else {
                                                            return FileManager.duplicateFile(
                                                                createdEntry,
                                                                currentEntry,
                                                                function (
                                                                    err,
                                                                    duplicatedFile
                                                                ) {
                                                                    if (err) {
                                                                        createdEntry.remove(
                                                                            function (
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
                                                                        return cb(
                                                                            err
                                                                        );
                                                                    } else {
                                                                        return Repo.deleteRepoEntry(
                                                                            existingEntry._id,
                                                                            function (
                                                                                err,
                                                                                deletedEntry
                                                                            ) {
                                                                                if (
                                                                                    err
                                                                                ) {
                                                                                    createdEntry.remove(
                                                                                        function (
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
                                                                                    return cb(
                                                                                        err
                                                                                    );
                                                                                } else {
                                                                                    return cb(
                                                                                        null,
                                                                                        createdEntry
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
                            } else {
                                return Repo.getRepoEntry(
                                    {
                                        _id: thisId,
                                    },
                                    function (err, currentEntry) {
                                        if (err || !currentEntry) {
                                            return cb(
                                                err || {
                                                    error: "Cannot find the source entry.",
                                                }
                                            );
                                        } else {
                                            const newEntry = {
                                                repo: currentEntry.repo,
                                                user: currentEntry.user,
                                                handler: currentEntry.handler,
                                                parent: parentEntry._id,
                                                remoteParent: null,
                                                title: currentEntry.title,
                                                description:
                                                    currentEntry.description,
                                                data: currentEntry.data,
                                                access: currentEntry.access,
                                                source: currentEntry.source,
                                                anchor: currentEntry.anchor,
                                                synthesize:
                                                    currentEntry.synthesize,
                                                included: currentEntry.included,
                                                attributes:
                                                    currentEntry.attributes,
                                            };

                                            return Repo.createRepoEntry(
                                                newEntry,
                                                overwrite,
                                                function (err, createdEntry) {
                                                    if (err) {
                                                        return cb(err);
                                                    } else {
                                                        return FileManager.duplicateFile(
                                                            createdEntry,
                                                            currentEntry,
                                                            function (
                                                                err,
                                                                duplicatedFile
                                                            ) {
                                                                if (err) {
                                                                    createdEntry.remove(
                                                                        function (
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
                                                                    return cb(
                                                                        err
                                                                    );
                                                                } else {
                                                                    return cb(
                                                                        null,
                                                                        createdEntry
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
    }
};

repoEntrySchema.methods.duplicate = function (newname, overwrite, force, cb) {
    if (
        ![
            EntryType.VerilogFile,
            EntryType.TestbenchFile,
            EntryType.TextFile,
            EntryType.ImageFile,
            EntryType.BinaryFile,
        ].includes(this.handler)
    ) {
        return cb({
            error: "Cannot duplicate the item inside the current location.",
        });
    }

    if (this.source === EntrySource.Generated && !force) {
        return cb({
            error: "Cannot move generated entry.",
        });
    }

    if (typeof force === "function") {
        cb = force;
        force = false;
    }

    const Repo = require("../controllers/repo");
    const FileManager = require("../controllers/file_manager");

    const thisId = this._id;
    const thisParent = this.parent;
    const thisParentRepo = this.repo;

    if (this.handler === EntryType.RepoRoot) {
        return cb({
            error: "Cannot copy root item.",
        });
    } else {
        return Repo.getRepoEntry(
            {
                title: newname,
                repo: thisParentRepo,
            },
            function (err, existingEntry) {
                if (err) {
                    return cb(err);
                } else if (existingEntry) {
                    if (!overwrite) {
                        return cb({
                            error: `An entry with the name '${newname}' already exists.`,
                        });
                    } else {
                        return Repo.getRepoEntry(
                            {
                                _id: thisId,
                            },
                            function (err, currentEntry) {
                                if (err || !currentEntry) {
                                    return cb(
                                        err || {
                                            error: "Cannot find the source entry.",
                                        }
                                    );
                                } else {
                                    const newEntry = {
                                        repo: currentEntry.repo,
                                        user: currentEntry.user,
                                        handler: currentEntry.handler,
                                        parent: thisParent,
                                        remoteParent: null,
                                        title: newname,
                                        description: currentEntry.description,
                                        data: currentEntry.data,
                                        access: currentEntry.access,
                                        source: currentEntry.source,
                                        anchor: currentEntry.anchor,
                                        synthesize: currentEntry.synthesize,
                                        included: currentEntry.included,
                                        attributes: currentEntry.attributes,
                                    };

                                    return Repo.createRepoEntry(
                                        newEntry,
                                        overwrite,
                                        function (err, createdEntry) {
                                            if (err) {
                                                return cb(err);
                                            } else {
                                                return FileManager.duplicateFile(
                                                    createdEntry,
                                                    currentEntry,
                                                    function (
                                                        err,
                                                        duplicatedFile
                                                    ) {
                                                        if (err) {
                                                            createdEntry.remove(
                                                                function (err) {
                                                                    if (err) {
                                                                        return console.error(
                                                                            err
                                                                        );
                                                                    }
                                                                }
                                                            );
                                                            return cb(err);
                                                        } else {
                                                            return Repo.deleteRepoEntry(
                                                                existingEntry._id,
                                                                function (
                                                                    err,
                                                                    deletedEntry
                                                                ) {
                                                                    if (err) {
                                                                        createdEntry.remove(
                                                                            function (
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
                                                                        return cb(
                                                                            err
                                                                        );
                                                                    } else {
                                                                        return cb(
                                                                            null,
                                                                            createdEntry
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
                } else {
                    return Repo.getRepoEntry(
                        {
                            _id: thisId,
                        },
                        function (err, currentEntry) {
                            if (err || !currentEntry) {
                                return cb(
                                    err || {
                                        error: "Cannot find the source entry.",
                                    }
                                );
                            } else {
                                const newEntry = {
                                    repo: currentEntry.repo,
                                    user: currentEntry.user,
                                    handler: currentEntry.handler,
                                    parent: thisParent,
                                    remoteParent: null,
                                    title: newname,
                                    description: currentEntry.description,
                                    data: currentEntry.data,
                                    access: currentEntry.access,
                                    source: currentEntry.source,
                                    anchor: currentEntry.anchor,
                                    synthesize: currentEntry.synthesize,
                                    included: currentEntry.included,
                                    attributes: currentEntry.attributes,
                                };

                                return Repo.createRepoEntry(
                                    newEntry,
                                    overwrite,
                                    function (err, createdEntry) {
                                        if (err) {
                                            return cb(err);
                                        } else {
                                            return FileManager.duplicateFile(
                                                createdEntry,
                                                currentEntry,
                                                function (err, duplicatedFile) {
                                                    if (err) {
                                                        createdEntry.remove(
                                                            function (err) {
                                                                if (err) {
                                                                    return console.error(
                                                                        err
                                                                    );
                                                                }
                                                            }
                                                        );
                                                        return cb(err);
                                                    } else {
                                                        return cb(
                                                            null,
                                                            createdEntry
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
};

repoEntrySchema.methods.renameTo = function (newname, overwrite, force, cb) {
    if (typeof force === "function") {
        cb = force;
        force = false;
    }

    const Repo = require("../controllers/repo");
    const FileManager = require("../controllers/file_manager");

    const thisId = this.id;
    const thisParentRepo = this.repo;
    const thisHandler = this.handler;

    return Repo.getRepoEntry(
        {
            _id: thisId,
        },
        function (err, currentEntry) {
            if (err) {
                return cb(err);
            } else if (!currentEntry) {
                return cb({
                    error: "Cannot find the source item.",
                });
            } else {
                return FileManager.getFileEntry(
                    {
                        repoEntry: thisId,
                    },
                    function (err, fsEntry) {
                        if (err) {
                            return cb(err);
                        } else if (fsEntry) {
                            if (
                                fsEntry.extension != null &&
                                fsEntry.extension.length > 0
                            ) {
                                const suffix = `.${fsEntry.extension}`;
                                if (
                                    newname.indexOf(
                                        suffix,
                                        newname.length - suffix.length
                                    ) !== -1
                                ) {
                                    newname = newname.substring(
                                        0,
                                        newname.length - suffix.length
                                    );
                                }
                                if (newname.trim().length === 0) {
                                    return cb({
                                        error: "Invalid filename.",
                                    });
                                }
                                newname = newname + suffix;
                            }
                        }
                        return Repo.getRepoEntry(
                            {
                                title: newname,
                                parent: thisParentRepo,
                            },
                            function (err, existingEntry) {
                                if (err) {
                                    return cb(err);
                                } else if (existingEntry) {
                                    if (!overwrite) {
                                        return cb({
                                            error: "An entry with the same name already exists.",
                                        });
                                    } else {
                                        return Repo.updateRepoEntry(
                                            currentEntry,
                                            {
                                                title: newname,
                                            },
                                            function (err, updatedEntry) {
                                                if (err) {
                                                    return cb(err);
                                                } else {
                                                    if (
                                                        thisHandler ===
                                                        EntryType.Folder
                                                    ) {
                                                        return Repo.deleteRepoEntry(
                                                            existingEntry._id,
                                                            function (
                                                                err,
                                                                deletedEntry
                                                            ) {
                                                                if (err) {
                                                                    return cb(
                                                                        err
                                                                    );
                                                                } else {
                                                                    return cb(
                                                                        null,
                                                                        updatedEntry
                                                                    );
                                                                }
                                                            }
                                                        );
                                                    } else {
                                                        return FileManager.renameFile(
                                                            currentEntry,
                                                            newname,
                                                            function (
                                                                err,
                                                                updateFileEntry
                                                            ) {
                                                                if (err) {
                                                                    return cb(
                                                                        err
                                                                    );
                                                                } else {
                                                                    return Repo.deleteRepoEntry(
                                                                        existingEntry._id,
                                                                        function (
                                                                            err,
                                                                            deletedEntry
                                                                        ) {
                                                                            if (
                                                                                err
                                                                            ) {
                                                                                return cb(
                                                                                    err
                                                                                );
                                                                            } else {
                                                                                return cb(
                                                                                    null,
                                                                                    updatedEntry
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
                                    }
                                } else {
                                    return Repo.updateRepoEntry(
                                        currentEntry,
                                        {
                                            title: newname,
                                        },
                                        function (err, updatedEntry) {
                                            if (err) {
                                                return cb(err);
                                            } else {
                                                if (
                                                    thisHandler ===
                                                    EntryType.Folder
                                                ) {
                                                    return cb(
                                                        null,
                                                        updatedEntry
                                                    );
                                                } else {
                                                    return FileManager.renameFile(
                                                        currentEntry,
                                                        newname,
                                                        function (
                                                            err,
                                                            updateFileEntry
                                                        ) {
                                                            if (err) {
                                                                return cb(err);
                                                            } else {
                                                                return cb(
                                                                    null,
                                                                    updatedEntry
                                                                );
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
                );
            }
        }
    );
};

repoEntrySchema.methods.deleteEntry = async function (force, cb) {
    const Repo = require("../controllers/repo");
    if (typeof force === "function") {
        cb = force;
        force = false;
    }
    return new Promise(async (resolve, reject) => {
        if (this.handler === EntryType.RepoRoot) {
            if (!force) {
                return reject({
                    error: "Cannot remove repository root entry",
                });
            } else {
                // console.warn('Warning, removing root entry!');
            }
        }

        if (this.anchor) {
            if (!force) {
                return reject({
                    error: "Cannot remove anchor entry.",
                });
            } else {
                // console.warn('Warning, removing anchor entry!');
            }
        }
        try {
            const deletedFile = await Repo.deleteRepoEntry(this._id);
            return resolve(this);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoEntrySchema.methods.getContent = function (cb) {
    const FileManager = require("../controllers/file_manager");
    return FileManager.getFileContent(this, cb);
};

repoEntrySchema.methods.getChildren = async function (
    query = {},
    format = "json",
    cb
) {
    const Repo = require("../controllers/repo");
    if (typeof format === "function") {
        cb = format;
        format = "json";
    }
    format = format.toLowerCase();
    query.parent = this._id;
    return new Promise(async (resolve, reject) => {
        try {
            const entries = await Repo.getRepoEntries(query);
            if (format === "dhtmlx") {
                return resolve(Repo.formatDhtmlx(entries, this));
            } else if (format === "json") {
                return resolve(entries);
            } else {
                return reject({
                    error: "Unkwon requested format.",
                });
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

repoEntrySchema.methods.updateAttributes = function (content, cb) {
    const Repo = require("../controllers/repo");
    return Repo.updateEntryAttributes(this._id, content, cb);
};

repoEntrySchema.methods.updateData = function (content, cb) {
    const Repo = require("../controllers/repo");
    return Repo.updateEntryData(this._id, content, cb);
};

repoEntrySchema.methods.updateContent = function (content, cb) {
    const Repo = require("../controllers/repo");
    return Repo.updateEntryContent(this._id, content, cb);
};

repoEntrySchema.methods.includeInBuild = function (cb) {
    const Repo = require("../controllers/repo");

    if (!this.includable) {
        return cb({
            error: "Operation not applicaple.",
        });
    }

    return Repo.updateRepoEntry(
        this._id,
        {
            included: true,
        },
        cb
    );
};

repoEntrySchema.methods.convertIntoTestbench = function (cb) {
    const Repo = require("../controllers/repo");

    if (this.handler !== EntryType.VerilogFile) {
        return cb({
            error: "Operation should only be done on verilog modules.",
        });
    }

    return Repo.updateRepoEntry(
        this._id,
        {
            included: true,
            handler: EntryType.TestbenchFile,
        },
        cb
    );
};

repoEntrySchema.methods.convertIntoVerilog = function (cb) {
    const Repo = require("../controllers/repo");

    if (this.handler !== EntryType.TestbenchFile) {
        return cb({
            error: "Operation should only be done on testbenches.",
        });
    }

    return Repo.updateRepoEntry(
        this._id,
        {
            included: true,
            handler: EntryType.VerilogFile,
        },
        cb
    );
};

repoEntrySchema.methods.excludeFromBuild = function (cb) {
    const Repo = require("../controllers/repo");

    if (!this.includable) {
        return cb({
            error: "Operation not applicaple.",
        });
    }

    return Repo.updateRepoEntry(
        this._id,
        {
            included: false,
        },
        cb
    );
};

repoEntrySchema.methods.setState = function (state, cb) {
    const Repo = require("../controllers/repo");

    return Repo.updateRepoEntry(
        this._id,
        {
            state,
        },
        cb
    );
};

repoEntrySchema.methods.setFailed = function (cb) {
    return this.setState(EntryState.Failed, cb);
};

repoEntrySchema.methods.setPending = function (cb) {
    return this.setState(EntryState.Pending, cb);
};

repoEntrySchema.methods.setReady = function (cb) {
    return this.setState(EntryState.Ready, cb);
};

promisifyMethods(repoEntrySchema);

module.exports = {
    model: mongoose.model("RepoEntry", repoEntrySchema),
    EntryType,
    EntryAccess,
    EntryState,
    EntrySource,
    ReadbleTypes,
    WriteableTypes,
};
