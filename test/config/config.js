/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const config = {
  databaseConfig: {
    connection: {
      url: process.env.CLOUDANT_URL,
      username: process.env.CLOUDANT_USERNAME,
      password: process.env.CLOUDANT_PASSWORD,
    },
    dbNameFhirResource: 'fhir-resource-ids',
    dbPartitionKey: 'cm',
  },
};

module.exports = config;
