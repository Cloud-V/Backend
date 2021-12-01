const AWS = require("aws-sdk");
const AWSConfig = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "eu-central-1",
    signatureVersion: "v4"
};

module.exports = { Lambda: AWS.Lambda };