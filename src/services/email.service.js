const nodemailer = require("nodemailer");
const config = require("../config/config");

const transporter = nodemailer.createTransport({
  service: "gmail",
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
    console.error(error);
    throw error;
  }
};

module.exports = sendEmail;