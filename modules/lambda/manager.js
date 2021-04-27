const list = require("./list");

const signedRequest = require("../signed_request");
const config = require("../../config");

const AWS = require("aws-sdk");
const urlj = require("url-join");

const AWSConfig = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "eu-central-1",
    signatureVersion: "v4"
};

const createLambda = async (functionName, body = {}) => {
    const lambda = new AWS.Lambda();
    const params = {
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        LogType: "Tail",
        Payload: JSON.stringify({
            body: typeof body === "object" ? body : JSON.parse(body)
        })
    };
    return await new Promise(async (resolve, reject) => {
        lambda.invoke(params, function(err, data) {
            if (err) {
                console.error(err);
                return reject(err);
            }
            if (!data.Payload) {
                console.error(data);
                console.error(new Error("Payload is empty."));
                return reject({error: "Unexpected response from asynchronous job. Please contact support."});
            }

            const parsed = JSON.parse(data.Payload);

            if (!parsed.body) {
                console.error(data);
                console.error(new Error("No body."));
                return reject({error: "An internal error has occurred while executing your asynchronous job. Please contact support."});
            }

            let body = JSON.parse(parsed.body);

            return resolve(body);
        });
    });
};

async function executeLambda(endpoint, body, forceLocal=false) {
    if (config.lambda.local || forceLocal) {
        return await signedRequest({
            host: config.proc.host,
            path: urlj("llambda", endpoint),
            body: body
        }, "http", false);
    }
    return await createLambda(config.lambda.urls[endpoint].name, body);
}

for (let endpoint of list) {
    module.exports[endpoint] = executeLambda.bind(null, endpoint);
}
