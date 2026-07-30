const nodemailer = require("nodemailer");
const config = require("../config/config");


console.log({
  GOOGLE_USER: process.env.GOOGLE_USER,
  GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
}, "items---------email");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
  auth: {
    type: "OAuth2",
    user: config.GOOGLE_USER,
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    refreshToken: config.GOOGLE_REFRESH_TOKEN,
  },
});

const sendEmail = async (to, subject, text, html) => {
  const mailOptions = {
    from: `"ExamSaathi" <${config.GOOGLE_USER}>`,
    to,
    subject,
    text,
    html,
  };

  console.log(mailOptions, "items----mailOptions")
  try {
    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent:", info.messageId);

    return info;
  } catch (error) {
    console.error("Email send failed:", error.message);
    throw error;
  }
};

module.exports = sendEmail;