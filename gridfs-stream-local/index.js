const Grid = require("./Grid");

const myGrid = new Grid();

//Testing GridWriteStream
const writeStream = myGrid.createWriteStream({ filename: "newFile" });

writeStream.on("close", file => {
  console.log(`File id: ${file._id}`);
});
writeStream.on("error", error => {
  console.log("Error: ", error);
});

writeStream.run(); //This will need to be added in the main program

//Testing GridReadStream
let fsId = "6210a2cfbe97910a16619e32";
const readStream = myGrid.createReadStream({ _id: fsId });

readStream.on("data", chunck => {
  console.log(`Chunk: ${chunck}`)
})

readStream.on("error", error => {
  console.log("Error: ", error);
})

readStream.run()