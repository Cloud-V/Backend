const restrict = require("../../passport/restrict");

const Repo = require("../../controllers/repo");

const express = require("express");

const router = express.Router();

router.get("/", restrict, async (req, res, next) => {
	const logged = req.isAuthenticated() || false;
	const owner = req.user._id;
	const { username } = req.user;
	const ownerName = username;
	const isOwner = true;

	try {
		repositories = await Repo.getRepos(
			{
				owner
			},
			{
				page: req.query.page || req.query.p || 0
			}
		);
		return res.status(200).json({
			repositories,
			isOwner: true
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: `Failed to load dashboard, ${err.error}`
		});
	}
});
router.get("/shared", restrict, async (req, res, next) => {
	const logged = req.isAuthenticated() || false;
	const owner = req.user._id;
	const { username } = req.user;
	const ownerName = username;
	const isOwner = true;
	try {
		repositories = await Repo.getSharedRepos(owner, {
			page: req.query.page || req.query.p || 0
		});
		return res.status(200).json({
			repositories
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: `Failed to load dashboard, ${err.error}`
		});
	}
});
router.get("/watching", restrict, async (req, res, next) => {
	const logged = req.isAuthenticated() || false;
	const owner = req.user._id;
	const { username } = req.user;
	const ownerName = username;
	const isOwner = true;
	try {
		repositories = await Repo.getWatchingRepos(owner, {
			page: req.query.page || req.query.p || 0
		});
		return res.status(200).json({
			repositories
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: `Failed to load dashboard, ${err.error}`
		});
	}
});

router.post("/new", restrict, async (req, res, next) => {
	const { body } = req;
	body.owner = req.user._id;
	body.isTrial = false;
	const settings = {
		theme: 0,
		fontSize: 15
	};
	let repo;
	try {
		repo = await Repo.createRepo(body);
	} catch (e) {
		return res.status(500).json(e);
	}
	return res.status(201).json(repo);
});

module.exports = router;
