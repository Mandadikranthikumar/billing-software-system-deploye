const nodemailer = require("nodemailer");

/**
 * Create Nodemailer transporter based on .env configuration
 */
const getTransporter = () => {
  // Option 1: Custom SMTP host (Brevo, SendGrid, Amazon SES, Mailgun, etc.)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS.trim()
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  // Option 2: Service-based (e.g., Gmail with App Password)
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_USER.trim() !== "") {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_PASS.trim().replace(/\s+/g, "") // Remove spaces from 16-digit Google App Password
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  return null;
};

/**
 * Send email using Resend HTTP REST API (Uses Port 443 / HTTPS, bypasses Render SMTP port blocks)
 */
const sendViaResendHttp = async ({ to, subject, text, html }) => {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;

  // Resend requires verified domain or onboarding@resend.dev for testing.
  // Free public domains like @gmail.com or @yahoo.com in 'from' cause "domain is not verified" errors.
  let fromAddress = (process.env.EMAIL_FROM || "").trim();
  const isPublicWebmail = /@(gmail\.com|yahoo\.com|outlook\.com|hotmail\.com)/i.test(fromAddress);
  if (!fromAddress || isPublicWebmail) {
    fromAddress = "IT Spaxios Innovation <onboarding@resend.dev>";
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        text,
        html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.message || `Resend HTTP API returned status ${response.status}`;
      return { sent: false, error: errMsg };
    }

    return { sent: true, messageId: data?.id, provider: "Resend HTTP" };
  } catch (err) {
    return { sent: false, error: `Resend HTTP call failed: ${err.message}` };
  }
};

/**
 * Generate standard HTML email template for 6-digit OTP code
 */
const getOtpEmailHtml = ({ name, otp }) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
          .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
          .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
          .body { padding: 32px 24px; text-align: center; }
          .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; text-align: left; }
          .desc { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 24px; text-align: left; }
          .otp-card { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 18px 24px; margin: 20px 0; display: inline-block; }
          .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb; margin: 0; }
          .expiry-note { font-size: 12px; color: #94a3b8; margin-top: 10px; }
          .security-note { font-size: 12px; color: #64748b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-top: 24px; text-align: left; line-height: 1.5; }
          .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IT Spaxios Innovation</h1>
            <p>Enterprise Billing & Management Platform</p>
          </div>
          <div class="body">
            <div class="greeting">Hello ${name || "Valued User"},</div>
            <div class="desc">
              We received a request to reset your password. Use the 6-digit verification code (OTP) below to complete your password reset:
            </div>
            <div class="otp-card">
              <div class="otp-code">${otp}</div>
              <div class="expiry-note">This code is valid for 10 minutes.</div>
            </div>
            <div class="security-note">
              <strong>Security Notice:</strong> If you did not request this password reset, please ignore this email or notify your system administrator immediately. Do not share this OTP with anyone.
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} IT Spaxios Innovation. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Send 6-digit OTP verification email to user's real email address
 * Supports Nodemailer (Gmail / Custom SMTP) with automatic fallback to Resend HTTP API
 */
const sendOtpEmail = async ({ to, name, otp }) => {
  const subject = `Your Password Reset Code: ${otp} - IT Spaxios Innovation`;
  const text = `Hello ${name || "User"},\n\nYour password reset verification code is: ${otp}\n\nThis code is valid for 10 minutes.\n\nIf you did not request this, please contact your administrator.`;
  const html = getOtpEmailHtml({ name, otp });

  const transporter = getTransporter();
  const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());

  // 1. Try Nodemailer if configured
  if (transporter) {
    const fromEmail = process.env.EMAIL_USER || process.env.SMTP_USER || "noreply@spaxios.com";
    const fromAddress = process.env.EMAIL_FROM || `"IT Spaxios Innovation" <${fromEmail}>`;

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text,
        html
      });
      console.log(`[EMAIL SERVICE] Real OTP email successfully sent to ${to} via SMTP. MessageId: ${info.messageId}`);
      return { sent: true, messageId: info.messageId, provider: "Nodemailer/SMTP" };
    } catch (smtpError) {
      console.error(`[EMAIL SERVICE] Nodemailer/SMTP failed:`, smtpError.message);

      // If SMTP fails (e.g. Render Free Tier firewall timeout) and Resend is available, fallback to Resend
      if (hasResend) {
        console.log(`[EMAIL SERVICE] Attempting automatic fallback to Resend HTTP API...`);
        const resendResult = await sendViaResendHttp({ to, subject, text, html });
        if (resendResult && resendResult.sent) {
          console.log(`[EMAIL SERVICE] Successfully sent to ${to} via Resend HTTP fallback. MessageId: ${resendResult.messageId}`);
          return resendResult;
        }
      }

      return {
        sent: false,
        error: `SMTP Delivery Error: ${smtpError.message}`
      };
    }
  }

  // 2. If Nodemailer is not configured, try Resend HTTP API
  if (hasResend) {
    const resendResult = await sendViaResendHttp({ to, subject, text, html });
    if (resendResult && resendResult.sent) {
      console.log(`[EMAIL SERVICE] Successfully sent to ${to} via Resend HTTP API. MessageId: ${resendResult.messageId}`);
      return resendResult;
    }
    return {
      sent: false,
      error: resendResult?.error || "Resend email delivery failed."
    };
  }

  // 3. Neither service is configured
  const missing = !process.env.EMAIL_PASS ? "EMAIL_PASS (Google 16-character App Password)" : "EMAIL_USER";
  console.error(`[EMAIL SERVICE] Cannot send real email: ${missing} is missing in server/.env.`);
  return {
    sent: false,
    error: `Real email delivery requires ${missing} or RESEND_API_KEY in server/.env.`
  };
};

module.exports = {
  sendOtpEmail
};
