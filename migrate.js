const mongoose = require('mongoose');
const dbfs = require("./config/dbfs");
const db = require("./config/db");
const Grid = require("gridfs-stream");
const repofileModel = require("./models/repo_file");
const repoModel = require("./models/repo");
const fs = require("fs")
const config = require("./config");


const main = async () => {
    let fileName = "", content = ""
    let createdSuccessfully = 0, fsidsNotInGFSFiles = 0, fsidsNotInGFSChunks = 0, errorReadingFileContent = 0;

    try {
        await dbfs
        const gfs = Grid(dbfs.db, mongoose.mongo);

        let res = await db.model("RepoFile").find({}).exec()
        //201

        for (let cur of res) {
            let repo = await db.model("Repo").findOne({ _id: cur.repo }).exec()
            //Get file
            let file = await gfs.files.findOne({ _id: cur.fsId })
            if (!file || !file.filename) {
                // console.log(`${fileName} repo file fsid does not exist in gridfs-stream files`)
                fsidsNotInGFSFiles++;
                continue
            }

            //Filename
            fileName = config.repoFilesPath + "/" + file.filename

            //Update filename of RepoFile
            cur.fileName = fileName
            await cur.save()

            //Check file existance in gridfs-stream files collection
            gfs.exist({ _id: cur.fsId }, function (err, found) {
                if (err) throw err;
                if (!found) {
                    // console.log(`${fileName} repo file fsid does not exist in gridfs-stream chunks`)
                    fsidsNotInGFSChunks++
                    throw (`${fileName} repo file fsid does not exist in gridfs-stream chunks`)
                }
            });
            //Get file content
            const stream = gfs.createReadStream({
                _id: cur.fsId,
            });

            stream.on("data", (chunk) => (content = content + chunk));
            stream.on("end", () => {
                //Create file
                fs.writeFileSync(fileName, content)
                console.log(`${createdSuccessfully}: ${repo.repoName}/${cur.baseName}`)
                createdSuccessfully++
            });
            stream.on("error", err => {
                // console.log("Error reading file content");
                errorReadingFileContent++;
                throw err;
            })
        }
    } catch (err) {
        console.log(`Caught Error ${err}`)
    }
    return { createdSuccessfully, fsidsNotInGFSFiles, fsidsNotInGFSChunks, errorReadingFileContent }
}

main().then((res) => {
    console.log("\nStatus\n")
    console.log(`\t- Created Successfully: ${res.createdSuccessfully}`)
    console.log(`\t- Fsids Not In GFS Files collection: ${res.fsidsNotInGFSFiles}`)
    console.log(`\t- Fsids Not In GFS Chunks collection: ${res.fsidsNotInGFSChunks}`)
    console.log(`\t- Error Reading File Content: ${res.errorReadingFileContent}`)
}).catch()