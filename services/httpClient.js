/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const axios = require('axios');
const rax = require('retry-axios');
const https = require('https');

const config = require('../config');
const logger = require('../helpers/logger').getLogger('HTTPClient');

// get request config to HTTP service
const setAxiosOptions = (data, customAgent) => {
  if (config.httpClient.apiProtocol === 'https') {
    const httpsAgent = !customAgent
      ? new https.Agent({ rejectUnauthorized: false })
      : new https.Agent(customAgent);
    return { httpsAgent, ...data };
  }
  return { ...data };
};

// set configuration for HTTP Client
const setConfigHttpClient = (url, params, headers, customAgent) => {
  const data = {
    baseURL: url,
    params,
    timeout: config.httpClient.timeout,
    headers: { ...headers },
  };
  const axiosPayload = setAxiosOptions(data, customAgent);
  const httpClient = axios.create(axiosPayload);

  const retries = config.httpClient.retries || 1;
  const retryDelay = config.httpClient.retryDelay || 3000;

  // setup retry-axios config
  httpClient.defaults.raxConfig = {
    instance: httpClient,
    retry: retries,
    noResponseRetries: retries, // retry when no response received (such as on ETIMEOUT)
    statusCodesToRetry: [[500, 599]], // retry only on 5xx responses (no retry on 4xx responses)
    httpMethodsToRetry: ['POST', 'GET', 'HEAD', 'PUT'],
    backoffType: 'static', // options are 'exponential' (default), 'static' or 'linear'
    retryDelay,
    onRetryAttempt: (err) => {
      const cfg = rax.getConfig(err);
      logger.warn('No response received, retrying request:');
      logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`);
    },
  };
  rax.attach(httpClient);
  return httpClient;
};

module.exports = {
  // for accessing and manipulating parts of the HTTP pipeline, such as requests and responses
  setConfigHttpClient,
  async apiCall(url, {
    method,
    payload,
    params,
    headers,
    customAgent,
  }) {
    try {
      logger.debug(`Sending request to ${url}. Method: ${method}`);
      const httpClient = setConfigHttpClient(url, params, headers, customAgent);
      const response = await httpClient[method]('/', payload);
      logger.info(`Request was successful. URL: ${url}. Method: "${method}"`);
      return response;
    } catch (err) {
      const errResponseMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
      const errResponseStatus = err.response ? err.response.status || err.response.data.status : 500;
      logger.error(errResponseMsg);
      return {
        status: errResponseStatus,
        message: `Failed to request: ${errResponseMsg}`,
      };
    }
  },
};
