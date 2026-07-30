const nodemailer = require("nodemailer");
const config = require("../config/config").default;

const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth:{
        type:"OAuth2",
        user:config.GOOGLE_USER,
        clientId:config.GOOGLE_CLIENT_ID,
        clientSecret:config.GOOGLE_CLIENT_SECRET,
        refreshToken:config.GOOGLE_REFRESH_TOKEN
      }
})

transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});


const sendMessage = async(to, subject, text, html)=>{
  try{
    const info = await transporter.sendMail({
      from: `"examSaathi " <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });
    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
}


module.exports = sendMessage;