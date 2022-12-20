/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const CloudantHelper = require('./cloudant-helper');
const { apiCall } = require('../services/httpClient');
const { HTTP_METHOD } = require('./constants');
const config = require('../config');
const logger = require('./logger').getLogger('health-check');

// Check the health state of the gateway-api
async function checkRegisterConsentEndpoint() {
  try {
    logger.debug(`Sending HTTP(S) request to ${config.httpClient.healthRegisterConsentUrl}`);
    const { data } = await apiCall(config.httpClient.healthRegisterConsentUrl, {
      method: HTTP_METHOD.GET,
    });
    if (data.status === 'UP') {
      logger.info('Http service health is OK');
      return true;
    }
    logger.error(`Http service health is not OK: ${data.message}`);
    return false;
  } catch (err) {
    const errResponseMsg = err.response ? err.response.data.msg : err.message;
    logger.error(`Http service health is not OK: ${errResponseMsg}`);
    return false;
  }
}

// check the readiness of the fhir-consent-service
async function checkReadiness() {
  const cloudantClient = CloudantHelper.getInstance();
  const isCloudantConnection = await cloudantClient.checkConnection();
  const isResponseHttpClient = await checkRegisterConsentEndpoint();
  const arrServices = [
    { service: 'Cloudant', isConnection: isCloudantConnection },
    { service: 'HttpClient', isConnection: isResponseHttpClient },
  ];
  return new Promise((resolve, reject) => {
    const existProblem = arrServices.find((el) => el.isConnection !== true);
    if (existProblem) {
      // eslint-disable-next-line prefer-promise-reject-errors
      reject(`${existProblem.service} service is not ready to start`);
    }
    resolve('FHIR consent service is ready to start');
  });
}

const registerChecks = (health, healthcheck) => {
  const readinessCheck = new health.ReadinessCheck('readinessCheck', () => checkReadiness());
  healthcheck.registerReadinessCheck(readinessCheck);
};

module.exports = {
  registerChecks,
};
