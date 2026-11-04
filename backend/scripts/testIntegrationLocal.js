// Run integration tests against an isolated local MongoDB, without using backend/.env credentials.
const {MongoMemoryServer} = require('mongodb-memory-server');
const {spawn} = require('node:child_process');
const path = require('node:path');
async function main() {
  const mongo = await MongoMemoryServer.create({binary: {downloadDir: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server')}});
  try {
    const files = process.argv.slice(2);
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000', ...(files.length ? files : ['tests/integration/*.test.js'])], {
      cwd:path.resolve(__dirname,'..'), stdio:'inherit',
      env:{...process.env,MONGODB_URI:mongo.getUri(),MONGODB_DB_NAME_TEST:'video_response_tool_' + process.pid + '_test'},
    });
    process.exitCode = await new Promise(resolve=>{child.on('error',()=>resolve(1));child.on('exit',code=>resolve(code ?? 1));});
  } finally {await mongo.stop();}
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
