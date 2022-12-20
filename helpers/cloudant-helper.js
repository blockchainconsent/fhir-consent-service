/* eslint-disable no-promise-executor-return */
/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { IamAuthenticator, BasicAuthenticator } = require('ibm-cloud-sdk-core');
const config = require('../config');
const { CLOUDANT_VIEW } = require('./constants');
const logger = require('./logger').getLogger('cloudant-helper');

const { dbPartitionKey } = config.databaseConfig;

const fhirConsentMap = {
  map: 'function (doc) {\n  if (doc.fhir_consent_id) {\n    emit(doc.fhir_consent_id, doc)\n  }\n}',
};

const partitionedDesignDocs = [
  {
    designDocument: {
      views: { [CLOUDANT_VIEW.FHIR_CONSENT_ID]: fhirConsentMap },
      language: 'javascript',
      options: {
        partitioned: true,
      },
    },
    ddoc: CLOUDANT_VIEW.FHIR_CONSENT_ID,
  },
];

function initCloudant() {
  const { connection } = config.databaseConfig;

  if (!connection) {
    throw new Error('Missing DB connection configuration');
  }
  const cloudantUrl = process.env.CLOUDANT_URL || connection.url;

  // As long as user provides 'iamApiKey' and 'account' values in config file
  // IAM method will be the authentication method.
  const useIamAuth = connection.account && connection.iamApiKey;

  // If user provides 'url', 'username', 'password' values in config file
  // and does not provide 'iamApiKey' or 'account' values,
  // then legacy authentication method will be used.
  const useLegacyAuth = cloudantUrl && connection.username && connection.password;

  let authenticator;
  if (useIamAuth) {
    logger.info('Use IAM auth for DB connection');

    authenticator = new IamAuthenticator({
      apikey: connection.iamApiKey,
    });
  } else if (useLegacyAuth) {
    logger.info('Use legacy auth for DB connection');

    authenticator = new BasicAuthenticator({
      username: process.env.CLOUDANT_USERNAME || connection.username,
      password: process.env.CLOUDANT_PASSWORD || connection.password,
    });
  } else {
    throw new Error('Missing DB credentials');
  }
  const service = new CloudantV1({ authenticator });

  service.setServiceUrl(cloudantUrl);

  return service;
}

let instance;

class CloudantHelper {
  static getInstance(txID) {
    if (!instance) {
      instance = new CloudantHelper();
    } else if (!instance.cloudant) {
      const errMsg = 'Cloudant was not initialized during startup, please check configuration';
      logger.error(errMsg, { txID });
      // eslint-disable-next-line no-throw-literal
      throw { status: 500, message: errMsg };
    }
    return instance;
  }

  async setupCloudant() {
    if (!this.cloudant) {
      try {
        this.cloudant = await initCloudant();
      } catch (err) {
        logger.error(`Failed to initCloudant: ${err}`);
        throw err;
      }
    }
  }

  async pingCloudant() {
    try {
      const reply = await this.cloudant.getSessionInformation();
      logger.info('Cloudant pinged successfully:', reply.result);
      return true;
    } catch (error) {
      logger.error(`Failed to ping Cloudant: ${error.message}`);
      return false;
    }
  }

  async checkConnection() {
    const timeout = (promise, time, exception) => {
      let timer;
      // eslint-disable-next-line no-return-assign
      return Promise.race([promise, new Promise((_res, rej) => timer = setTimeout(rej, time, exception))])
        .finally(() => clearTimeout(timer));
    };
    const timeoutError = new Error(`Request timed out after ${config.databaseConfig.connection.timeout} ms`);

    try {
      return await timeout(this.pingCloudant(), config.databaseConfig.connection.timeout, timeoutError);
    } catch (error) {
      logger.error(`Cloudant service error: ${error}`);
      return false;
    }
  }

  async createIndex(db, params) {
    try {
      await this.cloudant.postIndex({ db, ...params });
      logger.info(`Creating Cloudant index in database ${db}: ${JSON.stringify(params)}`);
    } catch (err) {
      logger.error(`Failed to create index in database ${db}: ${JSON.stringify(params)}`);
    }
  }

  async getOrCreateDB(db) {
    try {
      await this.cloudant.getDatabaseInformation({ db });
      logger.info(`Successfully got Cloudant database ${db}`);
    } catch (err) {
      const debugMsg = `Failed to get Cloudant database ${db}: ${err.message}`;
      logger.error(debugMsg);
      await this.createDB(db);
    }
  }

  async createDB(db) {
    try {
      await this.cloudant.putDatabase({ db, partitioned: true });
      logger.info(`Created Cloudant database ${db}`);

      if (Array.isArray(partitionedDesignDocs) && partitionedDesignDocs.length) {
        // eslint-disable-next-line no-restricted-syntax
        for (const designDoc of partitionedDesignDocs) {
          // eslint-disable-next-line no-await-in-loop
          await this.createDesignDocument(db, designDoc);
        }
      }
    } catch (e) {
      logger.error(`Failed to create Cloudant database ${db}: ${e.message}`);
      throw e;
    }
  }

  async createDesignDocument(db, payload) {
    try {
      await this.cloudant.putDesignDocument({ db, ...payload });
      logger.info(`Created the design view in the database ${db}`);
    } catch (err) {
      logger.error(`Failed to create design view in the database ${db}: ${err.message}`);
      throw err;
    }
  }

  async createDocument(db, data) {
    try {
      const { id, ...payload } = data;
      const { result } = await this.cloudant.postDocument({
        db,
        document: {
          _id: `${dbPartitionKey}:${id}`,
          ...payload,
        },
      });
      logger.info(`Document has been saved successfully: ${JSON.stringify(result)}`);
      return { _id: result.id, _rev: result.rev };
    } catch (err) {
      logger.error(`Failed to create document in the database ${db}: ${err.message}`);
      throw err;
    }
  }

  async getAllDocuments(db) {
    try {
      logger.debug(`Getting a list of all documents in a database ${db}`);
      const { result } = await this.cloudant.postAllDocs({
        db,
        includeDocs: true,
        startkey: dbPartitionKey,
      });
      return result;
    } catch (err) {
      logger.error(`Failed to getting a list of all documents in the database ${db}: ${err.message}`);
      throw err;
    }
  }

  async getAllDocumentsByView(db, viewName) {
    try {
      logger.debug(`Getting a list of all documents by view in a database ${db}`);
      const { result } = await this.cloudant.postPartitionView({
        db,
        ddoc: viewName,
        view: viewName,
        partitionKey: dbPartitionKey,
      });
      return result;
    } catch (err) {
      logger.error(`Failed to getting a list of all documents by view in the database ${db}: ${err.message}`);
      throw err;
    }
  }

  async getDocument(db, docId) {
    try {
      logger.debug('Retrieve a document');
      const { result } = await this.cloudant.getDocument({ db, docId });
      return result;
    } catch (err) {
      logger.error(`Failed to retrieve a document in the database ${db}: ${err.message}`);
      if (err.status === 404 && err.statusText === 'Object Not Found') {
        return false;
      }
      throw err;
    }
  }

  async findByQuery(db, selector) {
    try {
      logger.debug(`Searching the results by selector: "${JSON.stringify(selector)}"`);
      const { result } = await this.cloudant.postPartitionFind({
        db,
        partitionKey: dbPartitionKey,
        selector,
      });
      return result.docs;
    } catch (err) {
      logger.error(`Failed to get documents in the database ${db}: ${err.message}`);
      throw err;
    }
  }

  async updateDocument(db, document) {
    try {
      const existDocument = await this.cloudant.getDocument({
        db,
        docId: `${dbPartitionKey}:${document.id}`,
      });
      logger.info(`Document ${dbPartitionKey}:${document.id} exist`);
      if (!existDocument && !existDocument.result) {
        logger.error(`Document ${dbPartitionKey}:${document.id} is not exist`);
        throw new Error(`Document ${dbPartitionKey}:${document.id} is not exist`);
      }

      const { _id, ...payload } = existDocument.result;
      const { id, ...fields } = document;
      const { result } = await this.cloudant.putDocument({
        db,
        // eslint-disable-next-line no-underscore-dangle
        docId: _id,
        document: {
          ...payload,
          ...fields,
        },
      });
      logger.info(`Document has been updated successfully: ${JSON.stringify(result)}`);
      return { _id: result.id, _rev: result.rev };
    } catch (err) {
      logger.error(`Failed to update document in database ${db}: ${err.message}`);
      throw err;
    }
  }

  async createOrUpdateBulk(db, docs) {
    try {
      logger.debug(`Creating or updating a bulk of documents in a database ${db}`);
      // eslint-disable-next-line no-multi-assign
      const bulkDocs = CloudantV1.BulkDocs = { docs };
      await this.cloudant.postBulkDocs({
        db,
        bulkDocs,
      });
      logger.info('Cloudant has been updated successfully');
    } catch (err) {
      logger.error(`Failed to create or update bulk in database ${db}: ${err.message}`);
      throw err;
    }
  }

  async deleteDocument(db, docId) {
    try {
      logger.debug('Delete a document');
      const { result } = await this.cloudant.getDocument({ db, docId });
      // eslint-disable-next-line no-underscore-dangle
      const deletedDoc = await this.cloudant.deleteDocument({ db, docId, rev: result._rev });
      if (deletedDoc && deletedDoc.result && deletedDoc.result.ok) {
        logger.info(`Document has been deleted successfully: ${JSON.stringify(deletedDoc.result)}`);
        return deletedDoc.result;
      }
      return false;
    } catch (err) {
      logger.error(`Failed to delete a document in the database ${db}: ${err.message}`);
      throw err;
    }
  }
}

module.exports = CloudantHelper;
