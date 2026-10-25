const express = require("express");
const userController = require("../controllers/user.controller");
const {
  registerValidator,
  loginValidator,
  verifyEmailValidator,
  forgotPasswordValidator,
  resendOtpValidator,
  resetPasswordValidator,
} = require("../middleware/validator/user.validator");
const { verifyUser } = require("../middleware/user.middleware");
const { verifyAdmin } = require("../middleware/admin.middleware");

const router = express.Router();

router.post("/register", registerValidator, userController.register);

router.post("/login", loginValidator, userController.login);

router.post("/logout", verifyUser, userController.logout);

router.post("/logout-all", verifyUser, userController.logoutAll);

router.get("/users", verifyUser, verifyAdmin, userController.userList);

router.get("/me", verifyUser, userController.getMe);

router.post("/verify-email", verifyEmailValidator, userController.verifyEmail);

router.post("/forgot-password", forgotPasswordValidator, userController.forgotPassword);

router.post("/resend-otp", resendOtpValidator, userController.resendOtp);

router.post("/reset-password", resetPasswordValidator, userController.resetPassword);

router.post("/update-password", verifyUser, userController.updatePassword);

router.post("/refresh-token", userController.handleRefreshToken);

module.exports = router;
