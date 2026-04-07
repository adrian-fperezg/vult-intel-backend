import imap from 'imap-simple';
import dotenv from 'dotenv';

dotenv.config();

export async function getImapHealth() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  const portStr = process.env.IMAP_PORT || '993';
  const port = parseInt(portStr, 10);

  if (!host || !user || !pass) {
    const missing = [];
    if (!host) missing.push('IMAP_HOST');
    if (!user) missing.push('IMAP_USER');
    if (!pass) missing.push('IMAP_PASS');
    return { status: 'missing_env_vars', error: `Missing: ${missing.join(', ')}` };
  }

  const config = {
    imap: {
      user,
      password: pass,
      host,
      port,
      tls: port === 993 || port === 443, // Common TLS ports
      authTimeout: 5000
    }
  };

  try {
    const connection = await imap.connect(config);
    connection.end();
    return { status: 'connected' };
  } catch (err: any) {
    if (err.message.includes('auth') || err.message.includes('LOGIN failed') || err.message.includes('invalid_grant')) {
      return { status: 'auth_failed', error: err.message };
    }
    return { status: 'connection_failed', error: err.message };
  }
}
