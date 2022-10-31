import express from 'express';
const bodyParser = require('body-parser');
const cors = require('cors');
import routes from '../api/index';
import config from '../config/index';
export default ({ app }: { app: express.Application }) => {

  app.get('/status', (req, res) => {
    res.status(200).end();
  });
  app.head('/status', (req, res) => {
    res.status(200).end();
  });

  app.use('/api', routes());

  // Load Static Files
  // app.use(express.static(config.staticServePath));

  /// catch 404 and forward to error handler
  app.use((req, res, next) => {
    const err = new Error('Not Found');
    err['status'] = 404;
    next(err);
  });

  /// error handlers
  app.use((err, req, res, next) => {
    /**
     * Handle 401 thrown by express-jwt library
     */
    if (err.name === 'UnauthorizedError') {
      return res
        .status(err.status)
        .send({ message: err.message })
        .end();
    }
    return next(err);
  });
  app.use((err, req, res) => {
    res.status(err.status || 500);
    res.json({
      error: {
        info: err.message
      }
    });
  });
};
