const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database connected successfully");
    return true;
  } catch (e) {
    console.error("Database connection failed:", e.message);
    return false;
  }
}

module.exports = { connectDB };
