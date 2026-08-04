const express = require("express");
const { verifyUser } = require("../middleware/user.middleware");
const { verifyAdmin } = require("../middleware/admin.middleware");
const {
  upload,
  submitContact,
  listFeedback,
  deleteFeedback,
} = require("../controllers/contact.controller");

const router = express.Router();

/** Public — landing Contact / Feedback form */
router.post("/", upload.single("screenshot"), submitContact);

/** Admin — Profile Inbox */
router.get("/admin", verifyUser, verifyAdmin, listFeedback);
router.delete("/admin/:id", verifyUser, verifyAdmin, deleteFeedback);
router.post("/admin/delete", verifyUser, verifyAdmin, deleteFeedback);

module.exports = router;
