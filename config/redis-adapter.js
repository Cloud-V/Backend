const config = require(".");

const redis = require("redis");
const adapter = require("socket.io-redis");

let { host, port, password } = config.redis;

const pub = redis.createClient(port, host, password);
const sub = redis.createClient(port, host, password);

module.exports = adapter({
    pubClient: pub,
    subClient: sub,
});
