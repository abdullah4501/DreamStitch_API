const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);

const createOtpCode = () => crypto.randomInt(100000, 999999).toString();

const buildOtpEmailHtml = ({ code, firstName }) => `
  <div style="margin:0;padding:0;background:#f7f3ed;font-family:Arial,Helvetica,sans-serif;color:#241f1b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ed;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #eadfce;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#201812;padding:28px 30px;text-align:center;">
                <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:.4px;">Dream Stitch</div>
                <div style="font-size:13px;color:#d8b36a;margin-top:6px;">Premium Men's Wear</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 30px 12px;">
                <h1 style="margin:0;font-size:24px;line-height:1.3;color:#201812;">Verify your email</h1>
                <p style="font-size:15px;line-height:1.7;color:#5f554c;margin:14px 0 0;">
                  ${firstName ? `Assalam o Alaikum ${firstName},` : "Assalam o Alaikum,"} use this OTP to complete your Dream Stitch account registration.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 30px;">
                <div style="display:inline-block;background:#f8efe0;border:1px solid #d8b36a;border-radius:10px;padding:16px 28px;font-size:34px;font-weight:700;letter-spacing:8px;color:#201812;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 30px 34px;">
                <p style="font-size:14px;line-height:1.7;color:#6f655c;margin:0;">
                  This code expires in ${OTP_TTL_MINUTES} minutes. If you did not request this, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
`;

const sendOtpEmail = async ({ to, code, firstName }) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Dream Stitch OTP] ${to}: ${code}`);
    return { skipped: true };
  }

  const from = process.env.OTP_EMAIL_FROM || "Dream Stitch <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Your Dream Stitch verification code",
      html: buildOtpEmailHtml({ code, firstName }),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to send OTP email: ${text}`);
  }

  return response.json();
};

const createEmailOtp = async ({ prisma, user }) => {
  const code = createOtpCode();
  const codeHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: {
      userId: user.id,
      email: user.email,
      codeHash,
      expiresAt,
    },
  });

  await sendOtpEmail({ to: user.email, code, firstName: user.firstName });
  return expiresAt;
};

module.exports = {
  createEmailOtp,
};
