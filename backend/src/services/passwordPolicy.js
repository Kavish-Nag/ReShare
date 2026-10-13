import { readFileSync } from 'node:fs';

// SecLists "10k most common passwords" (MIT). Entries shorter than 4 characters are dropped.
const COMMON = new Set(
  readFileSync(new URL('../data/common-passwords.txt', import.meta.url), 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(s => s.length >= 4)
);

export const MIN_PASSWORD_LENGTH = 10;

// Returns a user-facing reason the password is rejected, or null when it is acceptable.
export function passwordProblem(password, email = '') {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  const lower = password.toLowerCase();
  // "Password123!" is just "password" with decoration, so check the word without trailing digits and symbols too.
  const bare = lower.replace(/[\d\s!@#$%^&*()_+=.\-]+$/, '');
  if (COMMON.has(lower) || COMMON.has(bare)) return 'That password is too common. Choose something harder to guess.';
  if (/^(.)\1+$/.test(password)) return 'Do not repeat a single character.';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return 'Your password should not contain your email name.';
  return null;
}
