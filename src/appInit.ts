import {EnvLoader} from "./utilz/envLoader";
EnvLoader.loadEnvOrFail();

import 'reflect-metadata'; // We need this in order to use @Decorators
import express from 'express';
import chalk from 'chalk';
import {Container} from "typedi";
import StorageNode from "./services/messaging/storageNode";
import {ValidatorContractState} from "./services/messaging-common/validatorContractState";
import {MySqlUtil} from "./utilz/mySqlUtil";


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

  await require('./api/index');
  await require('./loaders/express');
  Container.set("logger", Logger);

  await Container.get(StorageNode).postConstruct();

  // load app
  const app = express();
  const server = require("http").createServer(app);

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
