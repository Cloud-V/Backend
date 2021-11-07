exports.handler = async (event, context, callback) => {
    console.log(body);
    
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
                error: `Invalid request body: Unsupported type '${typeof body}'`
            })
        });
    }
    
    let { subfunction } = body;

    let subfunctionHandler = require(`./functions/${subfunction}/index`).handler;

    subfunctionHandler(event, context, callback);
};