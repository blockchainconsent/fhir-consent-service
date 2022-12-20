/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const {
  getDBNameFhirResourceByTenantIDTest,
  getDBNameFhirResourceByTenantID,
} = require('../helpers/db');
const pollFhirConsentHistoryHelper = require('../helpers/poll-fhir-consent-history-helper');
const registerFhirConsentHelper = require('../helpers/register-fhir-consent-helper');
const logger = require('../helpers/logger')
  .getLogger('fhir-consent-controller');

const {
  REQUEST_HEADERS,
  QUERY_PARAMS,
} = require('../helpers/constants');

// Entering GET /poll-fhir-consent-history
exports.pollFhirConsentHistory = async (req, res) => {
  logger.info('Entering GET /poll-fhir-consent-history');

  const testMode = req.headers[REQUEST_HEADERS.TEST_MODE];
  const tenantID = req.headers[REQUEST_HEADERS.TENANT_ID];
  const { pageSize } = req.query;
  const {
    PAGE_SIZE,
    PAGE_SIZE_MAX,
  } = QUERY_PARAMS;
  const queryParams = {
    pageSize: pageSize && pageSize > 0 && pageSize <= PAGE_SIZE_MAX ? pageSize : PAGE_SIZE,
  };

  const db = testMode ? getDBNameFhirResourceByTenantIDTest(tenantID) : getDBNameFhirResourceByTenantID(tenantID);

  try {
    logger.debug('Getting FHIR history');

    // set the query params to retrieve FHIR consent history
    let params;
    try {
      params = await pollFhirConsentHistoryHelper.getQueryParamsWithLastHistoryID(
        db,
        { pageSize: queryParams.pageSize },
      );
    } catch (err) {
      logger.error(`Failed to getting the query params: ${err}`);
      return res.status(500)
        .json({
          status: 500,
          message: 'Internal Service Error',
        });
    }

    // get a response from retrieve FHIR consent history
    let responseFromFhirResource;
    try {
      responseFromFhirResource = await pollFhirConsentHistoryHelper.retrieveFhirConsentHistory(params, tenantID);
      if (responseFromFhirResource.status !== 200) {
        return res.status(responseFromFhirResource.status)
          .json({
            status: responseFromFhirResource.status,
            message: responseFromFhirResource.message,
          });
      }
    } catch (err) {
      logger.error(`Failed to retrieve FHIR consent history: ${err}`);
      return res.status(500)
        .json({
          status: 500,
          message: 'Failed to retrieve FHIR consent history',
        });
    }

    // save resources to Cloudant
    if (responseFromFhirResource.status === 200 && responseFromFhirResource.batchConsents.length) {
      try {
        const response = await pollFhirConsentHistoryHelper.saveResourceIDs(db, responseFromFhirResource.batchConsents);
        if (response.status !== 200) {
          return res.status(response.status)
            .json({
              status: response.status,
              message: response.message,
            });
        }
      } catch (err) {
        const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
        logger.error(`Register Consent History request failed: ${errMsg}`);

        return res.status(500)
          .json({
            status: 500,
            message: errMsg,
          });
      }

      // update or create the last history in Cloudant
      try {
        const response = await pollFhirConsentHistoryHelper.updateOrCreateLastHistory(
          db,
          responseFromFhirResource.changeIdMarker,
        );
        if (response.status !== 200) {
          return res.status(response.status)
            .json({
              status: response.status,
              message: response.message,
            });
        }
      } catch (err) {
        logger.error(`${err}`);
        return res.status(500)
          .json({
            status: 500,
            message: 'Internal Service Error',
          });
      }
    } else {
      logger.error('Not found FHIR consents');
      return res.status(404)
        .json({
          status: 404,
          message: 'Not found resources',
        });
    }

    logger.info('Polling FHIR history and saving Consent resource IDs was successful');

    return res.json({
      status: 200,
      message: 'Polling FHIR history and saving Consent resource IDs was successful',
    });
  } catch (err) {
    logger.error(`${err}`);

    return res.status(500)
      .json({
        status: 500,
        message: 'Failed to poll FHIR history',
      });
  }
};

// Entering POST /register-fhir-consents
exports.registerFhirConsents = async (req, res) => {
  logger.info('Entering POST /register-fhir-consents');

  const tenantID = req.headers[REQUEST_HEADERS.TENANT_ID];
  const testMode = req.headers[REQUEST_HEADERS.TEST_MODE];
  const db = testMode ? getDBNameFhirResourceByTenantIDTest(tenantID) : getDBNameFhirResourceByTenantID(tenantID);

  // Get the list of FHIR consent IDs from tenant Cloudant DB
  let fhirConsents;
  try {
    fhirConsents = await registerFhirConsentHelper.getListFhirConsents(db);
    if (fhirConsents && fhirConsents.status) {
      return res.status(fhirConsents.status)
        .json({
          status: fhirConsents.status,
          message: fhirConsents.message,
        });
    }
  } catch (err) {
    logger.error(`${err}`);
    return res.status(500)
      .json({
        status: 500,
        message: 'Failed to retrieve FHIR consent resource IDs from Cloudant',
      });
  }

  // transform FHIR consents to CM consents and register in CM
  let responseCM;
  try {
    responseCM = await registerFhirConsentHelper.transformAndRegisterFhirConsents(fhirConsents, tenantID, db);
  } catch (err) {
    logger.error(`${err}`);
    return res.status(500)
      .json({
        status: 500,
        message: 'Internal service error',
      });
  }

  const {
    status,
    message,
  } = responseCM;
  return res.status(status)
    .json({
      status,
      message,
    });
};

// Entering POST /process-fhir-consents
exports.processFhirConsents = async (req, res) => {
  logger.info('Entering POST /process-fhir-consents');

  const testMode = req.headers[REQUEST_HEADERS.TEST_MODE];
  const tenantID = req.headers[REQUEST_HEADERS.TENANT_ID];
  const { pageSize } = req.query;
  const {
    PAGE_SIZE,
    PAGE_SIZE_MAX,
  } = QUERY_PARAMS;
  const queryParams = {
    pageSize: pageSize && pageSize > 0 && pageSize <= PAGE_SIZE_MAX ? pageSize : PAGE_SIZE,
  };

  const db = testMode ? getDBNameFhirResourceByTenantIDTest(tenantID) : getDBNameFhirResourceByTenantID(tenantID);

  logger.debug('Getting FHIR history');

  // set the query params to retrieve FHIR consent history
  let params;
  try {
    params = await pollFhirConsentHistoryHelper.getQueryParamsWithLastHistoryID(db, { pageSize: queryParams.pageSize });
  } catch (err) {
    logger.error(`Failed to getting the query params: ${err}`);
    return res.status(500)
      .json({
        status: 500,
        message: 'Internal Service Error',
      });
  }

  // get a response from retrieve FHIR consent history
  let responseFromFhirResource;
  try {
    responseFromFhirResource = await pollFhirConsentHistoryHelper.retrieveFhirConsentHistory(params, tenantID);
    if (responseFromFhirResource.status !== 200) {
      return res.status(responseFromFhirResource.status)
        .json({
          status: responseFromFhirResource.status,
          message: responseFromFhirResource.message,
        });
    }
  } catch (err) {
    logger.error(`Failed to retrieve FHIR consent history: ${err}`);
    return res.status(500)
      .json({
        status: 500,
        message: 'Failed to retrieve FHIR consent history',
      });
  }

  // save resources to Cloudant
  if (responseFromFhirResource.status === 200 && responseFromFhirResource.batchConsents.length) {
    try {
      const response = await pollFhirConsentHistoryHelper.saveResourceIDs(db, responseFromFhirResource.batchConsents);
      if (response.status !== 200) {
        return res.status(response.status)
          .json({
            status: response.status,
            message: response.message,
          });
      }
    } catch (err) {
      const errMsg = (err.response && err.response.data && err.response.data.msg) || err.message;
      logger.error(`Register Consent History request failed: ${errMsg}`);

      return res.status(500)
        .json({
          status: 500,
          message: errMsg,
        });
    }

    // update or create the last history in Cloudant
    try {
      const response = await pollFhirConsentHistoryHelper.updateOrCreateLastHistory(
        db,
        responseFromFhirResource.changeIdMarker,
      );
      if (response.status !== 200) {
        return res.status(response.status)
          .json({
            status: response.status,
            message: response.message,
          });
      }
    } catch (err) {
      logger.error(`${err}`);
      return res.status(500)
        .json({
          status: 500,
          message: 'Internal Service Error',
        });
    }
  } else {
    logger.error('Not found FHIR consents');
    return res.status(404)
      .json({
        status: 404,
        message: 'Not found resources',
      });
  }

  logger.info('Polling FHIR history and saving Consent resource IDs was successful');

  // Get the list of FHIR consent IDs from tenant Cloudant DB
  let fhirConsents;
  try {
    fhirConsents = await registerFhirConsentHelper.getListFhirConsents(db);
    if (fhirConsents && fhirConsents.status) {
      return res.status(fhirConsents.status)
        .json({
          status: fhirConsents.status,
          message: fhirConsents.message,
        });
    }
  } catch (err) {
    logger.error(`${err}`);
    res.status(500)
      .json({
        status: 500,
        message: 'Failed to retrieve FHIR consent resource IDs from Cloudant',
      });
  }

  // transform FHIR consents to CM consents and register in CM
  let responseCM;
  try {
    responseCM = await registerFhirConsentHelper.transformAndRegisterFhirConsents(fhirConsents, tenantID, db);
  } catch (err) {
    logger.error(`${err}`);
    return res.status(500)
      .json({
        status: 500,
        message: 'Internal service error',
      });
  }

  const {
    status,
    message,
  } = responseCM;
  return res.status(status)
    .json({
      status,
      message: status === 201 ? 'Process FHIR consent resource IDs was successful' : message,
    });
};
