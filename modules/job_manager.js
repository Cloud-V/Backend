const Config = require("../config").batch;

const AWS = require("aws-sdk");

AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: process.env.AWS_REGION || 'eu-central-1',
	signatureVersion: 'v4'
});

const Queues = { SynthSmallQueue: 'cloudv_synth_small_queue' };
const ScriptsPaths = { Synthesize: '/usr/local/scripts/synthesize.js' };
const JobDefs = { Synthesize: 'arn:aws:batch:eu-central-1:768057335468:job-definition/cloudv_synthesize:5' };

const batch = new AWS.Batch();

const JobTimeout = 15 * 60; //15 minutes

let submitSynthesisJob = (jobName, s3Url, invocationBody, cb) => {
	const command = [
		"fetch_and_run.sh",
		"node",
		Config.scriptsPaths.synthesize,
		`'${typeof invocationBody === 'object' ? JSON.stringify(invocationBody) : invocationBody}'`
	];
	return batch.submitJob({
		"containerOverrides": {
			"command": command,
			environment: [{
					"name": "BATCH_FILE_S3_URL",
					"value": s3Url
				},
				{
					"name": "BATCH_FILE_TYPE",
					"value": "zip"
				}
			],
			"memory": Config.memory,
			"vcpus": Config.cpu
		},
		"jobDefinition": Config.jobDefs.synthesize,
		"jobName": jobName,
		"jobQueue": Config.queues.synthSmallQueue,
		"retryStrategy": {
			"attempts": 3
		},
		"timeout": {
			"attemptDurationSeconds": JobTimeout
		}
	}, function (err, job) {
		if (err) {
			console.error(err);
			return cb({
				error: 'Failed to submit the job'
			});
		}
		return cb(null, job);
	});
}

module.exports = { submitSynthesisJob };
