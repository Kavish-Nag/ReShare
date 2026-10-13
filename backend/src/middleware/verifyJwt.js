import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pool } from '../config/database.js';

let cognitoJwks;
function getCognitoJwks() {
  const region = process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!region || !userPoolId) throw new Error('Cognito configuration is missing');
  const url = new URL(`https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`);
  if (!cognitoJwks) cognitoJwks = createRemoteJWKSet(url);
  return cognitoJwks;
}

async function loadActiveUser(id) {
  const result = await pool.query(
    `SELECT id, name, email, role, status, service_area, availability_status
     FROM users WHERE id = $1 AND status = 'ACTIVE'`, [id]
  );
  return result.rows[0] || null;
}

export async function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

    if (process.env.AUTH_MODE === 'local') {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return res.status(500).json({ error: 'Authentication is not configured correctly.' });
      }
      const key = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, key, {
        issuer: 'reshare-local', audience: 'reshare-api', algorithms: ['HS256']
      });
      const user = await loadActiveUser(payload.sub);
      if (!user) return res.status(401).json({ error: 'Account not found or inactive. Please sign in again.' });
      req.user = user;
      return next();
    }

    if (process.env.AUTH_MODE === 'cognito') {
      const issuer = `https://cognito-idp.${process.env.COGNITO_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`;
      const { payload } = await jwtVerify(token, getCognitoJwks(), {
        issuer,
        audience: process.env.COGNITO_CLIENT_ID,
        algorithms: ['RS256']
      });
      if (payload.token_use !== 'id') return res.status(401).json({ error: 'A Cognito ID token is required' });
      const result = await pool.query(
        `SELECT id, name, email, role, status, service_area, availability_status
         FROM users WHERE cognito_sub = $1 AND status = 'ACTIVE'`, [payload.sub]
      );
      if (!result.rowCount) return res.status(403).json({ error: 'User profile is not provisioned' });
      req.user = result.rows[0];
      return next();
    }
    return res.status(500).json({ error: 'AUTH_MODE must be local or cognito' });
  } catch (error) {
    console.warn('Authentication failed:', error.message);
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
