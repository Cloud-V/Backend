const Repo = require("../../controllers/repo");

const repoAccessModel = require("../../models/repo_access");

const rmdir = require("rimraf");

const { AccessLevel } = repoAccessModel;

module.exports = async (req, res, next) => {
    if (!req.user || !req.user._id) {
        return res.status(401).json({
            error: "Authentication required.",
        });
    }
    const ownerName = req.params.username.toLowerCase();
    const repoName = req.params.reponame.toLowerCase();
    try {
        const { repository, accessLevel } = await Repo.accessRepo(
            ownerName,
            repoName,
            req.user._id,
            next
        );
        if (accessLevel < AccessLevel.ReadOnly) {
            return next();
        }
        const { zipPath, tempPath } = await repository.package();
        return res.download(
            zipPath,
            `${repository.repoTitle}.zip`,
            async (err) => {
                if (err) {
                    console.error(err);
                }
                return rmdir(tempPath, (rmerr) => {
                    if (rmerr) {
                        console.error(rmerr);
                    }
                });
            }
        );
    } catch (err) {
        return res.status(500).json(err);
    }
};
