const base = require('../../jest.config.base');
module.exports = {
  ...base,
  coverageThreshold: {
    global: { lines: 95, statements: 95, functions: 60, branches: 85 },
  },
};
