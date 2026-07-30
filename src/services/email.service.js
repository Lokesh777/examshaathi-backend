const dns = require("dns");
dns.setDefaultResultOrder("ipv4first"); // Render pe IPv6 DNS issue fix karta hai

const nodemailer = require("nodemailer");
const config = require("../config/config");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4, // force IPv4
  auth: {
    type: "OAuth2",
    user: config.GOOGLE_USER, // lkdevgan777@gmail.com
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    refreshToken: config.GOOGLE_REFRESH_TOKEN,
  },
  connectionTimeout: 10000, // 10s me fail ho jaye, hang na ho
});

const sendEmail = async (to, subject, text, html) => {
  const mailOptions = {
    from: `"ExamSaathi" <${config.GOOGLE_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("Email Error");
    console.error("message:", error.message);
    console.error("code:", error.code);
    console.error("command:", error.command);
    console.error("response:", error.response);
    throw error;
  }
};

module.exports = sendEmail;