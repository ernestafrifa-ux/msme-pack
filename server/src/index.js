const config = require('./config');
const { createApp } = require('./app');
const { pool } = require('./db');

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`MSME Pack API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
