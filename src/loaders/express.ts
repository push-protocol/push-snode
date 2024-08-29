import cors from 'cors'
import express from 'express'
import { NextFunction, Request, Response } from 'express'
import jsonRouter from 'express-json-rpc-router'

import { rpcControllerConfigs } from '../rpc/index'

interface AppError extends Error {
  status?: number
}

export default ({ app }: { app: express.Application }) => {
  app.get('/status', (req: Request, res: Response) => {
    res.status(200).end()
  })
  app.head('/status', (req: Request, res: Response) => {
    res.status(200).end()
  })

  // The magic package that prevents frontend developers going nuts
  // Alternate description:
  // Enable Cross Origin Resource Sharing to all origins by default
  app.use(cors())

  app.use(express.json())

  app.use(
    jsonRouter({
      methods: rpcControllerConfigs.controllers,
      afterMethods: rpcControllerConfigs.afterController,
      onError(err) {
        console.log(err)
      }
    })
  )

  /// catch 404 and forward to error handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    const err = new Error('Not Found')
    err['status'] = 404
    next(err)
  })

  /// error handlers
  app.use((err: AppError, req: Request, res: Response, next: NextFunction) => {
    /**
     * Handle 401 thrown by express-jwt library
     */
    if (err.name === 'UnauthorizedError') {
      return res.status(err.status).send({ message: err.message }).end()
    }
    return next(err)
  })
  app.use((err: AppError, req: Request, res: Response, next: NextFunction) => {
    res.status(err.status || 500)
    res.json({
      error: {
        info: err.message
      }
    })
  })
}
