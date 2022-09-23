const config = require("../../config");

const { Storage } = require('@google-cloud/storage');

const bucketName = config.googleCloudBucketName;

const storage = new Storage();
//TODO: Multer to check file size
//TODO: Error checking

const read = async (filename) => {
    let file = storage.bucket(bucketName).file(filename)
    let res = await file.download();
    return res.toString()
}
const upload = async (filename, content) => {
    //In case of collision, it overwrites.
    let file = storage.bucket(bucketName).file(filename)
    await file.save(content)
}
const remove = async (filename) => {
    let file = storage.bucket(bucketName).file(filename)
    await file.delete()
}
const exists = async (filename) => {
    let file = storage.bucket(bucketName).file(filename)
    let res = await file.exists()
    return res[0]
}
const createReadStream = (filename) => { //TODO: Remove this function
    console.log("FileName: ", filename)
    let file = storage.bucket(bucketName).file(filename)
    return file.createReadStream();
}
module.exports = {
    read,
    upload,
    remove,
    exists,
    createReadStream
};