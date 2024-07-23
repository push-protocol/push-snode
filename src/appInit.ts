import { EnvLoader } from './utilz/envLoader'
EnvLoader.loadEnvOrFail()

import 'reflect-metadata' // We need this in order to use @Decorators

import chalk from 'chalk'
import express from 'express'
import http from 'http'
import { Container } from 'typedi'

import config, { changeLogLevel } from './config/index'
import loaders from './loaders'
import Logger from './loaders/logger'
import StorageNode from './services/messaging/storageNode'

async function startServer(logLevel = null) {
  if (logLevel) {
    changeLogLevel(logLevel)
  }
  logLevel = logLevel || config.logs.level

  // ONLY TIME CONSOLE IS USED
  console.log(
    chalk.bold.inverse('RUNNING WITH LOG LEVEL '),
    chalk.bold.blue.inverse(`  ${logLevel}  `)
  )

  // load express app
  const app = express()
  // create express server
  const server = http.createServer(app)
  // load all loaders
  await loaders({ expressApp: app, server: server })

  await Container.get(StorageNode).postConstruct()

  server.listen(config.port, (err) => {
    if (err) {
      Logger.error(err)
      process.exit(1)
    }
    Logger.info(`
      ################################################
      STARTED
      🛡️  Server listening on port: ${config.port} 🛡️
      ################################################
    `)
  })
}

// stopServer shuts down the server. Used in tests.
async function stopServer() {
  process.exit(0)
}

export { startServer, stopServer }
