const mongoose = require('mongoose'), 
    Schema = mongoose.Schema;

mongoose.connect("mongodb+srv://user:WlqRwJWlQVh3ifKw@cluster0.mea1a.mongodb.net/gridfs-stream-local-db");

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));

//Schema definition
const filesSchema = new Schema({
    filename : String,
    uploadDate : { type: Date, default: Date.now() },
    contentType : String,
    length : Number,
    
});

//Model compilation
const File = mongoose.model("files",filesSchema);


const createFile =async (p_file) =>{

    //New File instance
    let newFile  = new File(p_file);

    //Save file to database
    let dbFile = await newFile.save();
    return(dbFile)
}

const getFile = async (id) => {
    let dbFile = await File.findOne({_id: id})
    return(dbFile)
}
module.exports = {
    createFile,
    getFile
}

//https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs/mongoose