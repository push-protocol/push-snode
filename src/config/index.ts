// import {logLevel} from '../app'
// Set the NODE_ENV to 'development' by default
process.env.NODE_ENV = process.env.NODE_ENV || 'development'

export const changeLogLevel = (level: string) => {
  if (level) {
  }
}

// console.log("-------------custom------", logLevel)
export default {
  environment: process.env.NODE_ENV,

  port: parseInt(process.env.PORT || '3000', 10),

  runningOnMachine: process.env.RUNNING_ON_MACHINE,

  logs: {
    level: process.env.LOG_LEVEL || 'silly'
  },

  dbhost: process.env.DB_HOST,
  dbname: process.env.DB_NAME,
  dbuser: process.env.DB_USER,
  dbpass: process.env.DB_PASS,
  dbSeverName: process.env.DB_SERVER_NAME,

  REDIS_URL: process.env.REDIS_URL
}
