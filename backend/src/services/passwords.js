import { randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (!encoded || typeof encoded !== 'string') return false;
  const [scheme, saltHex, keyHex] = encoded.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (salt.length < 8 || expected.length !== KEY_LENGTH) return false;
    const derived = Buffer.from(await scrypt(password, salt, expected.length, SCRYPT_OPTIONS));
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
