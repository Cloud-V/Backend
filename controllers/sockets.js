const Repo = require("./repo");

const redisClient = require("../config/redis");
const repoAccessModel = require("../models/repo_access");

const { AccessLevel } = repoAccessModel;

module.exports.onDisconnect = function (socket) {
	let userId = undefined;
	let repoId = undefined;
	if (global.socketUser[socket.id] != null) {
		userId = global.socketUser[socket.id]._id;
		delete global.socketUser[socket.id];
	} else {
		// console.error('User not found..');
		return;
	}
	if (global.socketRepo[socket.id]) {
		repoId = global.socketRepo[socket.id]._id;
		delete global.socketRepo[socket.id];
	}
	let index = -1;
	if (Array.isArray(global.userSockets[userId]) && ((index = global.userSockets[userId].indexOf(socket)) !== -1)) {
		global.userSockets[userId].splice(index, 1);
	}
	if (Array.isArray(global.repoSockets[repoId])) {
		for (let i = 0, end = global.repoSockets[repoId].length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
			index = -1;
			if (global.repoSockets[repoId][i].socket === socket) {
				index = i;
				break;
			}
		}
		if (index >= 0) {
			global.repoSockets[repoId].splice(index, 1);
		}
	}
	if (Array.isArray(global.userSockets[userId]) && (global.userSockets[userId].length === 0)) {
		global.userCount--;
		if (global.userCount < 0) {
			console.error(`Invalid user count: ${global.userCount}`);
			global.userCount = 0;
		}
	}
	if (global.userConnectionsKey) {
		return redisClient.zincrby(global.userConnectionsKey, -1, userId.toString(), function (err, reply) {
			if (err) {
				return console.error(err);
			}
		});
	}
}
module.exports.onConnect = async function (socket, user) {
	const {
		ownerName,
		repoName
	} = socket.handshake.query;
	const userId = user._id;
	if (!ownerName || !repoName) {
		return socket.disconnect(true);
	}
	const next = socket => () => socket.disconnect(true);
	try {
		const {
			repository,
			accessLevel
		} = await Repo.accessRepo(ownerName, repoName, userId, next(socket));
		if (accessLevel < AccessLevel.ReadWrite) {
			console.error(err);
			return socket.disconnect(true);
		}
		global.socketUser[socket.id] = user;
		global.socketRepo[socket.id] = repository;

		if (((global.userSockets[userId.toString()] == null)) || (global.userSockets[userId.toString()].length === 0)) {
			global.userSockets[userId.toString()] = [];
			global.userCount++;
		}

		if (((global.repoSockets[repository._id.toString()] == null)) || (global.repoSockets[repository._id.toString()].length === 0)) {
			global.repoSockets[repository._id.toString()] = [];
		}

		if (global.userConnectionsKey) {
			redisClient.zincrby(global.userConnectionsKey, 1, userId.toString(), function (err, reply) {
				if (err) {
					return console.error(err);
				}
			});
		}

		global.repoSockets[repository._id.toString()].push({
			socket,
			user: userId,
			accessLevel,
			repoId: repository._id.toString()
		});
		return global.userSockets[userId.toString()].push(socket);
	} catch (err) {
		console.error(err);
		return socket.disconnect(true);
	}
}