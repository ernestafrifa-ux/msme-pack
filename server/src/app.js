const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { requireAuth } = require('./auth');
const { HttpError } = require('./http');
const auth = require('./routes/auth');
const businesses = require('./routes/businesses');
const { pool } = require('./db');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind Render/Railway/Nginx, for rate limiting
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
        },
      },
    })
  );
  if (config.corsOrigins.length) app.use('/api', cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', auth.router);
  app.use('/api/businesses', requireAuth, businesses.router);

  app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found.')));

  // In production, serve the built React app from client/dist.
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Errors: friendly message for the user, full detail only in the server log.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'The request was not valid JSON.');
    if (err.code === '23503') err = new HttpError(400, 'One of the selected items does not exist.');
    if (err.code === '22P02') err = new HttpError(400, 'One of the values is not valid.');
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
      ...(err.details ? { fields: err.details } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
