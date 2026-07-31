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
const { default: config } = require("../config/config");
const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

async function register(req, res) {
  const { name, email, password } = req.body;
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
    const otp = generateOTP();
    const html = getOtpHTML(otp, user.name);
    const otpHash = await bcrypt.hash(otp, saltRounds);
    await otpModel.findOneAndUpdate(
      { email },
      {
        email,
        otpHash,
        user: user._id,
      },
      {
        upsert: true,
      }
    );

   try {
      await sendEmail(email, "Verify Email", `Your OTP code is ${otp}`, html);
    } catch (err) {
      console.error("Failed to send OTP:", err.message);
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
  const { email, password } = req.body;

  try {
    const user = await userModel.findOne({ email });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Wrong credential" });
    }

    if (!user?.verified) {
      return res.status(401).json({
        success: false,
        message: "Email is not verified!",
      });
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password); // ← await add kiya

    if (!isPasswordMatched) {
      return res
        .status(400)
        .json({ success: false, message: "Wrong credential" });
    }

    const sessionId = new mongoose.Types.ObjectId();

    const refreshToken = generateRefreshToken(user, sessionId);
    const refreshTokenHash = await bcrypt.hash(refreshToken, saltRounds);
    const session = await sessionModel.create({
      _id: sessionId,
      user: user?._id,
      refreshTokenHash,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const accessToken = generateAccessToken(user, session?._id);

    res.cookie("refreshToken", refreshToken, cookies_options);

    res.status(200).json({
      success: true,
      message: "Login Successfully",
      data: {
        name: user?.name,
        email: user?.email,
        id: user?._id,
      },
      accessToken,
    });
  } catch (e) {
    console.log(e.message);
    res.status(400).json({ success: false, message: e.message });
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

    res.status(200).json({
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
    res.status(200).json({
      success: true,
      message: "User list fetch successfully ",
      data: list,
    });
  } catch (e) {
    res.status(400).jso({
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

    res.status(200).json({
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

async function verifyEmail(req, res) {
  const { otp, email } = req.body;
  try {
   const storedOtpDoc = await otpModel.findOne({ email }).sort({ createdAt: -1 });

    if (!storedOtpDoc) {
      return res.status(400).json({
        success: false,
        message: "Invalid email Or OTP",
      });
    }

    const isOtpValid = await bcrypt.compare(
        String(otp).trim(),
        storedOtpDoc.otpHash
    );
    if (!isOtpValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        isOtpValid,
      });
    }
    const user = await userModel.findByIdAndUpdate(storedOtpDoc.user, {
      verified: true,
    });
    await otpModel.deleteMany({ email });

    const sessionId = new mongoose.Types.ObjectId();

    const refreshToken = generateRefreshToken(user, sessionId);
    const refreshTokenHash = await bcrypt.hash(refreshToken, saltRounds);
    const session = await sessionModel.create({
      _id: sessionId,
      user: user?._id,
      refreshTokenHash,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const accessToken = generateAccessToken(user, session?._id);

    res.cookie("refreshToken", refreshToken, cookies_options);
    res.status(200).json({
      success: true,
      message: "Email verified successfully",
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
      accessToken,
    });
  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const otp = generateOTP();
    const html = getOtpHTML(otp, user.name);
    const otpHash = await bcrypt.hash(otp, saltRounds);
    await otpModel.findOneAndUpdate(
      { email },
      {
        email,
        otpHash,
        user: user._id,
      },
      {
        upsert: true,
      }
    );
    await sendEmail(email, "Reset Password", `Your OTP code is ${otp}`, html);
    res.status(200).json({
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
  const { email, otp, newPassword } = req.body;
  try {
    const otpDoc = await otpModel.findOne({ email });
    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or OTP",
      });
    }

    const isOtpValid = await bcrypt.compare(
        String(otp).trim(),
        otpDoc.otpHash
    );
    if (!isOtpValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await userModel.findByIdAndUpdate(otpDoc.user, {
      password: hashedPassword,
    });
    await otpModel.deleteMany({ email });
    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
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

    res.status(200).json({
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

module.exports = { register, login, logout, userList, getMe, verifyEmail, logoutAll, forgotPassword, resetPassword, handleRefreshToken };
