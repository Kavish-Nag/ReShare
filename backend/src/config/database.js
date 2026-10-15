import pg from 'pg';

const { Pool } = pg;
const { DATABASE_URL: connectionString, DB_HOST } = process.env;

if (!connectionString && !DB_HOST) {
  throw new Error('DATABASE_URL (or DB_HOST, DB_USER, DB_PASSWORD) is required');
}

// ECS injects DB_HOST/DB_USER/DB_PASSWORD separately so the password can come from Secrets Manager.
const target = connectionString ? { connectionString } : {
  host: DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'reshare',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

export const pool = new Pool({
  ...target,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL client error', error.message);
});
