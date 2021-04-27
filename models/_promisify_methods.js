const promisifyMethods = (schema) => {
    schema.methods.p = {};
    for (let method in schema.methods) {
        schema.methods.p[method] = function(...va) {
            return new Promise((resolve, reject)=> {
                this[method](...va, (err, ...res) => {
                    if (err) {
                        return reject(err);
                    }
                    if (res.length === 0) {
                        return resolve();
                    }
                    if (res.length === 1) {
                        return resolve(res[0]);
                    }
                    return resolve(res);
                })
            });
        }
    }
};

module.exports = promisifyMethods;