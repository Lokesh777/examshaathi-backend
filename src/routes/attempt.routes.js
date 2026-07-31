const express = require("express");
const attemptController = require("../controllers/attempt.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();

router.get(
    "/attempts",
    verifyUser,
    attemptController.getMyAttempts
);

router.get(
    "/attempts/:attemptId",
    verifyUser,
    attemptController.getAttemptDetail
);

module.exports = router;