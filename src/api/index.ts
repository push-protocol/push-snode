import { Router } from 'express'

import { ExpressUtil } from '../utilz/expressUtil'
import { storageRoutes } from './routes/storageRoutes'

// guaranteed to get dependencies
export default () => {
  const app = Router()
  app.use(ExpressUtil.handle)
  storageRoutes(app)
  return app
}
