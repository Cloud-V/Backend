const list = require("./lambda/list");
const config = require("../config");
const { Lambda } = require("./lambda/class");

const invokeLambda = async (functionName, body) => {
    const lambda = new Lambda();
    const params = {
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        LogType: "Tail",
        Payload: JSON.stringify({
            body
        })
    };
    return await new Promise(async (resolve, reject) => {
        lambda.invoke(params, function (err, data) {
            if (err) {
                console.error(err);
                return reject(err);
            }

            if (!data.Payload) {
                console.error(data);
                console.error(new Error("Payload is empty."));
                return reject({ error: "An internal error has occurred while executing your asynchronous job. Please contact support." });
            }
            const parsed = JSON.parse(data.Payload);

            if ((parsed ?? "") === "") {
                console.error(data);
                console.error(new Error(`Parsed payload is empty.`));
                return reject({ error: "An internal error has occurred while executing your asynchronous job. Please contact support." });
            }

            if ((parsed.body ?? "") === "") {
                console.error(data);
                console.error(new Error("Parsed payload lacks a body."));
                return reject({ error: "An internal error has occurred while executing your asynchronous job. Please contact support." });
            }

            let body = JSON.parse(parsed.body);

            return resolve(body);
        });
    });
};

async function executeLambda(endpoint, body) {
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (err) {
            console.error(err);
            throw { error: 'Invalid request body: String is not valid JSON.' };
        }
    } else if (typeof body !== 'object') {
        throw {
            error: `Invalid request body: Unsupported type '${typeof body}.'`
        };
    } else if (body === null) {
        throw { error: `Invalid request body: body is null.` };
    }

    body.subfunction = endpoint;

    let result = await invokeLambda(config.lambda.name, body);

    if (result.error) {
        throw result;
    }

    return result;
}

for (let endpoint of list) {
    module.exports[endpoint] = executeLambda.bind(null, endpoint);
}
