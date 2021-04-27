const { PassThrough, Readable } = require("stream");

class Environment {
	constructor(container, timeout, timeoutCallback) {
		this.container = container;
		if (timeout == null) {
			timeout = 0;
		}
		this.timeout = timeout;
		this.timeoutCallback = timeoutCallback;
		if (this.timeout > 0) {
			this.timeoutCode = setTimeout((() => {
				this.isTimedOut = true;
				return this.checkAndDestroy(err => {
					if (typeof this.timeoutCallback === 'function') {
						if (err) {
							return this.timeoutCallback(err);
						} else {
							return this.timeoutCallback({
								error: 'Process timed-out.'
							});
						}
					}
				});
			}), this.timeout * 1000);
		}
	}
	destroy(cb) {
		if (cb == null) {
			cb = function () {};
		}
		this.destroyed = true;
		return this.container.stop((err, data) => {
			if (err) {
				console.error(err);
				return cb({
					error: 'Unexpected environment error.'
				});
			}
			return this.container.remove(err => {
				if (err) {
					return console.error(err);
				} else {
					if (this.isTimedOut) {
						console.warn('Container removed forcefully.');
					}
					if (this.timeoutCode) {
						clearTimeout(this.timeoutCode);
					}
					return cb();
				}
			});
		});
	}
	checkAndDestroy(cb) {
		if (cb == null) {
			cb = function () {};
		}
		this.destroyed = true;
		return this.container.inspect((err, data) => {
			if (err) {
				if ((err.statusCode != null) && (err.statusCode === 404)) {
					return;
				}
				console.error(err);
				return cb({
					error: 'Unexpected environment error.'
				});
			} else {
				if (this.isTimedOut) {
					console.warn('Container timed out.');
				}
				if ((data != null) && !data.State.Running) {
					return this.container.remove(err => {
						if (err) {
							console.error(err);
							return cb({
								error: 'Unexpected environment error.'
							});
						} else {
							if (this.isTimedOut) {
								console.warn('Container removed forcefully.');
							}
							return cb();
						}
					});
				} else {
					return this.container.stop((err, data) => {
						if (err) {
							console.error(err);
						}
						return this.container.remove(err => {
							if (err) {
								console.error(err);
								return cb({
									error: 'Unexpected environment error.'
								});
							} else {
								if (this.isTimedOut) {
									console.warn('Container removed forcefully.');
								}
								return cb();
							}
						});
					});
				}
			}
		});
	}
	readBinary(file, destroyOnFail, cb) {
		if (typeof destroyOnFail === 'function') {
			cb = destroyOnFail;
			destroyOnFail = false;
		}
		const opts = {
			Cmd: ['cat', `${file}`],
			AttachStdout: true,
			AttachStderr: true
		};
		return this.container.exec(opts, (err, exec) => {
			if (err) {
				console.error(err);
				if (destroyOnFail) {
					this.checkAndDestroy();
				}
				return cb({
					error: 'Failed to prepare repository environment.'
				}, this.container);
			}
			return exec.start((err, stream) => {
				if (err) {
					console.error(err);
					if (destroyOnFail) {
						this.checkAndDestroy();
					}
					return cb({
						error: 'Failed to prepare repository environment.'
					}, this.container);
				}
				const outputBuffer = [];
				let errStr = '';
				const outStream = new PassThrough;
				const errStream = new PassThrough;
				this.container.modem.demuxStream(stream, outStream, errStream);
				outStream.on('data', chunk => {
					return outputBuffer.push(chunk);
				});
				errStr = '';
				errStream.on('data', chunk => errStr += chunk.toString());
				let exited = false;
				stream.on('error', err => {
					console.error(err);
					if (destroyOnFail) {
						this.checkAndDestroy();
					}
					exited = true;
					return cb({
						error: 'Failed to prepare repository files for processing(9).'
					}, container);
				});
				return stream.on('end', err => {
					if (exited) {
						return;
					}
					return cb(null, Buffer.concat(outputBuffer), errStr);
				});
			});
		});
	}

	run(command, destroyOnFail, cb) {
		if (typeof command === 'string') {
			command = command.split(' ');
		}
		if (this.destroyed) {
			return cb({
				error: 'Unexpected environment error.'
			});
		}
		if (typeof destroyOnFail === 'function') {
			cb = destroyOnFail;
			destroyOnFail = false;
		}
		const opts = {
			Cmd: command,
			AttachStdout: true,
			AttachStderr: true
		};
		return this.container.exec(opts, (err, exec) => {
			if (err) {
				console.error(err);
				if (destroyOnFail) {
					this.checkAndDestroy();
				}
				return cb({
					error: 'Failed to prepare repository environment.'
				}, this.container);
			}
			return exec.start((err, stream) => {
				if (err) {
					console.error(err);
					if (destroyOnFail) {
						this.checkAndDestroy();
					}
					return cb({
						error: 'Failed to prepare repository environment.'
					}, this.container);
				}
				let outputStr = '';
				let errStr = '';
				const outStream = new PassThrough;
				const errStream = new PassThrough;
				this.container.modem.demuxStream(stream, outStream, errStream);
				outStream.on('data', chunk => {
					return outputStr += chunk.toString();
				});
				errStr = '';
				errStream.on('data', chunk => errStr += chunk.toString());
				let exited = false;
				stream.on('error', err => {
					console.error(err);
					if (destroyOnFail) {
						this.checkAndDestroy();
					}
					exited = true;
					return cb({
						error: 'Failed to prepare repository files for processing(9).'
					}, container);
				});
				return stream.on('end', err => {
					if (exited) {
						return;
					}
					return cb(null, outputStr, errStr);
				});
			});
		});
	}
	copy(source, dest, destroyOnFail, cb) {
		return this.run([
			'cp',
			'-a',
			'-f',
			`${source}`,
			`${dest}`
		], destroyOnFail, cb);
	}

	cd(dir, destroyOnFail, cb) {
		return this.run([
			'cd',
			`${dir}`
		], destroyOnFail, cb);
	}

	read(file, destroyOnFail, cb) {
		return this.run([
			'cat',
			`${file}`
		], destroyOnFail, cb);
	}

	write(file, content, destroyOnFail, cb) {
		if (this.destroyed) {
			return cb({
				error: 'Unexpected environment error.'
			});
		}
		if (typeof destroyOnFail === 'function') {
			cb = destroyOnFail;
			destroyOnFail = false;
		}
		const opts = {
			Cmd: ['tee', file],
			AttachStdout: true,
			AttachStderr: true,
			AttachStdin: true
		};
		return this.container.exec(opts, (err, exec) => {
			if (err) {
				console.error(err);
				if (destroyOnFail) {
					this.checkAndDestroy();
				}
				return cb({
					error: 'Failed to prepare repository environment.'
				}, this.container);
			}
			return exec.start({
				hijack: true,
				stdin: true
			}, (err, stream) => {
				if (err) {
					console.error(err);
					if (destroyOnFail) {
						this.checkAndDestroy();
					}
					return cb({
						error: 'Failed to prepare repository environment.'
					}, this.container);
				} else {
					const readable = new Readable;
					readable.push(content);
					readable.push(null);

					let exited = false;
					let errStr = '';
					let outputStr = '';
					const outStream = new PassThrough;
					const errStream = new PassThrough;

					stream.on('data', function () {});

					this.container.modem.demuxStream(stream, outStream, errStream);
					outStream.on('data', chunk => {
						return outputStr += chunk.toString();
					});

					errStr = '';
					errStream.on('data', chunk => errStr += chunk.toString());

					exited = false;
					stream.on('error', err => {
						console.error(err);
						if (destroyOnFail) {
							this.checkAndDestroy();
						}
						exited = true;
						return cb({
							error: 'Failed to prepare repository files for processing(9).'
						}, this.container);
					}); //

					readable.pipe(stream);
					return stream.on('close', function () {
						if (exited) {
							return;
						}
						return cb(null, outputStr, errStr);
					});
				}
			});
		});
	}
}

module.exports = Environment;