/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

require('newrelic');
require('dotenv').config();

const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const https = require('https');
const morgan = require('morgan');
const path = require('path');
const swaggerUI = require('swagger-ui-express');
const health = require('@cloudnative/health-connect');

const { registerChecks } = require('./helpers/health-checker');
const fhirConsentRoutes = require('./routes/fhir-consent');
const swaggerDoc = require('./swagger.json');

const config = require('./config');

const CloudantHelper = require('./helpers/cloudant-helper');
const { setKeyProtect } = require('./helpers/keyprotect-helper');
const tlsHelper = require('./helpers/tls-helper');
const logger = require('./helpers/logger').getLogger('app');

const app = express();

// Initiate database connection
const initDBConnection = async () => {
  try {
    const cloudantClient = CloudantHelper.getInstance();
    await cloudantClient.setupCloudant();
    await cloudantClient.checkConnection();
  } catch (err) {
    const errMsg = `Error starting server. Failed to setup Cloudant: ${err}`;
    logger.error(errMsg);
  }
};

// parse incoming request bodies in a middleware before your handlers, available under the req.body property
app.use(
  bodyParser.urlencoded({
    extended: false,
  }),
);
app.use(bodyParser.json());
app.enable('trust proxy');

// routes which should handle requests
app.use('/fhir-consent-service/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDoc));
app.use('/fhir-consent-service/api/v1/fhir-consent', fhirConsentRoutes);

// The health check
const healthcheck = new health.HealthChecker();
app.use('/fhir-consent-service/api/v1/health', health.HealthEndpoint(healthcheck));
app.use('/fhir-consent-service/api/v1/live', health.LivenessEndpoint(healthcheck));
app.use('/ready', health.ReadinessEndpoint(healthcheck));

// to handle cross-origin requests
app.use(cors());

const port = process.env.PORT || config.app.port;

let useHTTPS = false;
let serverCert;
let serverKey;

// The prepare to run the HTTPS Server
const preStartUp = () => {
  const tlsFolder = process.env.TLS_FOLDER_PATH || './config/tls';
  if (process.env.USE_HTTPS && process.env.USE_HTTPS.toLowerCase() === 'true' && fs.existsSync(tlsFolder)) {
    useHTTPS = true;
    serverCert = path.resolve(tlsFolder, 'tls.crt');
    serverKey = path.resolve(tlsFolder, 'tls.key');

    logger.info(`process.env.USE_HTTPS = ${process.env.USE_HTTPS}`);
    logger.info(`  Using server.key & server.cert from folder: TLS_FOLDER_PATH = ${tlsFolder}`);
    logger.info(`  server crt file = ${serverCert}`);
    logger.info(`  server key file = ${serverKey}`);
  }

  logger.info(`NODE JS RUNNING ON ${process.version}`);
  logger.info(`process.env.PORT = ${port}`);

  process.on('unhandledRejection', (reason, p) => {
    logger.warn(`Unhandled Rejection at promise: ${JSON.stringify(p)} reason: ${reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.warn(`Uncaught exception = ${err}`);
    logger.warn(`Uncaught stack = ${err.stack}`);
  });
};

// start up the HTTP/S server
const onStartUp = async (err) => {
  if (err) {
    logger.error(`Error starting server: ${err}`);
    process.exit(1);
  }
  setKeyProtect();
  registerChecks(health, healthcheck);
  initDBConnection();
  logger.info(`Server running on port ${port}`);
};

preStartUp();

// middleware to log HTTP requests and errors
app.use(morgan('dev'));

// to handle the errors
app.use((_req, _res, next) => {
  const error = new Error('No route found');
  error.status = 404;
  next(error);
});

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, next) => {
  res.status(error.status || 500);
  res.json({
    error: {
      message: error.message,
    },
  });
});

let server;
const start = () => {
  server = app.listen(port, onStartUp);
};

if (useHTTPS) {
  const foundKeyFiles = tlsHelper.validateSSLFiles(serverKey, serverCert);
  if (foundKeyFiles) {
    const options = {
      key: fs.readFileSync(serverKey),
      cert: fs.readFileSync(serverCert),
      secureOptions: tlsHelper.getSecureOptions(),
      ciphers: tlsHelper.getCiphersForServerOptions(),
      honorCipherOrder: true,
    };
    server = https.createServer(options, app).listen(port, onStartUp);
  } else {
    start();
  }
} else {
  start();
}

// Handle shutdown signals. Safely shutting down processes and closing connections
const signalTraps = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

signalTraps.forEach((type) => {
  process.once(type, () => {
    logger.info(`Received kill '${type}' signal, shutting down gracefully`);
    server.close((err) => {
      if (err) {
        logger.error('An error while shutting down:', err);
        process.exit(1);
      }
      process.exit(0);
    });
  });
});

module.exports = app;
