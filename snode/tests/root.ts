import chalk from 'chalk';

export const mochaHooks = {
  // This file is needed to end the test suite.
  afterAll(done) {
    done();
    console.log(chalk.bold.green.inverse('     ALL TEST CASES EXECUTED      '));
    process.exit(0);
  }
};