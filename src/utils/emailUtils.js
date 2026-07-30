export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getOtpHTML(otp, userName = "Student") {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ExamSaathi OTP Verification</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

          <tr>
            <td align="center" style="background:#2563eb;padding:30px;">
              <h1 style="margin:0;color:#ffffff;font-size:30px;">
                📘 ExamSaathi
              </h1>
              <p style="margin:8px 0 0;color:#dbeafe;font-size:15px;">
                AI-Powered Learning & Mock Test Platform
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <h2 style="margin-top:0;color:#1f2937;">
                Verify your email
              </h2>

              <p style="color:#4b5563;font-size:16px;line-height:1.6;">
                Hello <strong>${userName}</strong>,
              </p>

              <p style="color:#4b5563;font-size:16px;line-height:1.6;">
                Use the following One-Time Password (OTP) to complete your verification.
              </p>

              <div style="text-align:center;margin:35px 0;">
                <div style="display:inline-block;background:#eff6ff;border:2px dashed #2563eb;padding:18px 40px;border-radius:10px;font-size:34px;font-weight:bold;letter-spacing:8px;color:#2563eb;">
                  ${otp}
                </div>
              </div>

              <p style="color:#4b5563;font-size:15px;line-height:1.6;">
                This OTP is valid for <strong>10 minutes</strong>.
              </p>

              <p style="color:#4b5563;font-size:15px;line-height:1.6;">
                If you didn't request this code, you can safely ignore this email.
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;" />

              <p style="font-size:13px;color:#6b7280;text-align:center;">
                This is an automated email. Please do not reply.
              </p>

              <p style="font-size:14px;color:#374151;text-align:center;margin-top:20px;">
                © ${new Date().getFullYear()} ExamSaathi. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}


