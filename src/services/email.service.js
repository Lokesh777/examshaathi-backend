// utils/sendEmail.js
//
// HTTP-based email sending via Brevo API — SMTP socket nahi khulta,
// isliye ETIMEDOUT/ENETUNREACH nahi aayega (Render free tier SMTP
// ports 25/465/587 block karta hai, lekin HTTPS calls kabhi block nahi hote).

const config = require("../config/config");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const sendEmail = async (to, subject, text, html) => {
  const payload = {
    sender: {
      name: config.SENDER_NAME || "ExamSaathi",
      email: config.SENDER_EMAIL,
    },
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": config.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("========== EMAIL SEND FAILED ==========");
      console.error("Message :", data.message);
      console.error("Code    :", data.code);
      console.error("=======================================");
      throw new Error(data.message || "Failed to send email");
    }

    console.log("Email sent successfully.");
    console.log("Message ID:", data.messageId);
    return data;
  } catch (error) {
    console.error("========== EMAIL SEND FAILED ==========");
    console.error("Message :", error.message);
    console.error("=======================================");
    throw error;
  }
};

module.exports = sendEmail;