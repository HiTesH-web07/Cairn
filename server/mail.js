// Email for system messages (password resets). Plain SMTP, so any provider works:
// Gmail with an app password, Brevo, Amazon SES, MSG91 and so on.
// SMTP_HOST, SMTP_PORT (587 or 465), SMTP_USER, SMTP_PASS, MAIL_FROM, e.g. Cairn <no-reply@yourdomain.com>.
const nodemailer = require('nodemailer');

let transport = null;
const configured = () => process.env.MAIL_TRANSPORT === 'json' || !!(process.env.SMTP_HOST && process.env.MAIL_FROM);

function getTransport() {
  if (transport) return transport;
  if (process.env.MAIL_TRANSPORT === 'json') { transport = nodemailer.createTransport({ jsonTransport: true }); return transport; }
  const port = Number(process.env.SMTP_PORT) || 587;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
  return transport;
}

// Never let a password or a server detail leak into a message that someone can read.
function scrub(msg) {
  let m = String(msg || 'Could not send');
  for (const k of ['SMTP_PASS', 'SMTP_USER']) if (process.env[k]) m = m.split(process.env[k]).join('***');
  return m.slice(0, 200);
}

async function send({ to, subject, text, html }) {
  if (!configured()) throw new Error('Email is not set up on this server yet');
  try {
    const info = await getTransport().sendMail({ from: process.env.MAIL_FROM || 'Cairn <no-reply@localhost>', to, subject, text, html });
    return { ok: true, message: info.message ? JSON.parse(info.message) : undefined };
  } catch (e) { throw new Error(scrub(e.message)); }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function resetEmail(name, link) {
  const first = String(name || '').split(' ')[0] || 'there';
  return {
    subject: 'Reset your Cairn password',
    text: `Hi ${first},\n\nSomeone asked to reset your Cairn password. If it was you, open this link within 1 hour:\n${link}\n\nIt works once. If it was not you, ignore this email and your password stays the same.\n\nCairn`,
    html: `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#14162e">
<h2 style="margin:0 0 12px">Reset your password</h2><p>Hi ${esc(first)},</p>
<p>Someone asked to reset your Cairn password. If it was you, use the button below within 1 hour. It works once.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#5b4fe9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">Choose a new password</a></p>
<p style="color:#5d6390;font-size:14px">Or paste this link into your browser:<br>${esc(link)}</p>
<p style="color:#5d6390;font-size:14px">If it was not you, ignore this email. Your password stays the same.</p></div>`
  };
}

module.exports = { configured, send, resetEmail };
