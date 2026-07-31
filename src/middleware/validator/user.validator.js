const { body, validationResult } = require("express-validator");

// runs after the rule chains below, sends 400 if any rule failed
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

const registerValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be 2-50 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Enter a valid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  // Note: no .isStrongPassword() here on purpose — students, keep friction low.
  // Add stricter rules in Phase 2+ if you want.

  validate,
];

const loginValidator = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Enter a valid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required"),

  validate,
];

const emailValidator = body("email")
  .trim()
  .notEmpty()
  .withMessage("Email is required")
  .isEmail()
  .withMessage("Enter a valid email")
  .normalizeEmail();

const otpValidator = body("otp")
  .trim()
  .notEmpty()
  .withMessage("OTP is required")
  .isLength({ min: 6, max: 6 })
  .withMessage("OTP must be 6 digits")
  .isNumeric()
  .withMessage("OTP must contain only digits");

const verifyEmailValidator = [emailValidator, otpValidator, validate];

const forgotPasswordValidator = [emailValidator, validate];

const resendOtpValidator = [emailValidator, validate];

const resetPasswordValidator = [
  emailValidator,
  otpValidator,
  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
  validate,
];

module.exports = {
  registerValidator,
  loginValidator,
  verifyEmailValidator,
  forgotPasswordValidator,
  resendOtpValidator,
  resetPasswordValidator,
};
