import winston from 'winston';
import config from '../config';
import {WinstonUtil} from "../utilz/winstonUtil";


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

let transports = [];
transports.push(
  // Console should always be at 0 and dynamic log should always be at 2
  // remember and not change it as it's manually baked in hijackLogger
  WinstonUtil.consoleTransport,
  WinstonUtil.debugFileTransport,
  WinstonUtil.errorFileTransport,
);
// WE SIMPLY REDIRECT ALL TO winstonUtil formatter x winstonUtil transports
// this instance is being used across the whole codebase
const LoggerInstance = winston.createLogger({
  level: config.logs.level,
  levels: customLevels.levels,
  format: WinstonUtil.createFormat2WhichRendersClassName(),
  transports
});

winston.addColors(customLevels.colors);

export default LoggerInstance;