/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const { default: axios } = require('axios');

const CloudantHelper = require('./cloudant-helper');
const { getFHIRTenantConfig, retrieveFhirBearerToken } = require('./fhir-id-helper');
const transformFhirConsentHelper = require('./transform-fhir-helper');
const httpService = require('../services/httpClient');
const logger = require('./logger').getLogger('register-fhir-consent-helper');
const {
  CLOUDANT_VIEW,
  HTTP_METHOD,
  REQUEST_HEADERS,
  CONSENT_FIELDS,
  FHIR_KEY_PREFIX,
  FHIR_CLIENT_CONFIG,
} = require('./constants');
const config = require('../config');

const getIndividualFhirConsent = async (fhirConsentResourceId, fhirConsentResourceVersion, tenantID) => {
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

  const fhirResourceUrl = `${fhirUrl}/applications/v4/Consent/${fhirConsentResourceId}/_history/${fhirConsentResourceVersion}`;

  try {
    const authCreds = `${FHIR_CLIENT_CONFIG.CLIENT_ID_READ}:${loginFhirHistoryReadSecret}`;
    const buf = Buffer.from(authCreds);
    const authCredToken = buf.toString('base64');

    logger.info(`Attempting to get FHIR resource ${fhirConsentResourceId} version ${fhirConsentResourceVersion}`);
    const responseFromFhirResource = await axios.get(fhirResourceUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        [REQUEST_HEADERS.INTROSPECT_AUTH]: `${authCredToken}`,
      },
    });

    if (responseFromFhirResource.status !== 200) {
      logger.error(responseFromFhirResource.message);
      return ({
        status: responseFromFhirResource.status,
        message: responseFromFhirResource.message,
      });
    }

    return {
      status: 200,
      individualFhirConsent: responseFromFhirResource.data,
    };
  } catch (err) {
    const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
    logger.error(`Failed to get individual FHIR consent: ${errMsg}`);
    throw err;
  }
};

const removeConsentResource = async (db, resourceId) => {
  try {
    logger.debug('Attempting to remove ID consent resource');
    const cloudantClient = CloudantHelper.getInstance();
    await cloudantClient.deleteDocument(db, resourceId);
    logger.info(`Consent resource ${resourceId} has been removed`);
    return {
      status: 200,
    };
  } catch (err) {
    logger.error(`${err}`);
    return {
      status: 500,
      message: 'Failed to remove ID consent resource',
    };
  }
};

exports.getListFhirConsents = async (db) => {
  try {
    const cloudantClient = CloudantHelper.getInstance();
    const fhirConsents = await cloudantClient.getAllDocumentsByView(db, CLOUDANT_VIEW.FHIR_CONSENT_ID);
    if (fhirConsents && !fhirConsents.rows.length) {
      logger.error(`A list of documents in the database ${db} is empty`);
      return {
        status: 404,
        message: 'Not found resources',
      };
    }
    logger.info(`Received the list of documents in the database ${db}`);
    return fhirConsents.rows;
  } catch (err) {
    logger.error(err);
    return {
      status: 500,
      message: 'Failed to retrieve FHIR consent resource IDs from Cloudant',
    };
  }
};

exports.transformAndRegisterFhirConsents = async (fhirConsents, tenantID, db) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const resource of fhirConsents) {
    const fhirConsentResourceId = resource.key;
    const fhirConsentResourceMethod = resource.value.fhir_consent_method;
    const isFhirConsentResourceDeleted = fhirConsentResourceMethod === HTTP_METHOD.DELETE.toUpperCase();
    const fhirConsentResourceVersion = isFhirConsentResourceDeleted
      // eslint-disable-next-line radix
      ? resource.value.fhir_consent_id_version - 1
      : resource.value.fhir_consent_id_version;

    try {
      // eslint-disable-next-line no-await-in-loop
      const responseFromFhirResource = await getIndividualFhirConsent(fhirConsentResourceId, fhirConsentResourceVersion, tenantID);

      logger.info(`Retrieve individual consent resource from FHIR server. ID = ${fhirConsentResourceId}. Version = ${fhirConsentResourceVersion}`);

      // call Transform FHIR consent resource to CM consent
      const consent = transformFhirConsentHelper.mapObjectStructure(
        responseFromFhirResource.individualFhirConsent,
        isFhirConsentResourceDeleted,
        {
          [CONSENT_FIELDS.TENANT_ID.VALUE]: tenantID,
        },
      );
      logger.info(`Transformed the FHIR consent ${fhirConsentResourceId} to CM consent`);

      try {
        logger.info('Attempting to register consent');
        // eslint-disable-next-line no-await-in-loop
        const responseCM = await httpService.apiCall(config.httpClient.asyncRegisterConsentUrl, {
          method: HTTP_METHOD.POST,
          payload: consent,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            [REQUEST_HEADERS.TENANT_ID]: consent[CONSENT_FIELDS.TENANT_ID.VALUE],
          },
        });
        const responseFromRegisterConsent = responseCM.data || responseCM;
        // eslint-disable-next-line max-len
        logger.info(`Response from register consent endpoint: ${responseFromRegisterConsent.message}. Status: ${responseFromRegisterConsent.status}. TenantID: ${tenantID}`);

        if (responseFromRegisterConsent.status === 200) {
          // remove ID from tenant Cloudant DB
          try {
            // eslint-disable-next-line no-await-in-loop
            const removedResource = await removeConsentResource(db, resource.id);
            if (removedResource.status !== 200) {
              return ({
                status: removedResource.status,
                message: removedResource.message,
              });
            }
          } catch (err) {
            logger.error(`${err}`);
            throw err;
          }
        } else {
          logger.error(`Failed to getting FHIR consent: ${responseFromRegisterConsent.message}`);
          return ({
            status: responseFromRegisterConsent.status,
            message: responseFromRegisterConsent.message,
          });
        }
      } catch (err) {
        const errMsg = err.message || 'Register consent failed';
        logger.error(`Failed to register consent: ${err.message}`);
        return ({
          status: err.status || 500,
          message: errMsg,
        });
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to getting FHIR consent';
      logger.error(`Failed to getting FHIR consent: ${err.message}`);
      return ({
        status: err.status || 500,
        message: errMsg,
      });
    }
  } // end of loop

  return {
    status: 201,
    message: 'Register FHIR consents has been successful',
  };
};
