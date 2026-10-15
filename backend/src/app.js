import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import auth from './routes/auth.js';
import listings from './routes/listings.js';
import orders from './routes/orders.js';
import uploads from './routes/uploads.js';
import deliveries from './routes/deliveries.js';
import admin from './routes/admin.js';
import products from './routes/products.js';
import { globalLimiter } from './middleware/rateLimits.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();
app.disable('x-powered-by');
// Hops between the client and this app: 2 on AWS (CloudFront + ALB), 0 when exposed directly.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(helmet());
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin: origins, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api', globalLimiter);
app.use('/api/auth', auth);
app.get('/api/diagnostics/instance', (req, res) => {
  res.json({ instance: process.env.HOSTNAME || 'local', note: 'Demo endpoint: restrict or remove in production.' });
});
app.use('/api/listings', listings);
app.use('/api/orders', orders);
app.use('/api/uploads', uploads);
app.use('/api/deliveries', deliveries);
app.use('/api/admin', admin);
app.use('/api/products', products);
app.use(notFound);
app.use(errorHandler);

export default app;
