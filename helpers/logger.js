/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const log4js = require('log4js');
const cls = require('cls-hooked');

const { SESSIONS } = require('./constants');

log4js.addLayout('json', () => (logEvent) => {
  const clsNamespace = cls.getNamespace(SESSIONS.TRANSACTION);
  const log = {
    timestamp: logEvent.startTime,
    level: logEvent.level.levelStr,
    name: logEvent.categoryName,
    message: logEvent.data[0],
  };

  if (clsNamespace) {
    log.txID = clsNamespace.get('txID');
    log.TenantID = clsNamespace.get('TenantID');
  }

  return JSON.stringify(log);
});

log4js.configure(
  {
    appenders: {
      out: { type: 'console', layout: { type: 'json' } },
    },
    categories: {
      default: { appenders: ['out'], level: 'debug' },
    },
  },
);
function getLogger(module) {
  const logger = log4js.getLogger(module);
  logger.level = 'info';
  return logger;
}

module.exports = {
  getLogger,
};
