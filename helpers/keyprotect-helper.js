/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const { helperKeyProtect } = require('hcls-common');
const log = require('./logger').getLogger('keyprotect-helper');

const config = require('../config');

const url = process.env.KEYPROTECT_URL;
const instanceID = process.env.KEYPROTECT_GUID;
const apikey = process.env.KEYPROTECT_SERVICE_API_KEY;

// configures KeyProtect from common lib
const setKeyProtect = () => {
  const keyProtectDataObj = {
    url,
    instanceID,
    apikey,
    retries: config.keyProtect.retries,
    retryDelay: config.keyProtect.retryDelay,
    timeout: config.keyProtect.timeout,
  };

  helperKeyProtect.setConfig(keyProtectDataObj);
};

const getNewestKey = async (keyName) => {
  try {
    const tenantData = await helperKeyProtect.getNewestKeyByName(keyName);

    if (!tenantData) {
      log.error('TenantID is not onboarded');
      throw new Error('TenantID is not onboarded');
    }

    log.info('Data successfully retrieved from KeyProtect');
    return tenantData;
  } catch (error) {
    const errMsg = `Failed to get data from KeyProtect: ${error}`;
    log.error(errMsg);
    throw new Error(errMsg);
  }
};

module.exports = {
  setKeyProtect,
  getNewestKey,
};
