// Encrypts credentials (M91 links, viaSocket connection ids) before they are stored.
// AES-256-GCM, key derived from APP_SECRET, a server environment variable.
const crypto = require('crypto');

class SecretsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// AES-256-GCM with a key derived from APP_SECRET (an Embarko environment variable).
function key() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new SecretsError('NO_APP_SECRET', 'The server is missing APP_SECRET, so it cannot store the link safely');
  return crypto.createHash('sha256').update(`m91-link:${s}`).digest();
}
function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}
function open(sealed) {
  const [, iv, tag, enc] = String(sealed).split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}

module.exports = { seal, open, SecretsError };
