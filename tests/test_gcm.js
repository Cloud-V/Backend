const googleCloudStorageManager = require("../modules/google-cloud/storage-manager");

const main = async () => {
    try {
        let content = 'hello world 3';
        let filename = 'omar1.txt';

        //Checking file existance
        console.log(`Checking file existence for file: ${filename}`)
        let fileExists = await googleCloudStorageManager.exists(filename);
        console.log(`It ${fileExists ? 'exists' : 'does not exist'}`);

        //Testing reading and writing 
        console.log('Running test 1...')
        await googleCloudStorageManager.upload(filename, content);
        let read_content = await googleCloudStorageManager.read(filename);
        if (content != read_content)
            throw ("Test 1 Failed")
        console.log("Test 1 Succeeded")

        //Testing deleting and checking existance
        console.log('Running test 2...')
        fileExists = await googleCloudStorageManager.exists(filename);
        if (!fileExists)
            throw ("Test 2 Failed")
        await googleCloudStorageManager.remove(filename);
        fileExists = await googleCloudStorageManager.exists(filename);
        if (fileExists)
            throw ("Test 2 Failed")
        console.log("Test 2 Succeeded")

    } catch (error) {
        console.log(error)
    }

}

main()