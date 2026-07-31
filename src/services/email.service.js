const nodemailer = require("nodemailer");
const config = require("../config/config");

let transporter;

try {
  transporter = nodemailer.createTransport({
    service: "gmail", // or host: "smtp.gmail.com"
    port: 587,
    secure: false,
    requireTLS: true,

    logger: process.env.NODE_ENV !== "production",
    debug: process.env.NODE_ENV !== "production",

    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,

    family: 4,

    auth: {
      type: "OAuth2",
      user: config.GOOGLE_USER,
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      refreshToken: config.GOOGLE_REFRESH_TOKEN,
    },
  });

  transporter.verify((err) => {
    if (err) {
      console.error("SMTP verification failed:", err.message);
    } else {
      console.log("SMTP server is ready.");
    }
  });
} catch (error) {
  console.error("Failed to create transporter:");
  console.error(error);
}

const sendEmail = async (to, subject, text, html) => {
  if (!transporter) {
    throw new Error("Email transporter is not initialized.");
  }

  try {
    const info = await transporter.sendMail({
      from: `"ExamSaathi" <${config.GOOGLE_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log("Email sent successfully.");
    console.log("Message ID:", info.messageId);

    return info;
  } catch (error) {
    console.error("========== EMAIL SEND FAILED ==========");
    console.error("Message :", error.message);
    console.error("Code    :", error.code);
    console.error("Command :", error.command);
    console.error("Response:", error.response);
    console.error("Stack   :", error.stack);
    console.error("=======================================");

    throw error;
  }
};

module.exports = sendEmail;