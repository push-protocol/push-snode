import 'reflect-metadata'; // We need this in order to use @Decorators
import express from 'express';
import chalk from 'chalk';

async function startServer(logLevel = null) {
  if (logLevel) {
    const changeLogLevel = (await require('./config/index')).changeLogLevel;
    changeLogLevel(logLevel);
  }

  // Continue Loading normally
  const config = (await require('./config/index')).default;
  logLevel = logLevel || config.logs.level;

  // ONLY TIME CONSOLE IS USED
  console.log(chalk.bold.inverse('RUNNING WITH LOG LEVEL '), chalk.bold.blue.inverse(`  ${logLevel}  `));

  // Load logger
  const Logger = (await require('./loaders/logger')).default;

  // Check environment setup first
  // Logger.info('✌️   Verifying ENV');
  // const EnvVerifierLoader = (await require('./loaders/envVerifier')).default;
  // await EnvVerifierLoader();
  // Logger.info('✔️   ENV Verified / Generated and Loaded!');

  await require('./api/index');
  await require('./loaders/express');

  // load app
  const app = express();
  const server = require("http").createServer(app);

  const Pool = require("pg").Pool;

  const credentials = {
    user: "postgres",
    host: "db",
    database: "snode1",
    password: "postgres",
    port: 5432,
  };

  let retries = 5;

  async function connect() {
    
    const pool = new Pool(credentials);
    const client = await pool.connect();
    console.log("Connected to database");
    client.release();
  }

  while (retries) {
    try {
      await connect();
      break;
    } catch (err) {
      console.log(err);
      retries -= 1;
      console.log(`retries left: ${retries}`);
      // wait 5 seconds
      await new Promise((res) => setTimeout(res, 5000));
    }}



  /**
   * A little hack here
   * Import/Export can only be used in 'top-level code'
   * Well, at least in node 10 without babel and at the time of writing
   * So we are using good old require.
   **/
  await require('./loaders').default({ expressApp: app, server: server });

  server.listen(config.port, err => {
    if (err) {
      Logger.error(err);
      process.exit(1);
      return;
    }
    Logger.info(`
      ################################################
      STARTED
      🛡️  Server listening on port: ${config.port} 🛡️
      ################################################
    `);
  });
}

// stopServer shuts down the server. Used in tests.
async function stopServer() {
  process.exit(0);
}

export { startServer, stopServer };
