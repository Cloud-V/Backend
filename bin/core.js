const config = require("../config");
const User = require("../controllers/user");
const InvalidToken = require("../models/invalid_token").model;

const cluster = require("cluster");

const jwt = require("jsonwebtoken");
const http = require("http");

const coreCount = require("os").cpus().length;

let main = () => {
    console.log(`[${new Date().toISOString()}] Starting Cloud V...`);
    global.workersCount =
        process.env.CLOUDV_JOBS || (coreCount > 1 ? coreCount : 2);
    global.userCountKey = "usercount";
    global.userConnectionsKey = "userconn";

    const port = config.port;

    const app = require("../app");
    app.set("port", port);

    const server = http.createServer(app);
    server.listen(port);
    server.on("error", onError);
    server.on("listening", onListening);
    server.timeout = 10 * 1000 * 60;

    // Configure Socket.IO / Redis
    if (config.useSockets) {
        console.log(
            `[${new Date().toISOString()}] Setting up sockets with Redis...`
        );
        const redisClient = require("../config/redis");
        const io = (global.io = require("socket.io")(server));
        const { onConnect, onDisconnect } = require("../controllers/sockets");
        global.userCount = 0;
        global.socketUser = {};
        global.userSockets = {};
        global.repoSockets = {};
        global.socketRepo = {};

        require("socketio-auth")(io, {
            authenticate: async (socket, data, callback) => {
                if (!data || !data.token) {
                    return callback(null, false);
                }
                const { token } = data;
                let decoded;
                try {
                    decoded = await jwt.verify(token, config.jwtSecret);
                } catch (e) {
                    console.error(e);
                    return callback(null, false);
                }
                let invalidToken;
                try {
                    invalidToken = await InvalidToken.findOne({
                        token: token,
                    }).exec();
                } catch (e) {
                    console.error(e);
                    return callback(null, false);
                }
                if (invalidToken) {
                    return callback(null, false);
                }
                return callback(null, true);
            },
            postAuthenticate: async (socket, data) => {
                if (!data || !data.token) {
                    return;
                }
                const { token } = data;

                let decoded;
                try {
                    decoded = await jwt.verify(token, config.jwtSecret);
                } catch (e) {
                    console.error(e);
                    return;
                }
                let invalidToken;
                try {
                    invalidToken = await InvalidToken.findOne({
                        token: token,
                    }).exec();
                } catch (e) {
                    console.error(e);
                    return;
                }
                let socketUser;
                try {
                    socketUser = await User.getUser({
                        _id: decoded._id,
                    });
                } catch (e) {
                    console.error(e);
                    return;
                }
                socket.client.user = socketUser;
                onConnect(socket, socketUser);
            },
            disconnect: (socket) => {
                onDisconnect(socket);
            },
        });
        if (cluster.isMaster) {
            redisClient.del(userConnectionsKey, redisClient.print);
        }
        const redisAdapter = require("../config/redis-adapter");
        io.adapter(redisAdapter);
    }

    function onListening() {
        const addr = server.address();
        const bind =
            typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
        console.log(
            `[${new Date().toISOString()}] Startup complete, awaiting requests...`
        );
    }

    function onError(error) {
        if (error.syscall !== "listen") {
            throw error;
        }

        const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;
        // handle specific listen errors with friendly messages
        switch (error.code) {
            case "EACCES":
                console.error(bind + " requires elevated privileges");
                process.exit(1);
                break;
            case "EADDRINUSE":
                console.error(bind + " is already in use");
                process.exit(1);
                break;
            default:
                throw error;
        }
    }
};

module.exports = main;
