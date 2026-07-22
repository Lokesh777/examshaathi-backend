const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { cookies_options } = require("../utils/cookieOptions.utils");
const { generateToken } = require("../utils/token.utils");

async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const emailExist = await userModel.findOne({ email });

    if (emailExist) {
      return res.status(409).json({
        success: false,
        message: "User already has an account.",
      });
    }

    const user = await userModel.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = generateToken(user);

    res.cookie("token", token, cookies_options);

    res.status(201).json({
      success: true,
      message: "Account created successfully!",
      data: {
        name: user?.name,
        email: user?.email,
      },
      token,
    });
  } catch (e) {
    console.log(e.message);
    res.status(400).json({
      success: false,
      message: e.message,
    });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.status(400).json({ success: false, message: "Wrong credential" });
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password); // ← await add kiya

    if (!isPasswordMatched) {
      return res.status(400).json({ success: false, message: "Wrong credential" });
    }

    const token = generateToken(user);

    res.cookie("token", token, cookies_options);
    res.status(200).json({
      success: true,
      message: "login Successfully",
      data: {
        name: user?.name,
        email: user?.email,
        id: user?._id,
      },
      token,
    });
  } catch (e) {
    console.log(e.message);
    res.status(400).json({ success: false, message: e.message });
  }
}

async function logout(req, res) {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (e) {
    console.error(e);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
}

async function userList(req, res) {
  try {
      console.log(req.user);
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

module.exports = { register, login, logout, userList };
