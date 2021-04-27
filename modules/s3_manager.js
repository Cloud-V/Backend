const ZipArchive = require("adm-zip");
const AWS = require("aws-sdk");

const fs = require("fs");

AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: process.env.AWS_REGION || 'eu-central-1',
	signatureVersion: 'v4'
});

const s3 = new AWS.S3();

const upload = (filePath, bucket, key, cb) => s3.upload(
	{
		Bucket: bucket,
		Key: key,
		Body: fs.createReadStream(filePath)
	},
	function (err, resp) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to process the files.'
			});
		}
		return cb(null, resp, {
			bucket,
			key
		});
	}
);

const compress = (folderPath, zipPath, cb) => {
	try {
		const folderZip = new ZipArchive();
		folderZip.addLocalFolder(folderPath);
		folderZip.writeZip(zipPath);
		return cb(null, zipPath);
	} catch (e) {
		console.error(e);
		return cb({
			error: 'Failed to compress the files.'
		});
	}
}

const compressAndUpload = (folderPath, bucket, key, cb) => {
	const zipPath = `${folderPath}.zip`;
	return compress(folderPath, zipPath, function (err) {
		if (err) {
			return cb(err);
		}
		return upload(zipPath, bucket, key, function (err, resp, uri) {
			fs.unlink(zipPath, function (err) {
				if (err) {
					return console.error(err);
				}
			});
			return cb(err, resp, uri);
		});
	});
}


const download = (bucket, key, downloadPath, cb) => s3.getObject(
	{
		Bucket: bucket,
		Key: key
	}, function (err, resp) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to process the files.'
			});
		}
		return fs.writeFile(downloadPath, resp.Body, function (err) {
			if (err) {
				console.error(err);
				return cb({
					error: 'Failed to process the files.'
				});
			}
			return cb(null, resp, downloadPath, {
				bucket,
				key
			});
		});
	}
)

const remove = (bucket, key, cb) => s3.deleteObject(
	{
		Bucket: bucket,
		Key: key
	}, function (err, resp) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to process the files.'
			});
		}
		return cb(null, resp, {
			bucket,
			key
		});
	}
);

module.exports = {
	compress,
	upload,
	compressAndUpload,
	download,
	remove
};