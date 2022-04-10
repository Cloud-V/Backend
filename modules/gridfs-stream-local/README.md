# gridfs-stream-local

Does the same functionality as gridfs-stream but stores the files locally instead of storing them in the database. It only stores the meta data of the files in the database.

## How to run?

`node index.js`

To connect to a different database, change the uri in the Database.js file to the new MongoDB connection link.

## Dependencies

1. NodeJS "events" package
2. NodeJS "mongodb" package

## How to migrate from gridfs-stream to gridfs-stream-local?

Leave all the gridfs-stream code as is. All what you need to do is 2 things:

1. Import Grid from gridfs-stream-local rather than from gridfs-stream
2. Call `run()` member function inside the object returned by both createWriteStream and createReadStream. Check the sample code at index.js to understand more.

## Limitations

1. GridReadStream reads files given only their id. It does not handle retrieving files by any other parameters.
2. GridWriteStream handles empty options parameter and options with filename property only. It does not handle any other options
3. The program does not handle writing files with the same name

## Files Description

Gridfs Files:

1. Grid.js: is the main class containing instances of GridWriteStream and GridReadStream
2. GridReadStream.js: is the class responsible for reading a file's content given its id by firstly retrieving the file's name from the database then reading the file's content.
3. GridWriteStream.js: is the class responsible for writing a file given its name by firstly storing the file in the database then writing the file.

Database.js: is responsible for handling everything related to the database. In this file:

1. Connection to the database is established.
2. Functions for reading and writing are created and exported.

# License

The Apache License, version 2.0. See `License`.
