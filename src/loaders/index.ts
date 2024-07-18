import expressLoader from './express'
// import dependencyInjectorLoader from './dependencyInjector';
import logger from './logger'

// import initializer from './initializer';

// import dbLoader from './db';
// import dbListenerLoader from './dbListener';

//We have to import at least all the events once so they can be triggered
// import './events';

export default async ({ expressApp, server, testMode }) => {
  logger.info('loaders init')

  // await dependencyInjectorLoader();

  await expressLoader({ app: expressApp })

  // await socketLoader({ server: server });
}
