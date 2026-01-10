import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import indexRoutes from './routes/index.routes.js';
import { metricsMiddleware, register } from './monitoring.js';
import db from './config/db.js';

const app = express();

// чтобы сразу понять, что запустился именно этот app.js
console.log('✅ app.js loaded. Metrics endpoint: GET /metrics');

app.use(cors());
app.use(express.json());

// логирование
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// метрики (считает запросы)
app.use(metricsMiddleware);

// Health/Ready
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not_ready', error: 'db_unavailable' });
  }
});

// Prometheus metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// статика
app.use(express.static('public'));

// API
app.use('/api', indexRoutes);

export default app;


