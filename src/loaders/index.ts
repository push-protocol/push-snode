import dependencyInjectorLoader from './dependencyInjector'
import expressLoader from './express'
import logger from './logger'

export default async ({ expressApp, server, testMode = false }) => {
  logger.info('Loaders init')

  dependencyInjectorLoader()
  logger.info('Dependency Injector loaded!')

  expressLoader({ app: expressApp })
  logger.info('Express loaded!')
}
