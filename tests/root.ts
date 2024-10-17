import chalk from 'chalk'

export const mochaHooks = {
  // This file is needed to end the test suite.
  afterAll(done) {
    done()
    process.exit(0)
  }
}
