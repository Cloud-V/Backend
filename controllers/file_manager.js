const config = require("../config");
const mongoose = require("../config/db");
const dbfs = require("../config/dbfs");
const Utils = require("../models/utils");
const { EntryType } = require("../models/repo_entry");

const _ = require("underscore");
const fs = require("fs-extra");
const tmp = require("tmp");
const Grid = require("../modules/gridfs-stream-local/Grid");

const rmdir = require("rimraf");
const async = require("async");
const shortid = require("shortid");
const ZipArchive = require("adm-zip");

const path = require("path");
const { Readable } = require("stream");

const {
    wrapResolveCallback,
    handleMongooseError,
    getMongooseId,
    promiseSeries
} = require("../modules/utils");

const createFile = async (repoEntry, fileData, content = "", cb) => {
    const fileModel = require("../models/repo_file").model;
    return new Promise(async (resolve, reject) => {
        const fsName =
            shortid.generate() + "_" + Date.now() + "." + fileData.extension;
        let newFileEntry = new fileModel({
            repo: repoEntry.repo,
            user: repoEntry.user,
            repoEntry: repoEntry._id,
            fileName: fsName,
            baseName: fileData.originalname,
            mimeType: fileData.mimetype,
            encoding: fileData.encoding,
            extension: fileData.extension
        });

        const gfs = new Grid();
        // const inputStream = new Readable();
        // inputStream.push(content);
        // inputStream.push(null);
        const outputSteam = gfs.createWriteStream({
            filename: fsName
        });
        // inputStream.pipe(outputSteam);

        outputSteam.write(content);

        outputSteam.on("error", function (err) {
            if (err === undefined) {
                return
            }
            console.error(err);
            return reject({
                error: "An error occurred while writing the file."
            });
        });

        outputSteam.on("close", async file => {
            newFileEntry.fsId = file._id;
            try {
                newFileEntry = await newFileEntry.save();
                return resolve(newFileEntry);
            } catch (err) {
                return reject(
                    handleMongooseError(
                        err,
                        "An error occurred while creating the file entry."
                    )
                );
            }
        });
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

// Buffer takes precedence over path.
const createMediaFile = async ({ path, buffer }, metadata, cb) => {
    const fileModel = require("../models/media_file").model;
    return new Promise(async (resolve, reject) => {
        let filePath = path;
        if (buffer) {
            filePath = tmp.tmpNameSync();
            fs.writeFileSync(filePath, buffer);
        }
        const fsName = shortid.generate() + "_" + Date.now() + "." + metadata.extension;
        let newFileEntry = new fileModel({
            user: metadata.user,
            baseName: metadata.originalname,
            mimeType: metadata.mimetype,
            encoding: metadata.encoding,
            extension: metadata.extension
        });

        const gfs = new Grid();

        const inputStream = fs.createReadStream(filePath);
        const outputStream = gfs.createWriteStream({
            filename: fsName
        });
        inputStream.pipe(outputStream);

        outputStream.on("error", async err => {
            if (err === undefined) {
                return
            }
            buffer && await fs.unlink(filePath);
            console.error(err);
            return reject({
                error: "An error occurred while writing the file."
            });
        });

        outputStream.on("close", async file => {
            buffer && await fs.unlink(filePath);
            newFileEntry.fsId = file._id;
            try {
                newFileEntry = await newFileEntry.save();
                return resolve(newFileEntry);
            } catch (err) {
                return reject(
                    handleMongooseError(
                        err,
                        "An error occurred while creating the file entry."
                    )
                );
            }
        });
        return;
    }).then(wrapResolveCallback(cb)).catch(cb);
};

const duplicateFile = async (copiedItem, oldItem, cb) => {
    const { model: fileModel } = require("../models/repo_file");

    return new Promise(async (resolve, reject) => {
        try {
            const fileData = await getFileEntry({
                repoEntry: oldItem._id
            });
            if (!fileData) {
                return resolve(true);
            }
            const content = await getFileContent(oldItem);
            if (typeof content === "undefined") {
                return reject({
                    error: "Undefined!"
                });
            }
            const fsName =
                shortid.generate() +
                "_" +
                Date.now() +
                "." +
                fileData.extension;
            const newFileEntry = new fileModel({
                repo: copiedItem.repo,
                user: copiedItem.user,
                repoEntry: copiedItem._id,
                fileName: fsName,
                baseName: fileData.baseName,
                mimeType: fileData.mimeType,
                encoding: fileData.encoding,
                extension: fileData.extension
            });

            const gfs = new Grid();

            const inputStream = new Readable();
            inputStream.push(content);
            inputStream.push(null);
            const outputSteam = gfs.createWriteStream({
                filename: fsName
            });
            inputStream.pipe(outputSteam);

            outputSteam.on("error", function (err) {
                if (err === undefined) {
                    return
                }
                console.error(err);
                return reject({
                    error: "An error occurred while writing the file."
                });
            });
            outputSteam.on("close", async file => {
                newFileEntry.fsId = file._id;
                try {
                    await newFileEntry.save();
                    return resolve(newFileEntry);
                } catch (err) {
                    return reject(
                        handleMongooseError(
                            err,
                            "An error occurred while creating the file entry."
                        )
                    );
                }
            });
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const clearFileEntry = async (repoEntry, cb) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fileEntry = await getFileEntry({
                repoEntry: repoEntry._id
            });
            if (!fileEntry) {
                return resolve(true);
            }
            console.error("Here X")
            await clearFile(fileEntry.fsId);
            console.error("Here 2X")
            const deletedEntry = await updateFileEntry(fileEntry._id, {
                deleted: true
            });
            console.error("Here 3X")
            return resolve(deletedEntry);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const clearMediaFileEntry = async (mediaEntry, cb) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fileEntry = await getMediaFileEntry({
                _id: getMongooseId(mediaEntry)
            });
            if (!fileEntry) {
                return resolve(true);
            }
            await clearFile(fileEntry.fsId);
            const deletedEntry = await updateMediaFileEntry(fileEntry._id, {
                deleted: true
            });
            return resolve(deletedEntry);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const updateFile = (repoEntry, newContent, cb) => {
    getFileEntry(
        {
            repoEntry: repoEntry._id
        },
        function (err, fileEntry) {
            if (err) {
                return cb(err);
            } else if (!fileEntry) {
                return cb({
                    error: "File not found!"
                });
            } else {

                const gfs = new Grid();
                const fsName =
                    shortid.generate() +
                    "_" +
                    Date.now() +
                    "." +
                    fileEntry.extension;
                const inputStream = new Readable();
                inputStream.push(newContent);
                inputStream.push(null);
                const outputSteam = gfs.createWriteStream({
                    filename: fsName
                });
                inputStream.pipe(outputSteam);

                outputSteam.on("error", function (err) {
                    if (err === undefined) {
                        return
                    }
                    console.error(err);
                    return cb({
                        error: "An error occurred while writing the file."
                    });
                });

                outputSteam.on("close", function (file) {
                    const oldFsId = fileEntry.fsId;
                    updateFileEntry(
                        fileEntry._id,
                        {
                            fsId: file._id
                        },
                        function (err, saveEntry) {
                            if (err) {
                                return cb(err);
                            } else {
                                cb(null, fileEntry);
                                return clearFile(oldFsId, function (err) {
                                    if (err) {
                                        return console.error(err);
                                    }
                                });
                            }
                        }
                    );
                });
                return;
            }
        }
    );
}

var clearFile = async (fsId, cb) => {
    return new Promise(async (resolve, reject) => {
        const gfs = new Grid();
        gfs.remove(
            {
                _id: fsId
            },
            function (err) {
                if (err) {
                    return reject({
                        error: "Failed to remove the file."
                    });
                } else {
                    return resolve(null);
                }
            }
        );
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const checkFileExistence = (repoEntry, cb) => {
    getFileEntry(
        {
            repoEntry: repoEntry._id
        },
        function (err, fileEntry) {
            if (err) {
                return cb(err);
            } else if (!fileEntry) {
                return cb({
                    error: "File entry not found!"
                });
            } else {
                return fileExists(fileEntry.fsId, cb);
            }
        }
    );
}

var fileExists = function (fsId, cb) {

    const gfs = new Grid();
    return gfs.exist(
        {
            _id: fsId
        },
        function (err, found) {
            if (err) {
                console.error(err);
                return cb({
                    error: "Failed to check for file existence."
                });
            } else {
                return cb(null, found);
            }
        }
    );
};

const updateFileEntry = async (entryId, updates, cb) => {
    return new Promise(async (resolve, reject) => {
        entryId = getMongooseId(entryId);
        try {
            let entry = await getFileEntry({
                _id: entryId
            });
            if (!entry) {
                return reject({
                    error: "Cannot find targeted entry."
                });
            }
            const validPaths = _.pickSchema(
                require("../models/repo_file").model,
                Utils.nonCloneable
            );
            updates = _.pick(updates, validPaths);
            entry = _.extend(entry, updates);
            let savedEntry;
            try {
                savedEntry = await entry.save();
            } catch (err) {
                return reject(
                    handleMongooseError(
                        err,
                        "An error occurred while updating the file."
                    )
                );
            }
            return resolve(savedEntry);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const updateMediaFileEntry = async (entryId, updates, cb) => {
    return new Promise(async (resolve, reject) => {
        entryId = getMongooseId(entryId);
        try {
            let entry = await getMediaFileEntry({
                _id: entryId
            });
            if (!entry) {
                return reject({
                    error: "Cannot find targeted entry."
                });
            }
            const validPaths = _.pickSchema(
                require("../models/media_file").model,
                Utils.nonCloneable
            );
            updates = _.pick(updates, validPaths);
            entry = _.extend(entry, updates);
            let savedEntry;
            try {
                savedEntry = await entry.save();
            } catch (err) {
                return reject(
                    handleMongooseError(
                        err,
                        "An error occurred while updating the file."
                    )
                );
            }
            return resolve(savedEntry);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const renameFile = function (repoEntry, newname, cb) {
    let baseName = path.basename(newname);
    let extension = path.extname(newname);
    baseName = path.basename(newname, extension);
    extension = extension.substr(1);
    return getFileEntry(
        {
            repoEntry: repoEntry._id
        },
        function (err, fileEntry) {
            if (err) {
                return cb(err);
            } else if (!fileEntry) {
                return cb({
                    error: "Cannot retrieve file entry."
                });
            } else {
                return updateFileEntry(
                    fileEntry._id,
                    {
                        baseName,
                        extension
                    },
                    function (err, updatedFileEntry) {
                        if (err) {
                            return cb(err);
                        } else {
                            return cb(null, updatedFileEntry);
                        }
                    }
                );
            }
        }
    );
};

const getFileEntry = async (query, opts = {}, cb) => {

    if (typeof opts === "function") {
        cb = opts;
        opts = {};
    }
    if (query == null) { //Shouldn't this return an error?
        query = {};

    }

    //repoEntry must be a string
    // if (query.repoEntry)
    //     query.repoEntry = `${query.repoEntry}`

    return new Promise(async (resolve, reject) => {
        const dbQuery = mongoose.model("RepoFile").findOne(query);
        try {
            return resolve(await dbQuery.exec());
        } catch (err) {
            console.error(err);
            return reject({
                error: "An error occurred while retrieving the file entry."
            });
        }
    }).then(wrapResolveCallback(cb))
        .catch(cb);
};
const getMediaFileEntry = async (query, opts = {}, cb) => {
    if (typeof opts === "function") {
        cb = opts;
        opts = {};
    }
    if (query == null) {
        query = {};
    }
    query.deleted = false;
    return new Promise(async (resolve, reject) => {
        const dbQuery = mongoose.model("MediaFile").findOne(query);
        try {
            return resolve(await dbQuery.exec());
        } catch (err) {
            console.error(err);
            return reject({
                error: "An error occurred while retrieving the file entry."
            });
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const getFileEntries = function (query, cb) {
    if (query == null) {
        query = {};
    }
    query.deleted = false;

    return mongoose.model("RepoFile").find(query, function (err, fileEntries) {
        if (err) {
            console.error(err);
            return cb({
                error: "An error occurred while retrieving the file entries."
            });
        } else {
            return cb(null, fileEntries);
        }
    });
};

const getFileContent = async (repoEntry, cb) => {
    return new Promise(async (resolve, reject) => {
        try {
            let tempFileEntry = await getFileEntry({})
            const fileEntry = await getFileEntry({
                repoEntry: repoEntry._id
            });
            if (!fileEntry) {
                return reject({
                    error: "File entry not found 2!"
                });
            }
            const content = await readFile(fileEntry.fsId);
            return resolve(content);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const getFileStream = (repoEntry, cb) => {
    getFileEntry(
        {
            repoEntry: repoEntry._id
        },
        function (err, fileEntry) {
            if (err) {
                return cb(err);
            } else if (!fileEntry) {
                return cb({
                    error: "File entry not found!"
                });
            } else {

                const gfs = new Grid();
                const stream = gfs.createReadStream({
                    _id: fileEntry.fsId
                });
                stream.run();
                return cb(null, stream);
            }
        }
    );
}
const getMediaFileStream = (mediaEntry, cb) => {
    return new Promise(async (resolve, reject) => {
        try {
            const entryId = getMongooseId(mediaEntry);
            const entry = await getMediaFileEntry({
                _id: entryId
            });
            if (!entry) {
                return reject({
                    error: "Media entry not found"
                });
            }

            const gfs = new Grid();
            const stream = gfs.createReadStream({
                _id: entry.fsId
            });
            stream.run()
            return resolve(stream);
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};


const readFile = async (fsId, cb) => {
    return new Promise(async (resolve, reject) => {
        // const gfs = Grid(dbfs.db);
        const gfs = new Grid();
        let content = "";
        const stream = gfs.createReadStream({
            _id: fsId
        });
        stream.on("data", chunk => {
            content = content + chunk;
        });


        stream.on("error", err => {
            // if (err === undefined) {
            //     return
            // }
            console.error(err);
            return reject({
                error: "Failed to retrieve file content. 1"
            });
        });
        stream.on("close", () => {
            if (content == null) {
                return reject({
                    error: "Failed to retrieve file content. 2"
                });
            } else {
                return resolve(content);
            }
        });
        stream.run();
        return;
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

var writeTempSimulationModules = function (
    repo,
    testbenchId,
    simulationTime,
    dir,
    depth,
    cb
) {
    if (depth >= 3) {
        return cb({
            error: "Cannot simulate IP depth > 3"
        });
    }
    const Repo = require("./repo");
    const testbenchCB = function (testbenchEntry) {
        let dirName = shortid.generate() + "_" + Date.now();
        let fullPath = path.join(process.cwd(), `${dir}${dirName}`);
        fullPath = `${fullPath}/`;
        if (depth > 0) {
            dirName = "";
            fullPath = dir;
        }
        const mkdirCB = () =>
            repo.getRoot(function (err, rootEntry) {
                if (err) {
                    return cb(err);
                } else {
                    return repo.getEntries(
                        {
                            handler: EntryType.Folder
                        },
                        function (err, folderEntries) {
                            if (err) {
                                return cb(err);
                            } else {
                                const idMap = {};
                                idMap[rootEntry._id.toString()] = rootEntry;
                                folderEntries.forEach(
                                    folder =>
                                        (idMap[folder._id.toString()] = folder)
                                );
                                const folderPaths = {};
                                folderPaths[rootEntry._id] = "";
                                folderEntries.forEach(function (folder, ind) {
                                    let folderPath = `${encodeURIComponent(
                                        folder.title
                                    )}\\`;
                                    let parentId =
                                        folder.parent.toString() ===
                                            rootEntry._id.toString()
                                            ? null
                                            : folder.parent.toString();
                                    let parentFolder = idMap[parentId];

                                    while (parentFolder != null) {
                                        folderPath = `${encodeURIComponent(
                                            parentFolder.title
                                        )}\\${folderPath}`;
                                        parentId =
                                            parentFolder.parent.toString() ===
                                                rootEntry._id.toString()
                                                ? null
                                                : parentFolder.parent.toString();
                                        parentFolder = idMap[parentId];
                                    }
                                    return (folderPaths[
                                        folder._id.toString()
                                    ] = folderPath);
                                });

                                return repo.getEntries(
                                    {
                                        handler: EntryType.IP,
                                        included: true
                                    },
                                    function (err, ipEntries) {
                                        if (err) {
                                            return cb(err);
                                        } else {
                                            return repo.getSynthesizable(
                                                function (err, verilogEntries) {
                                                    if (err) {
                                                        return cb(err);
                                                    } else {
                                                        const fileNames = {};
                                                        const reverseMap = {};
                                                        let dumpName = "";
                                                        if (depth === 0) {
                                                            verilogEntries.push(
                                                                testbenchEntry
                                                            );
                                                        }
                                                        return async.each(
                                                            verilogEntries,
                                                            function (
                                                                entry,
                                                                callback
                                                            ) {
                                                                const fileName = `${
                                                                    folderPaths[
                                                                    entry
                                                                        .parent
                                                                    ]
                                                                    }${encodeURIComponent(
                                                                        entry.title
                                                                    )}`;

                                                                fileNames[
                                                                    entry._id
                                                                ] = {
                                                                        tempName: fileName,
                                                                        sourceName:
                                                                            entry.title
                                                                    };

                                                                reverseMap[
                                                                    fileName
                                                                ] = {
                                                                        sourceName:
                                                                            entry.title,
                                                                        sourceId:
                                                                            entry._id
                                                                    };

                                                                return getFileContent(
                                                                    entry,
                                                                    function (
                                                                        readErr,
                                                                        content
                                                                    ) {
                                                                        if (
                                                                            readErr
                                                                        ) {
                                                                            return callback(
                                                                                readErr
                                                                            );
                                                                        } else {
                                                                            const commentsRegEx = () =>
                                                                                new RegExp(
                                                                                    "\\/\\/.*$",
                                                                                    "gm"
                                                                                );
                                                                            const multiCommentsRegEx = () =>
                                                                                new RegExp(
                                                                                    "\\/\\*(.|[\\r\\n])*?\\*\\/",
                                                                                    "gm"
                                                                                );
                                                                            content = content
                                                                                .replace(
                                                                                    commentsRegEx(),
                                                                                    ""
                                                                                )
                                                                                .replace(
                                                                                    multiCommentsRegEx(),
                                                                                    ""
                                                                                );
                                                                            content = content.replace(
                                                                                /\$\s*stop*/,
                                                                                "$finish()"
                                                                            );
                                                                            if (
                                                                                depth ===
                                                                                0 &&
                                                                                entry ===
                                                                                testbenchEntry
                                                                            ) {
                                                                                //TODO: Remove comments!
                                                                                let moduleRegEx = /([\s\S]*?)(module)([\s\S]+?)(endmodule)([\s\S]*)/gm;
                                                                                moduleRegEx = /([\s\S]*?)(module)([\s\S]+?)(\([\s\S]*\))?;([\s\S]+?)(endmodule)([\s\S]*)/gm;
                                                                                const matches = moduleRegEx.exec(
                                                                                    content
                                                                                );
                                                                                if (
                                                                                    matches ==
                                                                                    null
                                                                                ) {
                                                                                    return callback(
                                                                                        {
                                                                                            error:
                                                                                                "The testbench does not contain any module."
                                                                                        }
                                                                                    );
                                                                                }
                                                                                dumpName = `${
                                                                                    testbenchEntry.title
                                                                                    }_${Date.now()}.vcd`;
                                                                                if (
                                                                                    /\$\s*stop/.test(
                                                                                        content
                                                                                    )
                                                                                ) {
                                                                                    return cb(
                                                                                        {
                                                                                            error:
                                                                                                "$stop keyword is prohibited."
                                                                                        }
                                                                                    );
                                                                                }
                                                                                const finishAppend = `\n#${simulationTime};\n$finish;\n`;
                                                                                content = `${
                                                                                    matches[1]
                                                                                    }${
                                                                                    matches[2]
                                                                                    } ${
                                                                                    matches[3]
                                                                                    } ${
                                                                                    matches[4]
                                                                                        ? matches[4]
                                                                                        : ""
                                                                                    };${
                                                                                    matches[5]
                                                                                    }\ninitial begin $dumpfile(\"${dumpName}\"); $dumpvars(0, ${
                                                                                    matches[3]
                                                                                    }); ${finishAppend}end\n${
                                                                                    matches[6]
                                                                                    }${
                                                                                    matches[7]
                                                                                    }`;
                                                                            }
                                                                            return fs.writeFile(
                                                                                `${fullPath}${fileName}`,
                                                                                content,
                                                                                function (
                                                                                    writeErr
                                                                                ) {
                                                                                    if (
                                                                                        writeErr
                                                                                    ) {
                                                                                        console.error(
                                                                                            writeErr
                                                                                        );
                                                                                        return callback(
                                                                                            {
                                                                                                error:
                                                                                                    "Failed to package the files for compiling."
                                                                                            }
                                                                                        );
                                                                                    } else {
                                                                                        return callback();
                                                                                    }
                                                                                }
                                                                            );
                                                                        }
                                                                    }
                                                                );
                                                            },
                                                            function (asyncErr) {
                                                                if (asyncErr) {
                                                                    return cb(
                                                                        asyncErr
                                                                    );
                                                                } else {
                                                                    return async.each(
                                                                        ipEntries,
                                                                        function (
                                                                            ipEntry,
                                                                            callback
                                                                        ) {
                                                                            const ipData = JSON.parse(
                                                                                ipEntry.data
                                                                            );
                                                                            if (
                                                                                ipData.ip ==
                                                                                null
                                                                            ) {
                                                                                return callback(
                                                                                    {
                                                                                        error: `Cannot find the source of the IP Core ${
                                                                                            ipEntry.title
                                                                                            }.`
                                                                                    }
                                                                                );
                                                                            }
                                                                            return Repo.getRepoIP(
                                                                                {
                                                                                    _id:
                                                                                        ipData.ip
                                                                                },
                                                                                function (
                                                                                    err,
                                                                                    ip
                                                                                ) {
                                                                                    if (
                                                                                        err
                                                                                    ) {
                                                                                        return callback(
                                                                                            err
                                                                                        );
                                                                                    } else if (
                                                                                        !ip
                                                                                    ) {
                                                                                        return callback(
                                                                                            {
                                                                                                error: `Cannot find the source of the IP Core ${
                                                                                                    ipEntry.title
                                                                                                    }.`
                                                                                            }
                                                                                        );
                                                                                    } else {
                                                                                        return Repo.getRepo(
                                                                                            {
                                                                                                _id:
                                                                                                    ip.repo
                                                                                            },
                                                                                            function (
                                                                                                err,
                                                                                                ipRepo
                                                                                            ) {
                                                                                                if (
                                                                                                    err
                                                                                                ) {
                                                                                                    return callback(
                                                                                                        err
                                                                                                    );
                                                                                                } else if (
                                                                                                    !ipRepo
                                                                                                ) {
                                                                                                    return callback(
                                                                                                        {
                                                                                                            error: `Cannot instantiate IP Core ${
                                                                                                                ipEntry.title
                                                                                                                }.`
                                                                                                        }
                                                                                                    );
                                                                                                } else {
                                                                                                    const fileName = `${
                                                                                                        folderPaths[
                                                                                                        ipEntry
                                                                                                            .parent
                                                                                                        ]
                                                                                                        }${encodeURIComponent(
                                                                                                            ipEntry.title
                                                                                                        )}`;

                                                                                                    fileNames[
                                                                                                        ipEntry._id
                                                                                                    ] = {
                                                                                                            tempName: fileName,
                                                                                                            sourceName:
                                                                                                                ipEntry.title
                                                                                                        };

                                                                                                    reverseMap[
                                                                                                        fileName
                                                                                                    ] = {
                                                                                                            sourceName:
                                                                                                                ipEntry.title,
                                                                                                            sourceId:
                                                                                                                ipEntry._id
                                                                                                        };
                                                                                                    return writeTempSimulationModules(
                                                                                                        ipRepo,
                                                                                                        false,
                                                                                                        0,
                                                                                                        `${fullPath}/${fileName}\\`,
                                                                                                        depth +
                                                                                                        1,
                                                                                                        function (
                                                                                                            err
                                                                                                        ) {
                                                                                                            if (
                                                                                                                err
                                                                                                            ) {
                                                                                                                return callback(
                                                                                                                    err
                                                                                                                );
                                                                                                            } else {
                                                                                                                return callback();
                                                                                                            }
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            }
                                                                                        );
                                                                                    }
                                                                                }
                                                                            );
                                                                        },
                                                                        function (
                                                                            err
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
                                                                                    fullPath,
                                                                                    fileNames,
                                                                                    reverseMap,
                                                                                    dumpName
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
            });
        if (testbenchEntry) {
            return fs.mkdir(fullPath, 0o0777, function (err) {
                if (err) {
                    console.error(err);
                    return cb({
                        error: "Failed to package the files for compiling."
                    });
                } else {
                    return mkdirCB();
                }
            });
        } else {
            return mkdirCB();
        }
    };

    if (depth === 0 && testbenchId != null && testbenchId) {
        return repo.getEntry(
            {
                _id: testbenchId
            },
            function (err, testbenchEntry) {
                if (err) {
                    return cb(err);
                } else if (!testbenchEntry) {
                    return cb({
                        error: "The target file does not exist."
                    });
                } else if (testbenchEntry.handler !== EntryType.TestbenchFile) {
                    return cb({
                        error: "The target file is not a testbench file."
                    });
                } else {
                    return testbenchCB(testbenchEntry);
                }
            }
        );
    } else {
        return testbenchCB(false);
    }
};

const writeNetlistSimulationModules = async (
    repo,
    testbenchId,
    netlistId,
    stdcell,
    simulationTime,
    cb
) => {
    try {
        let testbenchEntry = await repo.p.getEntry({ _id: testbenchId });
        if (!testbenchEntry) {
            throw { error: "The target file does not exist." };
        }

        if (testbenchEntry.handler !== EntryType.TestbenchFile) {
            throw { error: "The target file is not a testbench file." };
        }

        const dirName = shortid.generate() + "_" + Date.now();
        const fullPath = path.join(process.cwd(), `temp/${dirName}`);

        try {
            fs.mkdirpSync(fullPath, 0o0777);
        } catch (err) {
            console.error(err);
            throw { error: "Failed to package files for simulation." };
        }

        let rootEntry = await repo.p.getRoot();
        let folderEntries = await repo.p.getEntries({ handler: EntryType.Folder });

        const idMap = {};
        idMap[rootEntry._id.toString()] = rootEntry;
        folderEntries.forEach(folder =>
            (idMap[folder._id.toString()] = folder)
        );
        const folderPaths = {};
        folderPaths[rootEntry._id] = "";
        for (let folder of folderEntries) {
            let folderPath = `${encodeURIComponent(folder.title).replace(/[\(\)]/gm, "\\")}\\`;
            let parentId = folder.parent.toString() === rootEntry._id.toString() ?
                null : folder.parent.toString();
            let parentFolder = idMap[parentId];

            while (parentFolder) {
                folderPath = `${encodeURIComponent(parentFolder.title).replace(
                    /[\(\)]/gm,
                    "\\"
                )}\\${folderPath}`;

                parentId =
                    parentFolder.parent.toString() ===
                        rootEntry._id.toString()
                        ? null
                        : parentFolder.parent.toString();
                parentFolder = idMap[parentId];
            }

            folderPaths[folder._id.toString()] = folderPath;
        }

        let netlistEntry = await repo.p.getEntry({ _id: netlistId });
        const fileNames = {};
        const reverseMap = {};
        let dumpName = "";
        const verilogEntries = [
            netlistEntry,
            testbenchEntry
        ];
        verilogEntries.push(testbenchEntry);

        for (let entry of verilogEntries) {
            let fileName = `${folderPaths[entry.parent]}${encodeURIComponent(entry.title)}`;
            fileNames[entry._id] = { tempName: fileName, sourceName: entry.title };
            reverseMap[fileName] = { sourceName: entry.title, sourceId: entry._id };

            let content = await new Promise((resolve, reject) => getFileContent(entry, (err, content) => {
                if (err) {
                    return reject(err);
                }
                return resolve(content);
            }));

            if (entry === testbenchEntry) {
                const commentsRegEx = () => new RegExp("\\/\\/.*$", "gm");
                const multiCommentsRegEx = () => new RegExp(
                    "\\/\\*(.|[\\r\\n])*?\\*\\/",
                    "gm"
                );
                content = content.replace(commentsRegEx(), "").replace(
                    multiCommentsRegEx(),
                    ""
                );
                content = content.replace(
                    /\$\s*stop*/,
                    "$finish()"
                );

                let moduleRegEx = /([\s\S]*?)(module)([\s\S]+?)(\([\s\S]*\))?;([\s\S]+?)(endmodule)([\s\S]*)/gm;

                const matches = moduleRegEx.exec(
                    content
                );
                if (!matches) {
                    throw { error: "The testbench does not contain any module." };
                }

                dumpName = `${testbenchEntry.title}_${Date.now()}.vcd`;
                if (/\$\s*stop/.test(content)) {
                    return cb({
                        error: "The $stop keyword is prohibited."
                    });
                }
                let finishAppend = `\n#${simulationTime};\n$finish;\n`;


                content = `${matches[1]
                    }${
                    matches[2]
                    } ${
                    matches[3]
                    } ${
                    matches[4]
                        ? matches[4]
                        : ""
                    };${
                    matches[5]
                    }\ninitial begin $dumpfile(\"${dumpName}\"); $dumpvars(1, ${
                    matches[3]
                    }); ${finishAppend}end\n${
                    matches[6]
                    }${
                    matches[7]
                    }`;
            }

            await fs.writeFile(
                `${fullPath}/${fileName}`,
                content
            ).catch(err => {
                console.error(err);
                throw { error: "Failed to package files for simulation." };
            })
        }


        const stdcellRepo = config.stdcellRepo;
        const stdcellPath = path.join(stdcellRepo, stdcell, "models.v");
        const stdCellDest = `${fullPath}/${stdcell}.v`;

        try {
            const stat = fs.lstatSync(
                stdcellPath
            );
        } catch (e) {
            console.error(
                e
            );
            return cb({
                error: `Cannot find the standard cell models for this library ${stdcell}`
            });
        }

        const done = function (
            err
        ) {
            if (err) {
                console.error(
                    err
                );
                return cb(
                    {
                        error:
                            "Failed to package the files for compiling."
                    }
                );
            } else {
                return cb(
                    null,
                    fullPath,
                    fileNames,
                    reverseMap,
                    dumpName
                );
            }
        };
        const readStream = fs.createReadStream(
            stdcellPath
        );
        readStream.on(
            "error",
            done
        );
        const writeStream = fs.createWriteStream(
            stdCellDest
        );
        writeStream.on(
            "error",
            done
        );
        writeStream.on(
            "close",
            done
        );
        return readStream.pipe(
            writeStream
        );

    } catch (err) {
        return cb(err);
    }
}

const writeTempRepoModules = function (repo, cb) {
    const dirName = shortid.generate() + "_" + Date.now();
    const fullPath = path.join(process.cwd(), `temp/${dirName}`);
    return fs.mkdir(fullPath, 0o0777, function (err) {
        if (err) {
            console.error(err);
            return cb({
                error: "Failed to package the files for compiling."
            });
        } else {
            return repo.getRoot(function (err, rootEntry) {
                if (err) {
                    return cb(err);
                } else {
                }
                return repo.getEntries(
                    {
                        handler: EntryType.Folder
                    },
                    function (err, folderEntries) {
                        if (err) {
                            return cb(err);
                        } else {
                            const idMap = {};
                            idMap[rootEntry._id.toString()] = rootEntry;
                            folderEntries.forEach(
                                folder =>
                                    (idMap[folder._id.toString()] = folder)
                            );
                            const folderPaths = {};
                            folderPaths[rootEntry._id] = "";
                            folderEntries.forEach(function (folder, ind) {
                                let folderPath = `${encodeURIComponent(
                                    folder.title
                                )}\\`;
                                let parentId =
                                    folder.parent.toString() ===
                                        rootEntry._id.toString()
                                        ? null
                                        : folder.parent.toString();
                                let parentFolder = idMap[parentId];

                                while (parentFolder != null) {
                                    folderPath = `${encodeURIComponent(
                                        parentFolder.title
                                    )}\\${folderPath}`;
                                    parentId =
                                        parentFolder.parent.toString() ===
                                            rootEntry._id.toString()
                                            ? null
                                            : parentFolder.parent.toString();
                                    parentFolder = idMap[parentId];
                                }
                                return (folderPaths[
                                    folder._id.toString()
                                ] = folderPath);
                            });
                            return repo.isIPCoresIncluded(function (
                                err,
                                result
                            ) {
                                if (err) {
                                    return cb(err);
                                } else if (result.isIncluded) {
                                    return cb({
                                        error: `Cannot synthesize project with IP cores, exclude/remove the modules (${names}) before synthesis.`
                                    });
                                } else {
                                    const { isIncluded, names } = result;
                                    return repo.getSynthesizable(function (
                                        err,
                                        verilogEntries
                                    ) {
                                        if (err) {
                                            return cb(err);
                                        } else {
                                            const fileNames = {};
                                            const reverseMap = {};
                                            return async.each(
                                                verilogEntries,
                                                function (entry, callback) {
                                                    //fileName = shortid.generate() + '_' + Date.now() + '.v'
                                                    const fileName = `${
                                                        folderPaths[
                                                        entry.parent
                                                        ]
                                                        }${encodeURIComponent(
                                                            entry.title
                                                        )}`;

                                                    fileNames[entry._id] = {
                                                        tempName: fileName,
                                                        sourceName: entry.title
                                                    };

                                                    reverseMap[fileName] = {
                                                        sourceName: entry.title,
                                                        sourceId: entry._id
                                                    };

                                                    return getFileContent(
                                                        entry,
                                                        function (
                                                            readErr,
                                                            content
                                                        ) {
                                                            if (readErr) {
                                                                return callback(
                                                                    readErr
                                                                );
                                                            } else {
                                                                return fs.writeFile(
                                                                    `${fullPath}/${fileName}`,
                                                                    content,
                                                                    function (
                                                                        writeErr
                                                                    ) {
                                                                        if (
                                                                            writeErr
                                                                        ) {
                                                                            console.error(
                                                                                writeErr
                                                                            );
                                                                            return callback(
                                                                                {
                                                                                    error:
                                                                                        "Failed to package the files for compiling."
                                                                                }
                                                                            );
                                                                        } else {
                                                                            return callback();
                                                                        }
                                                                    }
                                                                );
                                                            }
                                                        }
                                                    );
                                                },
                                                function (asyncErr) {
                                                    if (asyncErr) {
                                                        return cb(asyncErr);
                                                    } else {
                                                        return cb(
                                                            null,
                                                            fullPath,
                                                            fileNames,
                                                            reverseMap
                                                        );
                                                    }
                                                }
                                            );
                                        }
                                    });
                                }
                            });
                        }
                    }
                );
            });
        }
    });
};

const writeTempRepoModule = function (entryId, cb) {
    const dirName = shortid.generate() + "_" + Date.now();
    const fullPath = path.join(process.cwd(), `temp/${dirName}`);
    return fs.mkdir(fullPath, 0o0777, function (err) {
        if (err) {
            console.error(err);
            return cb({
                error: "Failed to get the source file for compiling."
            });
        } else {
            //TODO: Use the Repo model.
            const Repo = require("./repo");
            return Repo.getRepoEntry(
                {
                    _id: entryId,
                    handler: EntryType.VerilogFile,
                    synthesize: true
                },
                function (err, entry) {
                    if (err) {
                        return cb(err);
                    } else if (entry) {
                        return cb({
                            error: "Entry not found."
                        });
                    } else {
                        return getFileContent(entry, function (err, content) {
                            if (err) {
                                return cb(err);
                            } else {
                                //entryStamp = shortid.generate() + '_' + Date.now()
                                //fileName = entry.title + '_' + entryStamp + '.v'
                                const fileName =
                                    entry.title +
                                    "_" +
                                    shortid.generate() +
                                    "_" +
                                    Date.now() +
                                    ".v";
                                return fs.writeFile(
                                    `${fullPath}/${fileName}`,
                                    content,
                                    function (err) {
                                        if (err) {
                                            console.error(err);
                                            return cb({
                                                error:
                                                    "Failed to read the files for compiling."
                                            });
                                        } else {
                                            const reverseMap = {};
                                            reverseMap[fileName] = {
                                                sourceName: entry.title,
                                                sourceId: entry._id
                                            };
                                            return cb(
                                                null,
                                                fullPath,
                                                fileName,
                                                reverseMap
                                            );
                                        }
                                    }
                                );
                            }
                        });
                    }
                }
            );
        }
    });
};
const writeTempNetlist = function (entryId, cb) {
    const dirName = shortid.generate() + "_" + Date.now();
    const repoPath = path.join(process.cwd(), `temp/${dirName}`);
    return fs.mkdir(repoPath, 0o0777, function (err) {
        if (err) {
            console.error(err);
            return cb({
                error: "Failed to get the source file for compiling."
            });
        } else {
            //TODO: Use the Repo model.
            const Repo = require("./repo");
            return Repo.getRepoEntry(
                {
                    _id: entryId,
                    handler: EntryType.NetlistFile
                },
                function (err, entry) {
                    if (err) {
                        return cb(err);
                    } else if (!entry) {
                        return cb({
                            error: "Netlist not found."
                        });
                    } else {
                        return getFileContent(entry, function (err, content) {
                            if (err) {
                                return cb(err);
                            } else {
                                const folderName =
                                    entry.title +
                                    "_" +
                                    shortid.generate() +
                                    "_" +
                                    Date.now();
                                const fileName = entry.title;
                                const filePath = path.join(
                                    repoPath,
                                    folderName
                                );
                                return fs.mkdir(filePath, 0o0777, function (
                                    err
                                ) {
                                    if (err) {
                                        console.error(err);
                                        return cb({
                                            error:
                                                "Failed to get the source file for compiling."
                                        });
                                    } else {
                                        return fs.writeFile(
                                            `${filePath}/${fileName}`,
                                            content,
                                            function (err) {
                                                if (err) {
                                                    console.error(err);
                                                    return cb({
                                                        error:
                                                            "Failed to read the files for compiling."
                                                    });
                                                } else {
                                                    const reverseMap = {};
                                                    reverseMap[fileName] = {
                                                        sourceName: entry.title,
                                                        sourceId: entry._id
                                                    };
                                                    return cb(
                                                        null,
                                                        repoPath,
                                                        filePath,
                                                        fileName,
                                                        reverseMap
                                                    );
                                                }
                                            }
                                        );
                                    }
                                });
                            }
                        });
                    }
                }
            );
        }
    });
};

const writeTempRepo = async (repo, cb) => {
    const Repo = require("./file_manager");
    const dirName = shortid.generate() + "_" + Date.now();
    const fullPath = path.join(process.cwd(), `temp/${dirName}`);
    return new Promise(async (resolve, reject) => {
        try {
            try {
                await fs.mkdir(fullPath, 0o0777);
            } catch (err) {
                console.error(err);
                return reject({
                    error: "Failed to package repository files."
                });
            }
            const rootEntry = await repo.getRoot();
            const repoEntries = await repo.getEntries({
                _id: {
                    $ne: rootEntry._id
                },
                handler: {
                    $ne: EntryType.Folder
                }
            });
            const rootTitle = rootEntry.title;
            const repoFolders = await repo.getEntries({
                handler: EntryType.Folder
            });
            let folderPath;
            const childrenMap = {};
            const parentsMap = {};
            const idMap = {};
            idMap[rootEntry._id] = rootEntry;
            repoFolders.forEach(function (folder) {
                idMap[folder._id] = folder;
                if (folder.parent != null) {
                    if (childrenMap[folder.parent] == null) {
                        childrenMap[folder.parent] = [];
                    }
                    childrenMap[folder.parent].push(folder._id);
                    return (parentsMap[folder._id] = folder.parent);
                }
            });
            repoFolders.push(rootEntry);

            const fullPaths = {};
            repoFolders.forEach(function (folder) {
                folderPath = `${folder.title}`;
                let folderParentId = folder.parent;
                let folderParent = "";
                if (folderParentId != null) {
                    folderParent = idMap[folderParentId].title;
                }
                while (folderParentId != null) {
                    folderPath = path.join(folderParent, folderPath);
                    folderParentId = idMap[folderParentId].parent;
                    if (folderParentId != null) {
                        folderParent = idMap[folderParentId].title;
                    }
                }
                const absFolderPath = path.join(fullPath, folderPath);
                return (fullPaths[folder._id] = absFolderPath);
            });
            const pathsArray = _.values(fullPaths);
            const pathsArrayPromises = _.map(pathsArray, folderPath => () =>
                new Promise(async (resolve, reject) => {
                    try {
                        await fs.mkdirp(folderPath, {
                            mode: 0o0777
                        });
                    } catch (err) {
                        console.error(err);
                        return reject({
                            error:
                                "An error occurred while creating the repository structure."
                        });
                    }
                    return resolve(folderPath);
                })
            );
            for (let i = 0; i < pathsArrayPromises.length; i++) {
                await pathsArrayPromises[i]();
            }

            const repoEntriesPromises = _.map(repoEntries, entry => () =>
                new Promise(async (resolve, reject) => {
                    const entryPath = path.join(
                        fullPaths[entry.parent],
                        entry.title
                    );
                    try {
                        const content = await entry.getContent();
                        try {
                            await fs.writeFile(entryPath, content);
                        } catch (err) {
                            console.error();
                            return reject({
                                error:
                                    "An error occurred while creating the repository structure."
                            });
                        }
                        return resolve(entryPath);
                    } catch (err) {
                        return reject(err);
                    }
                })
            );
            for (let i = 0; i < repoEntriesPromises.length; i++) {
                await repoEntriesPromises[i]();
            }
            const sourcePath = path.join(fullPath, rootTitle);
            return resolve({
                repoPath: sourcePath,
                tempPath: fullPath
            });
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const writeTestbenchFile = function (
    repo,
    testbenchEntry,
    parentPaths,
    simulationTime,
    level,
    cb
) {
    if (!testbenchEntry) {
        return cb({
            error: "The target file does not exist."
        });
    }
    const commentsRegEx = () => new RegExp("\\/\\/.*$", "gm");
    const multiCommentsRegEx = () =>
        new RegExp("\\/\\*(.|[\\r\\n])*?\\*\\/", "gm");
    let dumpName = `${testbenchEntry.title}_${Date.now()}.vcd`;
    return testbenchEntry.getContent(function (err, content) {
        if (err) {
            return cb(err);
        } else {
            content = content
                .replace(commentsRegEx(), "")
                .replace(multiCommentsRegEx(), "");
            content = content.replace(/\$\s*stop*/, "$finish()");
            let moduleRegEx = /([\s\S]*?)(module)([\s\S]+?)(endmodule)([\s\S]*)/gm;
            moduleRegEx = /([\s\S]*?)(module)([\s\S]+?)(\([\s\S]*\))?;([\s\S]+?)(endmodule)([\s\S]*)/gm;
            const matches = moduleRegEx.exec(content);
            if (matches == null) {
                return cb({
                    error: "The testbench does not contain any module."
                });
            }
            dumpName = `${testbenchEntry.title}_${Date.now()}.vcd`;
            if (/\$\s*stop/.test(content)) {
                return cb({
                    error: "$stop keyword is prohibited."
                });
            }
            const finishAppend = `\n#${simulationTime};\n$finish;\n`;
            content = `${matches[1]}${matches[2]} ${matches[3]} ${
                matches[4] ? matches[4] : ""
                };${
                matches[5]
                }\ninitial begin $dumpfile(\"${dumpName}\"); $dumpvars(${level ||
                0}, ${matches[3]}); ${finishAppend}end\n${matches[6]}${
                matches[7]
                }`;
            const testbenchPath = path.join(
                parentPaths[testbenchEntry.parent],
                testbenchEntry.title
            );
            return fs.writeFile(testbenchPath, content, function (writeErr) {
                if (writeErr) {
                    console.error(writeErr);
                    return cb({
                        error: "Failed to package the files for compiling."
                    });
                } else {
                    return cb(null, testbenchPath, dumpName);
                }
            });
        }
    });
};

const writeIPCoreFiles = function (
    repo,
    repoPath,
    parentPaths,
    relativeParentPaths,
    filePaths,
    namesMap,
    depth,
    cb
) {
    if (depth >= 3) {
        return cb({
            error: "Cannot simulate IP depth > 3."
        });
    }

    const Repo = require("./repo");
    return repo.getEntries(
        {
            handler: EntryType.IP,
            included: true
        },
        function (err, ips) {
            if (err) {
                return cb(err);
            } else {
                return async.each(
                    ips,
                    function (ipEntry, callback) {
                        const ipData = JSON.parse(ipEntry.data);
                        if (ipData.ip == null) {
                            return callback({
                                error: `Cannot find the source of the IP Core ${
                                    ipEntry.title
                                    }.`
                            });
                        }
                        return Repo.getRepoIP(
                            {
                                _id: ipData.ip
                            },
                            function (err, ip) {
                                if (err) {
                                    return callback(err);
                                } else if (!ip) {
                                    return callback({
                                        error: `Cannot find the source of the IP Core ${
                                            ipEntry.title
                                            }.`
                                    });
                                } else {
                                    return Repo.getRepo(
                                        {
                                            _id: ip.repo
                                        },
                                        function (err, ipRepo) {
                                            if (err) {
                                                return callback(err);
                                            } else if (!ipRepo) {
                                                return callback({
                                                    error: `Cannot instantiate IP Core ${
                                                        ipEntry.title
                                                        }.`
                                                });
                                            } else {
                                                return writeTestbenchSimulationStructure(
                                                    ipRepo,
                                                    depth + 1,
                                                    parentPaths[ipEntry._id],
                                                    function (
                                                        err,
                                                        ipSourcePath,
                                                        ipFullPath,
                                                        ipFilePaths,
                                                        ipParentPaths,
                                                        ipRelativeParentPaths,
                                                        ipNamesMap
                                                    ) {
                                                        if (err) {
                                                            return callback(
                                                                err
                                                            );
                                                        } else {
                                                            for (let filePath of Array.from(
                                                                ipFilePaths.verilog
                                                            )) {
                                                                filePaths.verilog.push(
                                                                    path.join(
                                                                        relativeParentPaths[
                                                                        ipEntry
                                                                            ._id
                                                                        ],
                                                                        filePath
                                                                    )
                                                                );
                                                            }
                                                            for (let fileName in ipNamesMap.files) {
                                                                const fileId =
                                                                    ipNamesMap
                                                                        .files[
                                                                    fileName
                                                                    ];
                                                                if (
                                                                    namesMap.ips ==
                                                                    null
                                                                ) {
                                                                    namesMap.ips = {};
                                                                }
                                                                if (
                                                                    namesMap
                                                                        .ips[
                                                                    depth
                                                                    ] == null
                                                                ) {
                                                                    namesMap.ips[
                                                                        depth
                                                                    ] = {};
                                                                }
                                                                if (
                                                                    namesMap
                                                                        .ips[
                                                                    depth
                                                                    ][
                                                                    ipEntry
                                                                        .title
                                                                    ] == null
                                                                ) {
                                                                    namesMap.ips[
                                                                        depth
                                                                    ][
                                                                        ipEntry.title
                                                                    ] = {};
                                                                }
                                                                namesMap.ips[
                                                                    depth
                                                                ][
                                                                    ipEntry.title
                                                                ][
                                                                    fileName
                                                                ] = fileId;
                                                            }
                                                            return callback();
                                                        }
                                                    }
                                                );
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    },
                    function (err) {
                        if (err) {
                            return cb(err);
                        } else {
                            return cb(null, filePaths, namesMap);
                        }
                    }
                );
            }
        }
    );
};

var writeTestbenchSimulationStructure = function (repo, depth, rootDir, cb) {
    if (depth >= 3) {
        return cb({
            error: "Cannot simulate IP depth >= 3."
        });
    }
    return writeSynthesisContainerFiles(repo, false, true, rootDir, function (
        err,
        sourcePath,
        fullPath,
        filePaths,
        parentPaths,
        relativeParentPaths,
        namesMap
    ) {
        if (err) {
            return cb(err);
        }
        if (arguments.length === 2) {
            let temp = sourcePath;
            var {
                sourcePath,
                fullPath,
                filePaths,
                parentPaths,
                relativeParentPaths,
                namesMap
            } = temp;
            var parentPaths = temp.fullPaths;
            var relativeParentPaths = temp.relativePaths;
        }

        return writeIPCoreFiles(
            repo,
            sourcePath,
            parentPaths,
            relativeParentPaths,
            filePaths,
            namesMap,
            depth,
            function (err, filePaths, namesMap) {
                if (err) {
                    return cb(err);
                } else {
                    return cb(
                        null,
                        sourcePath,
                        fullPath,
                        filePaths,
                        parentPaths,
                        relativeParentPaths,
                        namesMap
                    );
                }
            }
        );
    });
};

const writeTestbenchSimulationContainerFiles = (
    repo,
    item,
    simulationTime,
    level,
    rootDir,
    cb
) => {
    if (typeof rootDir === "function") {
        cb = rootDir;
        rootDir = "";
    }
    return writeTestbenchSimulationStructure(repo, 0, rootDir, function (
        err,
        sourcePath,
        fullPath,
        filePaths,
        parentPaths,
        relativeParentPaths,
        namesMap
    ) {
        if (err) {
            return cb(err);
        } else {
            return writeTestbenchFile(
                repo,
                item,
                parentPaths,
                simulationTime,
                level,
                function (err, testbenchPath, dumpName) {
                    if (err) {
                        return cb(err);
                    }
                    const testbenchRelativePath = path.join(
                        relativeParentPaths[item.parent],
                        item.title
                    );
                    namesMap.files[
                        testbenchRelativePath.substr(
                            testbenchRelativePath.indexOf("/") + 1
                        )
                    ] = item._id;
                    return cb(
                        null,
                        testbenchPath,
                        testbenchRelativePath,
                        dumpName,
                        sourcePath,
                        fullPath,
                        filePaths,
                        namesMap
                    );
                }
            );
        }
    });
};

const writeNetlistSimulationContainerFiles = (
    repo,
    item,
    netlist,
    stdcell,
    simulationTime,
    level,
    rootDir = "",
    cb
) => {
    if (typeof rootDir === "function") {
        cb = rootDir;
        rootDir = "";
    }

    writeRepoFolderStructure(repo, true, rootDir, function (err, result) {
        if (err) {
            if (fullPath) {
                rmdir(fullPath, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                });
            }
            return cb(err);
        } else {
            const {
                sourcePath,
                fullPath,
                parentPaths,
                relativeParentPaths
            } = result;
            const filePaths = {
                verilog: []
            };
            const namesMap = {
                files: {}
            };
            return writeTestbenchFile(
                repo,
                item,
                parentPaths,
                simulationTime,
                level,
                function (err, testbenchPath, dumpName) {
                    if (err) {
                        return cb(err);
                    }
                    const testbenchRelativePath = path.join(
                        relativeParentPaths[item.parent],
                        item.title
                    );
                    namesMap.files[
                        testbenchRelativePath.substr(
                            testbenchRelativePath.indexOf("/") + 1
                        )
                    ] = item._id;
                    return netlist.getContent(function (err, content) {
                        if (err) {
                            return cb(err);
                        } else {
                            const entryPath = path.join(
                                parentPaths[netlist.parent],
                                netlist.title
                            );
                            return fs.writeFile(entryPath, content, function (
                                err
                            ) {
                                if (err) {
                                    console.error(err);
                                    return callback({
                                        error:
                                            "Failed to package repository files."
                                    });
                                } else {
                                    const relativePath = path.join(
                                        relativeParentPaths[netlist.parent],
                                        netlist.title
                                    );
                                    filePaths.verilog.push(relativePath);
                                    namesMap.files[
                                        relativePath.substr(
                                            relativePath.indexOf("/") + 1
                                        )
                                    ] = netlist._id;
                                    const stdcellPath = path.join(
                                        config.stdcellRepo,
                                        stdcell,
                                        "models.v"
                                    );
                                    const stdCellDest = `${sourcePath}/${stdcell}.v`;
                                    try {
                                        const stat = fs.lstatSync(stdcellPath);
                                    } catch (e) {
                                        console.error(e);
                                        return cb({
                                            error: `Cannot find the standard cell models for this library ${stdcell}`
                                        });
                                    }
                                    const done = function (err) {
                                        if (err) {
                                            console.error(err);
                                            return cb({
                                                error:
                                                    "Failed to package the files for compiling."
                                            });
                                        } else {
                                            filePaths.verilog.push(
                                                path.join(
                                                    repo.repoTitle,
                                                    `${stdcell}.v`
                                                )
                                            );
                                            return cb(
                                                null,
                                                testbenchPath,
                                                testbenchRelativePath,
                                                dumpName,
                                                sourcePath,
                                                fullPath,
                                                filePaths,
                                                namesMap
                                            );
                                        }
                                    };
                                    const readStream = fs.createReadStream(
                                        stdcellPath
                                    );
                                    readStream.on("error", done);
                                    const writeStream = fs.createWriteStream(
                                        stdCellDest
                                    );
                                    writeStream.on("error", done);
                                    writeStream.on("close", done);
                                    return readStream.pipe(writeStream);
                                }
                            });
                        }
                    });
                }
            );
        }
    });
};

const writeRepoFolderStructure = async (repo, allowIps, rootDir, cb) => {
    return new Promise(async (resolve, reject) => {
        const dirName = shortid.generate() + "_" + Date.now();
        let fullPath = path.join(process.cwd(), `temp/${dirName}`);
        try {
            if (typeof rootDir !== "string" || rootDir.trim() === "") {
                try {
                    await fs.mkdir(fullPath, 0o0777);
                } catch (err) {
                    console.error(err);
                    return reject({
                        error: "Failed to package repository files."
                    });
                }
            } else {
                fullPath = rootDir;
            }

            const rootEntry = await repo.getRoot();
            let { isIncluded, names } = await repo.isIPCoresIncluded();
            if (!allowIps && isIncluded) {
                rmdir(fullPath, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                });
                return reject({
                    error: `Cannot synthesize project with IP cores, exclude/remove the modules (${names}) before synthesis.`
                });
            }
            const rootTitle = rootEntry.title;
            const repoFolders = await repo.getEntries({
                $or: [
                    {
                        handler: EntryType.Folder
                    },
                    {
                        handler: EntryType.IP
                    }
                ]
            });
            let folderPath;
            const childrenMap = {};
            const parentsMap = {};
            const idMap = {};
            const foldersMeta = {};
            isIncluded = {};
            isIncluded[rootEntry._id] = true;
            idMap[rootEntry._id] = rootEntry;
            foldersMeta[rootEntry._id] = {
                title: rootEntry.title,
                included: true
            };
            repoFolders.forEach(function (folder) {
                idMap[folder._id] = folder;
                isIncluded[folder._id] = folder.included;
                foldersMeta[folder._id] = {
                    title: folder.title,
                    included: folder.included
                };
                if (folder.parent != null) {
                    if (childrenMap[folder.parent] == null) {
                        childrenMap[folder.parent] = [];
                    }
                    childrenMap[folder.parent].push(folder._id);
                    return (parentsMap[folder._id] = folder.parent);
                }
            });
            repoFolders.push(rootEntry);

            const fullPaths = {};
            const relativePaths = {};
            repoFolders.forEach(function (folder) {
                folderPath = `${folder.title}`;
                let folderParentId = folder.parent;
                let folderParent = "";
                if (folderParentId != null) {
                    foldersMeta[folder._id].included =
                        foldersMeta[folder._id].included &&
                        isIncluded[folderParentId];
                    folderParent = idMap[folderParentId].title;
                }
                while (folderParentId != null) {
                    folderPath = path.join(folderParent, folderPath);
                    folderParentId = idMap[folderParentId].parent;
                    if (folderParentId != null) {
                        foldersMeta[folder._id].included =
                            foldersMeta[folder._id].included &&
                            isIncluded[folderParentId];
                        folderParent = idMap[folderParentId].title;
                    }
                }
                const absFolderPath = path.join(fullPath, folderPath);
                fullPaths[folder._id] = absFolderPath;
                return (relativePaths[folder._id] = folderPath);
            });
            const namesMap = {
                files: {}
            };

            const pathsArray = (() => {
                const result = [];
                for (let folderId in fullPaths) {
                    folderPath = fullPaths[folderId];
                    result.push(folderPath);
                }
                return result;
            })();
            const sourcePath = path.join(fullPath, rootTitle);
            try {
                await promiseSeries(
                    pathsArray.map(
                        folderPath =>
                            new Promise(async (resolve, reject) => {
                                await fs.mkdirp(folderPath, {
                                    mode: 0o0777
                                });
                            })
                    )
                );
                return resolve({
                    sourcePath,
                    fullPath,
                    fullPaths,
                    relativePaths,
                    foldersMeta
                });
            } catch (err) {
                console.error(err);
                rmdir(fullPath, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                });
                return reject({
                    error:
                        "An error occurred while creating the repository structure."
                });
            }
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

var writeSynthesisContainerFiles = (
    repo,
    includeTestbenches,
    allowIps,
    rootDir,
    cb
) => {
    return new Promise(async (resolve, reject) => {
        try {
            const {
                sourcePath,
                fullPath,
                fullPaths,
                relativePaths,
                foldersMeta
            } = await writeRepoFolderStructure(repo, allowIps, rootDir);

            let verilogEntries = await repo.getSynthesizable();
            let excludedEntries = await repo.getExcludedVerilog();
            verilogEntries = verilogEntries.filter(entry => {
                const isParentIncluded = foldersMeta[entry.parent].included;
                if (!isParentIncluded) {
                    excludedEntries.push(entry);
                }
                return isParentIncluded;
            });
            const filePaths = {
                verilog: [],
                testbenches: [],
                text: [],
                topModule: repo.topModule,
                exverilog: []
            };
            const namesMap = {
                files: {}
            };
            const writeEntries = (entries, key) =>
                entries.map(
                    entry =>
                        new Promise(async (resolve, reject) => {
                            try {
                                const entryPath = path.join(
                                    fullPaths[entry.parent],
                                    entry.title
                                );
                                const content = await entry.getContent();
                                try {
                                    await fs.writeFile(entryPath, content);
                                } catch (err) {
                                    console.error(err);
                                    return reject({
                                        error:
                                            "Failed to package repository files."
                                    });
                                }
                                const relativePath = path.join(
                                    relativePaths[entry.parent],
                                    entry.title
                                );
                                filePaths[key].push(relativePath);
                                namesMap.files[
                                    relativePath.substr(
                                        relativePath.indexOf("/") + 1
                                    )
                                ] = entry._id;
                                return resolve(entryPath);
                            } catch (err) {
                                rmdir(fullPath, function (err) {
                                    if (err) {
                                        return console.error(err);
                                    }
                                });
                                return reject(err);
                            }
                        })
                );
            await Promise.all(writeEntries(verilogEntries, "verilog"));
            await Promise.all(writeEntries(excludedEntries, "exverilog"));

            const textFiles = await repo.getEntries({
                handler: EntryType.TextFile
            });

            await Promise.all(writeEntries(textFiles, "text"));

            if (!includeTestbenches) {
                return resolve({
                    sourcePath,
                    fullPath,
                    filePaths,
                    fullPaths,
                    relativePaths,
                    namesMap
                });
            }
            const testbenches = await repo.getEntries({
                handler: EntryType.TestbenchFile
            });
            const commentsRegEx = () => new RegExp("\\/\\/.*$", "gm");
            const multiCommentsRegEx = () =>
                new RegExp("\\/\\*(.|[\\r\\n])*?\\*\\/", "gm");

            await Promise.all(
                testbenches.map(
                    entry =>
                        new Promise(async (resolve, reject) => {
                            const entryPath = path.join(
                                fullPaths[entry.parent],
                                entry.title
                            );
                            const content = await entry.getContent();
                            try {
                                await fs.writeFile(entryPath, content);
                            } catch (err) {
                                console.error(err);
                                return reject({
                                    error: "Failed to package repository files."
                                });
                            }
                            const relativePath = path.join(
                                relativePaths[entry.parent],
                                entry.title
                            );
                            filePaths.verilog.push(relativePath);
                            filePaths.testbenches.push(relativePath);
                            namesMap.files[
                                relativePath.substr(
                                    relativePath.indexOf("/") + 1
                                )
                            ] = entry._id;
                            content = content
                                .replace(commentsRegEx(), "")
                                .replace(multiCommentsRegEx(), "");
                            if (filePaths.topModule != null) {
                                const topModuleRegex = new RegExp(
                                    `${
                                    filePaths.topModule
                                    } +(\\w+) *\\([\\s\\S]+\\);?`,
                                    "gmi"
                                );
                                if (topModuleRegex.test(content)) {
                                    const moduleRegEx = () =>
                                        new RegExp(
                                            "^\\s*module\\s+(.+?)\\s*(#\\s*\\(([\\s\\S]+?)\\)\\s*)??\\s*((\\([\\s\\S]*?\\))?\\s*;)([\\s\\S]*?)endmodule",
                                            "gm"
                                        );
                                    const moduleMatches = moduleRegEx().exec(
                                        content
                                    );
                                    if (moduleMatches == null) {
                                        return callback({
                                            error: `Invalid testbench ${
                                                entry.title
                                                }`
                                        });
                                    }
                                    filePaths.topModule = moduleMatches[1];
                                }
                            }
                            return resolve(entryPath);
                        })
                )
            );
            return resolve({
                sourcePath,
                fullPath,
                filePaths,
                fullPaths,
                relativePaths,
                namesMap
            });
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const writeCompilationContainerFiles = (
    repo,
    target,
    startupFile,
    linkerFile,
    rootDir,
    cb
) => {
    if (typeof rootDir === "function") {
        cb = rootDir;
        rootDir = "";
    }
    writeRepoFolderStructure(repo, false, rootDir, function (err, result) {
        if (err) {
            return cb(err);
        } else {
            const {
                sourcePath,
                repoPath,
                fullPaths,
                relativePaths,
                foldersMeta
            } = result;
            return repo.getCompileable(function (err, swEntries) {
                if (err) {
                    return cb(err);
                } else {
                    const filePaths = {
                        c: [],
                        h: [],
                        linker: [],
                        startup: [],
                        text: []
                    };
                    const namesMap = {
                        files: {}
                    };
                    swEntries = swEntries.filter(
                        entry => foldersMeta[entry.parent].included
                    );
                    return async.eachSeries(
                        swEntries,
                        function (entry, callback) {
                            let needle;
                            if (
                                [
                                    EntryType.LinkerScript,
                                    EntryType.StartupScript
                                ].includes(entry.handler) &&
                                ((needle = entry._id.toString()),
                                    ![linkerFile, startupFile].includes(needle))
                            ) {
                                return callback();
                            }
                            const entryPath = path.join(
                                fullPaths[entry.parent],
                                entry.title
                            );

                            return entry.getContent(function (err, content) {
                                if (err) {
                                    return callback(err);
                                } else {
                                    return fs.writeFile(
                                        entryPath,
                                        content,
                                        function (err) {
                                            if (err) {
                                                console.error(err);
                                                return callback({
                                                    error:
                                                        "Failed to package repository files."
                                                });
                                            } else {
                                                let relativePath = path.join(
                                                    relativePaths[entry.parent],
                                                    entry.title
                                                );
                                                relativePath = relativePath.substr(
                                                    relativePath.indexOf("/") +
                                                    1
                                                );

                                                if (
                                                    entry.handler ===
                                                    EntryType.CFile
                                                ) {
                                                    filePaths.c.push(
                                                        relativePath
                                                    );
                                                } else if (
                                                    entry.handler ===
                                                    EntryType.HFile
                                                ) {
                                                    filePaths.h.push(
                                                        relativePath
                                                    );
                                                } else if (
                                                    entry.handler ===
                                                    EntryType.LinkerScript
                                                ) {
                                                    filePaths.linker.push(
                                                        relativePath
                                                    );
                                                } else if (
                                                    entry.handler ===
                                                    EntryType.StartupScript
                                                ) {
                                                    filePaths.startup.push(
                                                        relativePath
                                                    );
                                                }
                                                namesMap.files[relativePath] =
                                                    entry._id;
                                                return callback(
                                                    null,
                                                    entryPath
                                                );
                                            }
                                        }
                                    );
                                }
                            });
                        },
                        function (err) {
                            if (err) {
                                rmdir(repoPath, function (err) {
                                    if (err) {
                                        return console.error(err);
                                    }
                                });
                                return cb(err);
                            } else {
                                return repo.getEntries(
                                    {
                                        handler: EntryType.TextFile
                                    },
                                    function (err, textFiles) {
                                        if (err) {
                                            return cb(err);
                                        } else {
                                            return async.eachSeries(
                                                textFiles,
                                                function (entry, callback) {
                                                    const entryPath = path.join(
                                                        fullPaths[entry.parent],
                                                        entry.title
                                                    );

                                                    return entry.getContent(
                                                        function (err, content) {
                                                            if (err) {
                                                                return callback(
                                                                    err
                                                                );
                                                            } else {
                                                                return fs.writeFile(
                                                                    entryPath,
                                                                    content,
                                                                    function (
                                                                        err
                                                                    ) {
                                                                        if (
                                                                            err
                                                                        ) {
                                                                            console.error(
                                                                                err
                                                                            );
                                                                            return callback(
                                                                                {
                                                                                    error:
                                                                                        "Failed to package repository files."
                                                                                }
                                                                            );
                                                                        } else {
                                                                            const relativePath = path.join(
                                                                                relativePaths[
                                                                                entry
                                                                                    .parent
                                                                                ],
                                                                                entry.title
                                                                            );
                                                                            filePaths.text.push(
                                                                                relativePath
                                                                            );
                                                                            namesMap.files[
                                                                                relativePath.substr(
                                                                                    relativePath.indexOf(
                                                                                        "/"
                                                                                    ) +
                                                                                    1
                                                                                )
                                                                            ] =
                                                                                entry._id;
                                                                            return callback(
                                                                                null,
                                                                                entryPath
                                                                            );
                                                                        }
                                                                    }
                                                                );
                                                            }
                                                        }
                                                    );
                                                },
                                                function (err) {
                                                    if (err) {
                                                        rmdir(
                                                            repoPath,
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
                                                            sourcePath,
                                                            repoPath,
                                                            filePaths,
                                                            fullPaths,
                                                            relativePaths,
                                                            namesMap
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
            });
        }
    });
};

const packageRepo = (repo, cb) => {
    return new Promise(async (resolve, reject) => {
        try {
            const { repoPath, tempPath } = await writeTempRepo(repo);
            const repoZip = new ZipArchive();
            const zipPath = `${repoPath}.zip`;
            try {
                repoZip.addLocalFolder(repoPath);
                repoZip.writeZip(zipPath);
            } catch (err) {
                console.error(err);
                throw {
                    error: "Failed to package."
                };
            }
            rmdir(repoPath, function (err) {
                if (err) {
                    return console.error(err);
                }
            });
            return resolve({
                zipPath,
                tempPath
            });
        } catch (err) {
            return reject(err);
        }
    })
        .then(wrapResolveCallback(cb))
        .catch(cb);
};

const streamRepo = (repo, cb) => {
    packageRepo(repo, function (err, zipPath, tempPath) {
        if (err) {
            return cb(err);
        } else {
            const stream = fs.createReadStream(zipPath);
            stream.on("end", function () {
                fs.unlink(zipPath, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                });
                return rmdir(tempPath, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                });
            });

            return cb(null, stream);
        }
    });
}

const cleanupFiles = function (query, cb) {
    if (query == null) {
        query = {};
    }
    query.deleted = true;
    const repoFileModel = mongoose.model("RepoFile");
    return repoFileModel.find(query, function (err, files) {
        if (err) {
            return cb(err);
        } else {
            files.forEach(file =>
                clearFile(file.fsId, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                })
            );
            return repoFileModel.remove(query, cb);
        }
    });
};

module.exports = {
    getFileContent,
    getFileStream,
    getMediaFileStream,
    getFileEntry,
    getFileEntries,
    readFile,
    createFile,
    createMediaFile,
    fileExists,
    checkFileExistence,
    clearFileEntry,
    clearMediaFileEntry,
    clearFile,
    updateFile,
    updateMediaFileEntry,
    duplicateFile,
    renameFile,
    writeTempSimulationModules,
    writeNetlistSimulationModules,
    writeTempRepoModules,
    writeTempRepoModule,
    writeTempRepo,
    writeSynthesisContainerFiles,
    writeCompilationContainerFiles,
    writeTestbenchSimulationContainerFiles,
    writeNetlistSimulationContainerFiles,
    writeTestbenchFile,
    writeIPCoreFiles,
    writeTempNetlist,
    packageRepo,
    streamRepo,
    cleanupFiles
};
