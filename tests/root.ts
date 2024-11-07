import 'reflect-metadata'

import { EnvLoader } from '../src/utilz/envLoader'
process.env.CONFIG_DIR = './docker/s1'
EnvLoader.loadEnvOrFail()
export const mochaHooks = {
  // This file is needed to end the test suite.
  afterAll(done) {
    done()
    process.exit(0)
  }
}
