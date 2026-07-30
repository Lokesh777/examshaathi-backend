const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const nodemailer = require("nodemailer");
const config = require("../config/config");


const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4, // force IPv4
  auth: {
    type: "OAuth2",
    user: config.GOOGLE_USER,
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    refreshToken: config.GOOGLE_REFRESH_TOKEN,
  },
});

const { Resend } = require("resend");
const resend = new Resend(config.RESEND_API_KEY);

const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await resend.emails.send({
     from: "ExamSaathi <lkdevgan777@gmail.com>",
      to,
      subject,
      text,
      html,
    });
    console.log("Email sent:", info.data?.id);
    return info;
  } catch (error) {
    console.error("Email Error");
    console.error("message:", error.message);
    console.error("code:", error.code);
    console.error("command:", error.command);
    console.error("response:", error.response);
    console.error(error);
    throw error;
  }
};

module.exports = sendEmail;