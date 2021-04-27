const Repo = require("../controllers/repo");
const User = require("../controllers/user");
const FileManager = require("../controllers/file_manager");

const express = require("express");

const router = express.Router();

router.get('/', function (req, res, next) {
	if (!req.user.admin) {
		return res.status(401).send('Insufficient Permissions.');
	}
	return res.send('Cleanup..');
});

router.get('/all', function (req, res, next) {
	if (!req.user.admin) {
		return res.status(401).send('Insufficient Permissions.');
	}
	return User.cleanupUsers({}, function (err, clearedUsers) {
		if (err) {
			return res.status(500).json(err);
		} else {
			return Repo.cleanupRepos({}, function (err, clearedRepos) {
				if (err) {
					return res.status(500).json(err);
				} else {
					return Repo.cleanupRepoEntries({}, function (err, clearedEntries) {
						if (err) {
							return res.status(500).json(err);
						} else {
							return FileManager.cleanupFiles({}, function (err, clearedFiles) {
								if (err) {
									return res.status(500).json(err);
								} else {
									return res.status(200).json({
										users: clearedUsers.length,
										repos: clearedRepos.length,
										entries: clearedEntries.length,
										files: clearedFiles.length
									});
								}
							});
						}
					});
				}
			});
		}
	});
});


router.get('/files', function (req, res, next) {
	if (!req.user.admin) {
		return res.status(401).send('Insufficient Permissions.');
	}
	return FileManager.cleanupFiles({}, function (err, clearedFiles) {
		if (err) {
			return res.status(500).json(err);
		} else {
			return res.status(200).json({
				cleared: clearedFiles.length
			});
		}
	});
});

router.get('/users', function (req, res, next) {
	if (!req.user.admin) {
		return res.status(401).send('Insufficient Permissions.');
	}
	return User.cleanupUsers({}, function (err, clearedUsers) {
		if (err) {
			return res.status(500).json(err);
		} else {
			return res.status(200).json({
				cleared: clearedUsers.length
			});
		}
	});
});
router.get('/repos', function (req, res, next) {
	if (!req.user.admin) {
		return res.status(401).send('Insufficient Permissions.');
	}
	return Repo.cleanupRepos({}, function (err, clearedRepos) {
		if (err) {
			return res.status(500).json(err);
		} else {
			return res.status(200).json({
				cleared: clearedRepos.length
			});
		}
	});
});

router.get('/repoentries', function (req, res, next) {
	if (!req.user.admin) {
		return res.status(40).send('Insufficient Permissions.');
	}
	return Repo.cleanupRepoEntries({}, function (err, clearedEntries) {
		if (err) {
			return res.status(500).json(err);
		} else {
			return res.status(200).json({
				cleared: clearedEntries.length
			});
		}
	});
});


module.exports = router;