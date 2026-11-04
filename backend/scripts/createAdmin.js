// Creates the first admin account. Run manually from the backend folder:
//   npm run create-admin
//
// Prompts for name, email and password (the password is never echoed or printed).
// There is no default admin and no public registration endpoint.

const readline = require('readline');
const config = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
require('../models');
const { createUser, normalizeEmail, isValidEmail } = require('../services/userService');
const { getPasswordPolicyError, MIN_PASSWORD_LENGTH } = require('../services/passwordService');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Reads a line from the terminal without echoing the characters.
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);

    let value = '';
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('keypress', onKeypress);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    function onKeypress(str, key = {}) {
      if (key.ctrl && key.name === 'c') return finish(new Error('Cancelled'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return undefined;
      }
      if (str && !key.ctrl && !key.meta) value += str;
      return undefined;
    }

    stdin.on('keypress', onKeypress);
  });
}

async function main() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('This script must be run in an interactive terminal so the password can be entered securely.');
  }

  config.validateEnv(['MONGODB_URI']);
  await connectDB();

  console.log('\nCreate the initial admin account (press Ctrl+C to cancel)\n');

  const name = await ask('Name: ');
  if (!name) throw new Error('Name is required');

  const email = normalizeEmail(await ask('Email: '));
  if (!isValidEmail(email)) throw new Error('A valid email address is required');

  const password = await askHidden(`Password (min ${MIN_PASSWORD_LENGTH} characters): `);
  const policyError = getPasswordPolicyError(password);
  if (policyError) throw new Error(policyError);

  const confirmation = await askHidden('Confirm password: ');
  if (confirmation !== password) throw new Error('Passwords do not match');

  const user = await createUser({ name, email, password, role: 'admin' });
  console.log(`\nAdmin account created for ${user.email}. You can now sign in.`);
}

main()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    // Messages never include the password or its hash.
    console.error(`\nError: ${err.message}`);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
