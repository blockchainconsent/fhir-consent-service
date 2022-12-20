/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const { default: axios } = require('axios');
const { getFHIRTenantConfig, retrieveFhirBearerToken } = require('./fhir-id-helper');
const CloudantHelper = require('./cloudant-helper');
const logger = require('./logger').getLogger('poll-fhir-consent-history-helper');

const {
  QUERY_PARAMS,
  TYPE_FHIR_RESOURCE,
  FHIR_KEY_PREFIX,
  REQUEST_HEADERS,
  FHIR_CLIENT_CONFIG,
} = require('./constants');

const config = require('../config');

const { dbPartitionKey, dbNameFhirResource } = config.databaseConfig;

const getBatchConsents = (info) => info
  .filter(({ fullUrl }) => fullUrl.includes(TYPE_FHIR_RESOURCE.CONSENT))
  .map(({ fullUrl, request: { method }, response: { location, lastModified } }) => {
    const fhirConsentId = fullUrl.split('/')[1];
    const fhirConsentIdVersion = location.split('/')[3];

    return {
      _id: `${dbPartitionKey}:${fhirConsentId}:${fhirConsentIdVersion}`,
      name: `${dbNameFhirResource}`,
      fhir_consent_id: fhirConsentId,
      fhir_consent_id_version: fhirConsentIdVersion,
      fhir_consent_method: method,
      lastModified,
    };
  });

exports.getQueryParamsWithLastHistoryID = async (dbName, { pageSize }) => {
  try {
    const cloudantClient = CloudantHelper.getInstance();
    const result = await cloudantClient.getDocument(dbName, `${dbPartitionKey}:${QUERY_PARAMS.CHANGE_ID_MARKER}`);
    const changeIdMarker = result ? result.value : false;
    const params = changeIdMarker
      ? {
        _count: pageSize,
        _changeIdMarker: changeIdMarker,
      }
      : {
        _count: pageSize,
      };
    logger.info(`Setting up the query params ${JSON.stringify(params)}`);
    return params;
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to get the query params: ${errMsg}`);
    throw err;
  }
};

exports.retrieveFhirConsentHistory = async (params, tenantID) => {
  let fhirTenantConfig;
  let accessToken;

  try {
    const keyName = `${FHIR_KEY_PREFIX}-${tenantID}`;
    logger.info(`Attempt to retrieve key ${keyName} from Key Protect`);
    fhirTenantConfig = await getFHIRTenantConfig(keyName);
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to get retrieve key from Key Protect: ${errMsg}`);
    throw err;
  }

  const { fhirUrl, loginFhirHistoryReadSecret, loginFhirHistoryUrl } = fhirTenantConfig;

  try {
    const tokenRes = await retrieveFhirBearerToken(tenantID, loginFhirHistoryUrl, loginFhirHistoryReadSecret);
    accessToken = tokenRes.data.access_token;
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to retrieve FHIR bearer token: ${errMsg}`);
    throw err;
  }

  try {
    const authCreds = `${FHIR_CLIENT_CONFIG.CLIENT_ID_READ}:${loginFhirHistoryReadSecret}`;
    const buf = Buffer.from(authCreds);
    const authCredToken = buf.toString('base64');

    const fhirHistoryUrl = `${fhirUrl}/applications/v4/_history`;
    const responseFromFhirResource = await axios.get(fhirHistoryUrl, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        [REQUEST_HEADERS.INTROSPECT_AUTH]: `${authCredToken}`,
      },
    });

    if (responseFromFhirResource.status !== 200) {
      return {
        status: responseFromFhirResource.status,
        message: responseFromFhirResource.message,
      };
    }
    const { link: [{ url }] } = responseFromFhirResource.data;
    const changeIdMarkerString = url.split('=')[4];
    const changeIdMarker = Number(changeIdMarkerString);

    const batchConsents = responseFromFhirResource.data.entry
      ? getBatchConsents(responseFromFhirResource.data.entry)
      : [];

    return {
      status: 200,
      changeIdMarker,
      batchConsents,
    };
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to get FHIR history: ${errMsg}`);
    throw err;
  }
};

exports.saveResourceIDs = async (db, batchConsents) => {
  try {
    logger.debug(`Received data, updating or creating the database ${db}`);
    const cloudantClient = CloudantHelper.getInstance();
    await cloudantClient.getOrCreateDB(db);
    await cloudantClient.createOrUpdateBulk(db, batchConsents);
    return {
      status: 200,
    };
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to save resources: ${errMsg}`);
    return {
      status: 500,
      message: errMsg,
    };
  }
};

exports.updateOrCreateLastHistory = async (db, lastHistoryID) => {
  const cloudantClient = CloudantHelper.getInstance();
  try {
    logger.debug(`Registered successfully, updating or creating Last History ID in the database ${db}`);
    await cloudantClient.updateDocument(db, { id: QUERY_PARAMS.CHANGE_ID_MARKER, value: lastHistoryID });
    return {
      status: 200,
    };
  } catch (err) {
    if (err.message === 'not_found') {
      try {
        await cloudantClient.createDocument(db, { id: QUERY_PARAMS.CHANGE_ID_MARKER, value: lastHistoryID });
        return {
          status: 200,
        };
      } catch (error) {
        const errMsg = (error.response && error.response.data && error.response.data.msg) || error.message;
        logger.error(`Failed to create document Last History ID: ${errMsg}`);

        return {
          status: 500,
          message: errMsg,
        };
      }
    } else {
      logger.error(`${err}`);
      const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;

      return {
        status: 500,
        message: errMsg,
      };
    }
  }
};
