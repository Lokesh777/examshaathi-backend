const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { cookies_options } = require("../utils/cookieOptions.utils");
const mongoose = require("mongoose");
const {
  generateRefreshToken,
  generateAccessToken,
} = require("../utils/token.utils");

const sessionModel = require("../models/session.model");
const sendEmail = require("../services/email.service");
const { generateOTP, getOtpHTML } = require("../utils/emailUtils");
const otpModel = require("../models/otp.model");
const config = process.env;
const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
const OTP_EXPIRY_MS =
  (Number(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function saveOtpAndSendEmail(user, subject) {
  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, saltRounds);

  // Replace any existing OTP so createdAt always reflects the latest send
  await otpModel.deleteMany({ email: user.email });
  await otpModel.create({
    email: user.email,
    otpHash,
    user: user._id,
  });

  const html = getOtpHTML(otp, user.name);

  try {
    await sendEmail(
      user.email,
      subject,
      `Your OTP code is ${otp}`,
      html
    );
  } catch (err) {
    console.error("Failed to send OTP:", err.message);
    throw new Error("Unable to send email");
  }
}

async function verifyStoredOtp(email, otp) {
  const normalizedEmail = normalizeEmail(email);

  let storedOtpDoc = await otpModel
    .findOne({ email: normalizedEmail })
    .sort({ createdAt: -1 });

  // Fallback for OTPs saved before email normalization
  if (!storedOtpDoc) {
    storedOtpDoc = await otpModel
      .findOne({
        email: {
          $regex: new RegExp(
            `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
      })
      .sort({ createdAt: -1 });
  }

  if (!storedOtpDoc) {
    return { valid: false, error: "Invalid email or OTP" };
  }

  const isExpired =
    Date.now() - storedOtpDoc.createdAt.getTime() > OTP_EXPIRY_MS;

  if (isExpired) {
    await otpModel.deleteMany({ email: storedOtpDoc.email });
    return {
      valid: false,
      error: "OTP has expired. Please request a new one.",
      code: "OTP_EXPIRED",
    };
  }

  const isOtpValid = await bcrypt.compare(
    String(otp).trim(),
    storedOtpDoc.otpHash
  );

  if (!isOtpValid) {
    return { valid: false, error: "Invalid OTP" };
  }

  return { valid: true, userId: storedOtpDoc.user };
}

async function createAuthSession(req, res, user) {
  const sessionId = new mongoose.Types.ObjectId();
  const refreshToken = generateRefreshToken(user, sessionId);
  const refreshTokenHash = await bcrypt.hash(refreshToken, saltRounds);

  await sessionModel.create({
    _id: sessionId,
    user: user._id,
    refreshTokenHash,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  const accessToken = generateAccessToken(user, sessionId);
  res.cookie("refreshToken", refreshToken, cookies_options);

  return accessToken;
}

function formatAuthUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    verified: user.verified,
    role: user.role,
    selectedExamId: user.selectedExamId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function register(req, res) {
  const { name, password } = req.body;
  const email = normalizeEmail(req.body.email);
  try {
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = await userModel.create({
      name,
      email,
      password: hashedPassword,
    });
    try {
      await saveOtpAndSendEmail(user, "Verify Email");
    } catch (err) {
      console.error(err.message);
    }

    return res.status(200).json({
      success: true,
      message: "User registered successfully. OTP is being sent to your email.",
      data: {
        name: user.name,
        email: user.email,
        verified: user.verified,
        role: user.role,
        _id: user._id,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function login(req, res) {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  try {
    const user = await userModel.findOne({ email });

    // User not found
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Wrong credentials",
      });
    }

    // Check password first
    const isPasswordMatched = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordMatched) {
      return res.status(400).json({
        success: false,
        message: "Wrong credentials",
      });
    }

    // Email not verified — credentials are correct, send OTP for verification
    if (!user.verified) {
      try {
        await saveOtpAndSendEmail(user, "Verify Email");
      } catch (err) {
        console.error(err.message);
      }

      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Email is not verified. A new OTP has been sent to your email.",
      });
    }

    const accessToken = await createAuthSession(req, res, user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: formatAuthUser(user),
      accessToken,
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function verifyEmail(req, res) {
  const { otp } = req.body;
  const email = normalizeEmail(req.body.email);

  try {
    const otpResult = await verifyStoredOtp(email, otp);

    if (!otpResult.valid) {
      return res.status(400).json({
        success: false,
        message: otpResult.error,
        ...(otpResult.code && { code: otpResult.code }),
      });
    }

    const user = await userModel.findByIdAndUpdate(
      otpResult.userId,
      { verified: true },
      { returnDocument: "after" }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await otpModel.deleteMany({ user: otpResult.userId });

    const accessToken = await createAuthSession(req, res, user);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: formatAuthUser(user),
      accessToken,
    });

  } catch (error) {
    console.error("Error verifying email:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function logout(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "Refresh token not found!",
    });
  }
  const decoded = jwt.verify(refreshToken, config.JWT_SECRET);

  // Find session
  const session = await sessionModel.findById(decoded.sessionId);
  try {
    if (!session || session.revoked) {
      return res.status(401).json({
        success: false,
        message: "Session not found or already revoked!",
      });
    }
    // Compare refresh token with stored hash
    const isValid = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token!",
      });
    }

    // Revoke session
    session.revoked = true;
    await session.save();

    res.clearCookie("refreshToken", cookies_options);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (e) {
    console.error(e);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token.",
    });
  }
}

async function logoutAll(req, res){
  try{
    const refreshToken = req.cookies.refreshToken;
    if(!refreshToken){
      return res.status(401).json({
        success: false,
        message: "Refresh token not found!",
      });
    }

    const decoded = jwt.verify(refreshToken, config.JWT_SECRET);

    await sessionModel.updateMany(
      { user: decoded.id, revoked:false },
      { $set: { revoked: true } }
    );

    res.clearCookie("refreshToken", cookies_options);

   return res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully",
    })
  }catch(e){
    console.log(e.message);
    res.status(400).json({
      message: e.message,
      success: false,
    })
  }
}

async function userList(req, res) {
  try {
    const list = await userModel.find();
   return res.status(200).json({
      success: true,
      message: "User list fetch successfully ",
      data: list,
    });
  } catch (e) {
    res.status(400).json({
      message: e.message,
      success: false,
    });
  }
}

async function getMe(req, res) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token not found !",
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);

    const user = await userModel.findOne({ _id: decoded.id });

   return res.status(200).json({
      success: true,
      data: {
        name: user?.name,
        email: user?.email,
        verified: user?.verified,
        role: user?.role,
        _id: user?._id,
        createdAt: user?.createdAt,
        updatedAt: user?.updatedAt,
        selectedExamId: user?.selectedExamId,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
}

async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body.email);
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    await saveOtpAndSendEmail(user, "Reset Password");
    return res.status(200).json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (error) {
    console.error("Error sending reset password email:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function resetPassword(req, res) {
  const { otp, newPassword } = req.body;
  const email = normalizeEmail(req.body.email);
  try {
    const otpResult = await verifyStoredOtp(email, otp);

    if (!otpResult.valid) {
      return res.status(400).json({
        success: false,
        message: otpResult.error,
        ...(otpResult.code && { code: otpResult.code }),
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // OTP proves email ownership — mark verified and update password in one step
    const user = await userModel.findByIdAndUpdate(
      otpResult.userId,
      {
        password: hashedPassword,
        verified: true,
      },
      { returnDocument: "after" }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await otpModel.deleteMany({ user: otpResult.userId });

    const accessToken = await createAuthSession(req, res, user);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: formatAuthUser(user),
      accessToken,
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}


async function updatePassword(req, res) {
  try {
    const { password, newPassword } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!password || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    const user = await userModel.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid current password",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await userModel.findByIdAndUpdate(user._id, { password: passwordHash });

    // Revoke all existing sessions (other devices + old tokens on this device)
    await sessionModel.updateMany(
      { user: user._id, revoked: false },
      { $set: { revoked: true } }
    );

    // Fresh session on this device — user stays logged in with new tokens
    const updatedUser = await userModel.findById(user._id);
    const accessToken = await createAuthSession(req, res, updatedUser);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      data: formatAuthUser(updatedUser),
      accessToken,
    });
  } catch (e) {
    console.error("Error updating password:", e);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function handleRefreshToken(req, res) {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "Refresh token not found!",
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.JWT_SECRET);
    const session = await sessionModel.findById(decoded.sessionId);

    if (!session || session.revoked) {
      return res.status(401).json({
        success: false,
        message: "Session not found or already revoked!",
      });
    }

    const isValid = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token!",
      });
    }

    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const newAccessToken = generateAccessToken(user, session._id);
    const newRefreshToken = generateRefreshToken(user, session._id);
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, saltRounds);
    session.refreshTokenHash = newRefreshTokenHash

    await session.save();

    res.cookie("refreshToken", newRefreshToken, cookies_options);

   return res.status(200).json({
      success: true,
      message: "Tokens refreshed successfully",
      accessToken: newAccessToken,
    });

  } catch (error) {
    console.error(error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token.",
    });
  }
}

module.exports = { register, login, logout, userList, getMe, verifyEmail, logoutAll, forgotPassword, resetPassword, handleRefreshToken, updatePassword };