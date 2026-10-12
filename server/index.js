import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_DIR, isEmpty } from './db.js';
import { authenticate, requireRole } from './auth.js';
import authRoutes from './routes/auth.js';
import setupRoutes from './routes/setup.js';
import peopleRoutes from './routes/people.js';
import examRoutes from './routes/exams.js';
import systemRoutes from './routes/system.js';
import dataRoutes from './routes/data.js';
import { me, pub } from './routes/portal.js';
import { seedDemo } from './seed.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '30mb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/public', pub);
app.use('/api/me', authenticate, me);

const admin = express.Router();
admin.use(authenticate, requireRole('admin'));
admin.use(setupRoutes, peopleRoutes, examRoutes, systemRoutes, dataRoutes);
app.use('/api', admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

const dist = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res
      .type('html')
      .send('<p style="font-family:sans-serif">The web client has not been built yet. Run <code>npm run build</code>, or use <code>npm run dev</code> during development.</p>'),
  );
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  if (err.type === 'entity.too.large') status = 413;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error:
      status === 413
        ? 'The upload is too large.'
        : status >= 500
          ? 'Something went wrong on the server. Please try again.'
          : err.message,
    details: err.details,
  });
});

const PORT = Number(process.env.PORT) || 4000;

if (isEmpty()) {
  console.log('First run detected — loading demo data…');
  await seedDemo();
}

app.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`\n  ExamFlow is running`);
  console.log(`  ➜ On this computer:   http://localhost:${PORT}`);
  for (const url of lan) console.log(`  ➜ On college network: ${url}`);
  console.log('');
});
