const list = require("./list");

exports.handler = (event, context, callback) => {
    let body = event.body || {};

    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (err) {
            console.error(err);
            return callback(null, {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Invalid request body: String is not valid JSON.'
                })
            });
        }
    } else if (typeof body !== 'object') {
        return callback(null, {
            statusCode: 500,
            body: JSON.stringify({
                error: `Invalid request body: Unsupported type '${typeof body}'.`
            })
        });
    }

    let { subfunction } = body;

    if (!list.includes(subfunction)) {
        return callback(null, {
            statusCode: 500,
            body: JSON.stringify({
                error: `Unknown subfunction ${subfunction}.`
            })
        });
    }

    let subfunctionHandler = require(`./functions/${subfunction}/index`).handler;

    subfunctionHandler(event, context, callback);
};