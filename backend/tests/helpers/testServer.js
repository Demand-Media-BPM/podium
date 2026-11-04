require('./setupEnv');

// Integration tests use their OWN database and drop it afterwards. They never touch video_response_tool.
process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME_TEST || 'video_response_tool_test';

const mongoose = require('mongoose');
const config = require('../../config/env');
const { connectDB, disconnectDB } = require('../../config/db');
const { User } = require('../../models');
const createApp = require('../../app');
const { createUser } = require('../../services/userService');

const hasMongo = Boolean(config.mongodbUri);
const ORIGIN = 'http://localhost:5173';

async function startTestServer(appOptions = { loginRateLimit: { limit: 1000 } }) {
  if (config.mongodbDbName.endsWith('_test') === false) {
    throw new Error('Refusing to run integration tests against a database whose name does not end in "_test"');
  }
  if (!config.mongodbDbName.endsWith('_test')) {
    throw new Error('Refusing to run integration tests against a database whose name does not end in "_test"');
  }
  await connectDB();
  await mongoose.connection.dropDatabase(); // start from a clean slate
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));

  const server = await new Promise((resolve) => {
    const s = createApp(appOptions).listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  }

  return { baseUrl, stop };
}

// Minimal HTTP client that keeps a cookie jar (cookies are HttpOnly, so we handle them by hand).
function createClient(baseUrl) {
  let cookie = '';

  async function request(method, path, { body, headers = {}, origin = ORIGIN, useCookie = true } = {}) {
    const finalHeaders = { ...headers };
    if (origin) finalHeaders.Origin = origin;
    if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
    if (useCookie && cookie) finalHeaders.Cookie = cookie;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookies = res.headers.getSetCookie();
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const [name, value] = pair.split('=');
      if (name === config.session.cookieName) cookie = value ? `${name}=${value}` : '';
    }

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON body
    }
    return { status: res.status, headers: res.headers, setCookies, text, json };
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    baseUrl,
    getCookie: () => cookie,
    setCookie: (value) => {
      cookie = value;
    },
  };
}

async function seedUser(overrides = {}) {
  const data = {
    name: 'Test User',
    email: 'user@example.com',
    password: 'a-long-test-password-1',
    role: 'employee',
    ...overrides,
  };
  const created = await createUser(data);
  if (overrides.isActive === false) {
    await User.updateOne({ _id: created.id }, { isActive: false });
  }
  return { ...created, password: data.password };
}

// Creates a user and returns a client that is already logged in as them.
async function loginAs(baseUrl, overrides = {}) {
  const user = await seedUser(overrides);
  const client = createClient(baseUrl);
  const res = await client.post('/api/auth/login', { email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`test login failed with status ${res.status}`);
  return { user, client };
}

// Sends a prepared multipart body. Uses raw fetch with a trusted Origin, like the browser would.
async function postMultipart(baseUrl, path, { body, contentType }, { origin = ORIGIN, headers = {} } = {}) {
  const finalHeaders = { 'Content-Type': contentType, ...headers };
  if (origin) finalHeaders.Origin = origin;
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: finalHeaders, body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { status: res.status, headers: res.headers, text, json };
}

// The raw token is the last path segment of a returned public URL.
const tokenFromUrl = (url) => url.split('/').pop();

module.exports = { hasMongo, startTestServer, createClient, seedUser, loginAs, tokenFromUrl, postMultipart, ORIGIN };
