const dotenv = require("dotenv");

dotenv.config();

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

if (!process.env.PORT) {
  throw new Error("PORT is not defined");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error("GOOGLE_CLIENT_ID is not defined");
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_SECRET is not defined");
}

if (!process.env.GOOGLE_REFRESH_TOKEN) {
  throw new Error("GOOGLE_REFRESH_TOKEN is not defined");
}

if (!process.env.GOOGLE_USER) {
  throw new Error("GOOGLE_USER is not defined");
}

if (!process.env.BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY is not defined");
}

if (!process.env.SENDER_EMAIL) {
  throw new Error("SENDER_EMAIL is not defined");
}

if (!process.env.SENDER_NAME) {
  throw new Error("SENDER_NAME is not defined");
}

const config = {
  MONGODB_URI: process.env.MONGODB_URI,
  PORT: process.env.PORT,
  JWT_SECRET: process.env.JWT_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_USER: process.env.GOOGLE_USER,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  SENDER_EMAIL: process.env.SENDER_EMAIL,
  SENDER_NAME: process.env.SENDER_NAME,
  GOOGLE_SHEETS_CONTACT_ID:
    process.env.GOOGLE_SHEETS_CONTACT_ID ||
    "1UnbN4jcPNKXlnnaYZmXpTyv1jDsv3-csUSrrLSd4-dM",
  GOOGLE_SHEETS_WEBHOOK_URL: process.env.GOOGLE_SHEETS_WEBHOOK_URL || "",
};

module.exports = config;