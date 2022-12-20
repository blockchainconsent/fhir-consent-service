/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const config = require('../config');

module.exports = {
  getDBNameFhirResourceByTenantID(tenantID) {
    return tenantID
      ? `${config.databaseConfig.dbNameFhirResource}-${tenantID}`
      : config.databaseConfig.dbNameFhirResource;
  },
  getDBNameFhirResourceByTenantIDTest(tenantID) {
    return tenantID
      ? `${config.databaseConfig.dbNameFhirResource}-test-${tenantID}`
      : `${config.databaseConfig.dbNameFhirResource}-test`;
  },
};
