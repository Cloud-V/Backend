'use strict';
const { handler } = require("..");

class Lambda {
    invoke(params, cb) {
        const event = JSON.parse(params.Payload);

        handler(event, {}, (err, response)=> {
            if (err) {
                return cb(err);
            }
            return cb(null, {
                Payload: JSON.stringify(response)
            });
        });
    }
};

module.exports = { Lambda };