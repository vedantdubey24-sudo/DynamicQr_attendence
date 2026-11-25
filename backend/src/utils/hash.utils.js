import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Verifies a plaintext password or login-code against:
 * 1. Werkzeug scrypt (scrypt:N:r:p$salt$hash)
 * 2. Werkzeug pbkdf2 (pbkdf2:sha256:iterations$salt$hash)
 * 3. Bcrypt ($2a$, $2b$, $2y$)
 *
 * Implements a gradual, seamless rehashing strategy:
 * If a legacy Werkzeug hash succeeds, it flags `needsRehash: true` so the caller
 * can safely update the stored hash to bcrypt without disrupting the user.
 */
export async function verifyPasswordOrCode(plaintext, storedHash) {
  if (!storedHash || !plaintext) {
    return { match: false, needsRehash: false };
  }

  // 1. Check Werkzeug scrypt format: scrypt:N:r:p$salt$hash
  if (storedHash.startsWith('scrypt:')) {
    try {
      const parts = storedHash.split('$');
      if (parts.length === 3) {
        const [n, r, p] = parts[0].replace('scrypt:', '').split(':').map(Number);
        const salt = parts[1];
        const expectedHash = parts[2];
        const keyLen = Buffer.from(expectedHash, 'hex').length;

        const derived = crypto.scryptSync(plaintext, salt, keyLen, {
          N: n,
          r: r,
          p: p,
          maxmem: 128 * 1024 * 1024,
        });

        const derivedHex = derived.toString('hex');
        const match =
          derivedHex.length === expectedHash.length &&
          crypto.timingSafeEqual(Buffer.from(derivedHex), Buffer.from(expectedHash));

        return { match, needsRehash: match };
      }
    } catch (err) {
      console.error('Error verifying Werkzeug scrypt hash:', err.message);
      return { match: false, needsRehash: false };
    }
  }

  // 2. Check Werkzeug pbkdf2 format: pbkdf2:sha256:iterations$salt$hash
  if (storedHash.startsWith('pbkdf2:')) {
    try {
      const parts = storedHash.split('$');
      if (parts.length === 3) {
        const meta = parts[0].split(':');
        const digest = meta[1] || 'sha256';
        const iterations = parseInt(meta[2], 10) || 260000;
        const salt = parts[1];
        const expectedHash = parts[2];
        const keyLen = Buffer.from(expectedHash, 'hex').length;

        const derived = crypto.pbkdf2Sync(plaintext, salt, iterations, keyLen, digest);
        const derivedHex = derived.toString('hex');
        const match =
          derivedHex.length === expectedHash.length &&
          crypto.timingSafeEqual(Buffer.from(derivedHex), Buffer.from(expectedHash));

        return { match, needsRehash: match };
      }
    } catch (err) {
      console.error('Error verifying Werkzeug pbkdf2 hash:', err.message);
      return { match: false, needsRehash: false };
    }
  }

  // 3. Check Standard Bcrypt
  try {
    const match = await bcrypt.compare(plaintext, storedHash);
    return { match, needsRehash: false };
  } catch (err) {
    return { match: false, needsRehash: false };
  }
}

export async function hashPasswordOrCode(plaintext) {
  return bcrypt.hash(plaintext, 10);
}
