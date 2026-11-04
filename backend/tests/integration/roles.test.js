const { hasMongo, startTestServer, seedUser } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('../../config/env');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { errorHandler } = require('../../middleware/errorHandler');
const { signSessionToken } = require('../../services/tokenService');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

// No role-protected routes exist yet, so mount temporary ones using the real middleware.
test('requireAuth + requireRole on real routes (integration)', { skip }, async (t) => {
  const { stop } = await startTestServer();
  const employee = await seedUser({ email: 'emp@example.com' });
  const admin = await seedUser({ email: 'adm@example.com', role: 'admin' });

  const app = express();
  app.use(cookieParser());
  app.get('/admin-only', requireAuth, requireRole('admin'), (req, res) => res.json({ ok: true, role: req.user.role }));
  app.get('/employee-area', requireAuth, requireRole('employee'), (req, res) => res.json({ ok: true, role: req.user.role }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await stop();
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const as = (user, path) =>
    fetch(`${base}${path}`, {
      headers: user ? { Cookie: `${config.session.cookieName}=${signSessionToken(user.id)}` } : {},
    });

  assert.equal((await as(null, '/admin-only')).status, 401, 'anonymous -> 401');
  assert.equal((await as(employee, '/admin-only')).status, 403, 'employee on admin route -> 403');
  assert.equal((await as(admin, '/admin-only')).status, 200, 'admin on admin route -> 200');
  assert.equal((await as(employee, '/employee-area')).status, 200, 'employee on employee route -> 200');
  assert.equal((await as(admin, '/employee-area')).status, 200, 'admin has broader access -> 200');
});
