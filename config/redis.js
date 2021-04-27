const redis = require("redis");
const config = require(".");
const redisClientOptions = config.redis;
const redisClient = redis.createClient(redisClientOptions);

module.exports = redisClient;
