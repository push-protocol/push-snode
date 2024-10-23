import { Router } from 'express'

import { ExpressUtil } from '../utilz/expressUtil'

// guaranteed to get dependencies
export default () => {
  const app = Router()
  app.use(ExpressUtil.handle)
  return app
}
