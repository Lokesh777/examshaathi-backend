const express = require("express");
const userController = require("../controllers/user.controller");
const {
  registerValidator,
  loginValidator,
} = require("../middleware/validator/user.validator");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();

router.post("/register", registerValidator, userController.register);

router.post("/login", loginValidator, userController.login);

router.post("/logout", verifyUser, userController.logout);

router.post("/logout-all", verifyUser, userController.logoutAll);

router.get("/users", verifyUser, userController.userList);

router.get("/me", verifyUser, userController.getMe);

router.post("/verify-email", userController.verifyEmail);

router.post("/forgot-password", userController.forgotPassword);

router.post("/reset-password", userController.resetPassword);

router.post("/update-password", verifyUser, userController.updatePassword);

router.post("/refresh-token", userController.handleRefreshToken);

module.exports = router;
