import { Router } from 'express';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { pool } from '../config/database.js';
import { authenticate } from '../middleware/verifyJwt.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';

const router = Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['buyer', 'seller'])
});
const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
  portal: z.enum(['user', 'admin']).optional().default('user')
});

function ensureLocalAuth(res) {
  if (process.env.AUTH_MODE !== 'local') {
    res.status(503).json({ error: 'Local email/password authentication is not enabled on this deployment.' });
    return false;
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    res.status(500).json({ error: 'Server authentication secret is not configured correctly.' });
    return false;
  }
  return true;
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    service_area: row.service_area,
    availability_status: row.availability_status
  };
}

async function issueToken(user) {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer('reshare-local')
    .setAudience('reshare-api')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key);
}

router.post('/register', async (req, res, next) => {
  if (!ensureLocalAuth(res)) return;
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, email, password (at least 8 characters), and buyer/seller role.', details: parsed.error.flatten() });
  const data = parsed.data;
  try {
    const passwordHash = await hashPassword(data.password);
    const result = await pool.query(
      `INSERT INTO users(name,email,password_hash,role,status,service_area,availability_status)
       VALUES($1,$2,$3,$4,'ACTIVE',NULL,'UNAVAILABLE')
       RETURNING id,name,email,role,service_area,availability_status`,
      [data.name, data.email.toLowerCase(), passwordHash, data.role]
    );
    const user = result.rows[0];
    const token = await issueToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  if (!ensureLocalAuth(res)) return;
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const { email, password, portal } = parsed.data;
  try {
    const result = await pool.query(
      `SELECT id,name,email,password_hash,role,status,service_area,availability_status
       FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]
    );
    if (!result.rowCount || result.rows[0].status !== 'ACTIVE' || !(await verifyPassword(password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    const row = result.rows[0];
    if (portal === 'admin' && row.role !== 'admin') {
      return res.status(403).json({ error: 'This account does not have administrator access.' });
    }
    if (portal === 'user' && row.role === 'admin') {
      return res.status(403).json({ error: 'Use the dedicated administrator sign-in for this account.' });
    }
    const token = await issueToken(row);
    res.json({ token, user: publicUser(row) });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
