import { Container } from 'typedi'

import LoggerInstance from './logger'

/**
 * Inject Global dependencies
 */
export default () => {
  try {
    Container.set('logger', LoggerInstance)
    LoggerInstance.info('Winston Logger Injected')
  } catch (e) {
    LoggerInstance.error('Error on dependency injector loader: %o', e)
    throw e
  }
}
