/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const querystring = require('querystring');
const { getNewestKey } = require('./keyprotect-helper');
const httpService = require('../services/httpClient');
const logger = require('./logger').getLogger('fhir-id-helper');
const {
  HTTP_METHOD,
  FHIR_KEY_PREFIX,
  FHIR_CLIENT_CONFIG,
} = require('./constants');

const getFHIRTenantConfig = async (keyName) => {
  try {
    const res = await getNewestKey(keyName);
    return res;
  } catch (err) {
    logger.error(`${err}`);
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    return {
      status: 500,
      message: errMsg,
    };
  }
};

const retrieveFhirBearerToken = async (tenantID, url, secret, isWrite) => {
  const keyName = `${FHIR_KEY_PREFIX}-${tenantID}`;
  logger.info(`Attempt to retrieve key ${keyName} from Key Protect`);

  const reqBody = querystring.stringify(isWrite
    ? {
      grant_type: FHIR_CLIENT_CONFIG.GRANT_TYPE,
      scope: FHIR_CLIENT_CONFIG.SCOPE_WRITE,
      client_id: FHIR_CLIENT_CONFIG.CLIENT_ID_WRITE,
      client_secret: `${secret}`,
    }
    : {
      grant_type: FHIR_CLIENT_CONFIG.GRANT_TYPE,
      scope: FHIR_CLIENT_CONFIG.SCOPE_READ,
      client_id: FHIR_CLIENT_CONFIG.CLIENT_ID_READ,
      client_secret: `${secret}`,
    });

  try {
    const responseFromFhirResource = await httpService.apiCall(url, {
      method: HTTP_METHOD.POST,
      payload: reqBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
    });

    return responseFromFhirResource;
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to retrieve FHIR token: ${errMsg}`);
    throw err;
  }
};

module.exports = {
  getFHIRTenantConfig,
  retrieveFhirBearerToken,
};
