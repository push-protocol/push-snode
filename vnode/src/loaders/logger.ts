import Transport from 'winston-transport';
import winston from 'winston';

import config from '../config';
const moment = require('moment'); // time library

class DynamicLoggerTransport extends Transport {
  private dynamicLogging: object = null;
  private formatLogInfo: Function = null;

  constructor(opts, formatLogInfo) {
    super(opts);
    this.formatLogInfo = formatLogInfo;
  }

  public setDynamicLoggerObject(object) {
    this.dynamicLogging = object;
  }

  // public log(info, callback) {
  //   setImmediate(() => {
  //     if (this.dynamicLogging) {
  //       this.dynamicLogging.updateFooterLogs(this.formatLogInfo(info));
  //     }
  //   });

  //   // Perform the writing to the remote service
  //   callback();
  // }
}

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    simulate: 4,
    input: 5,
    saved: 6,
    verbose: 7,
    debug: 8,
    silly: 9,
  },
  colors: {
    info: 'green',
    simulate: 'white bold dim',
    input: 'inverse bold',
    saved: 'italic white',
    debug: 'yellow'
  }
};

var options = {
  file: {
    level: 'verbose',
    filename: `${__dirname}/../../logs/app.log`,
    handleExceptions: true,
    json: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: true
  }
};

const parser = (param: any): string => {
  if (!param) {
    return '';
  }
  if (typeof param === 'string') {
    return param;
  }

  return Object.keys(param).length ? JSON.stringify(param, undefined, 2) : '';
};

const formatLogInfo = info => {
  const { timestamp, level, message, meta } = info;

  const ts = moment(timestamp)
    .local()
    .format('HH:MM:ss');
  const metaMsg = meta ? `: ${parser(meta)}` : '';

  return `${ts} ${level}    ${parser(message)} ${metaMsg}`;
};

const formatter = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(info => {
    return formatLogInfo(info);
  }),
  winston.format.colorize({
    all: true
  })
);

let transports = [];
let dynamicLoggingTransport = new DynamicLoggerTransport(
  {
    format: formatter
  },
  formatLogInfo
);

transports.push(
  // Console should always be at 0 and dynamic log should always be at 2
  // remember and not change it as it's manually baked in hijackLogger
  new winston.transports.Console({
    format: formatter
  }),
  new winston.transports.File(options.file),
  dynamicLoggingTransport
);

const LoggerInstance = winston.createLogger({
  level: global.logLevel || config.logs.level,
  levels: customLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports
});

winston.addColors(customLevels.colors);

const hijackLogger = dynamicLogger => {
  dynamicLoggingTransport.setDynamicLoggerObject(dynamicLogger);

  let count = 0;
  LoggerInstance.transports.forEach(t => {
    let silence = false;

    if (dynamicLogger) {
      // dynamic logger is on, make console silent
      if (count == 0) {
        silence = true;
      }
    } else {
      // dynamic logger is off, make it silent
      if (count == 2) {
        silence = true;
      }
    }

    t.silent = silence;

    count++;
  });
};

//LoggerInstance.hijackLogger = hijackLogger;

export default LoggerInstance;
