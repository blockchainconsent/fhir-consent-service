/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const { default: axios } = require('axios');
const chai = require('chai');
const chaiHttp = require('chai-http');
const { CloudantHelperLib } = require('hcls-common');
const httpService = require('../../services/httpClient');
const { httpClient } = require('../../config/config.json');
const { getFHIRTenantConfig, retrieveFhirBearerToken } = require('../../helpers/fhir-id-helper');

const {
  REQUEST_HEADERS,
  QUERY_PARAMS,
  HTTP_METHOD,
  CLOUDANT_VIEW,
  CONSENT_FIELDS,
  FHIR_KEY_PREFIX,
  FHIR_CLIENT_CONFIG,
} = require('../config/constants');

const { TENANT_ID, PAGE_SIZE, CHANGE_ID_MARKER } = QUERY_PARAMS;
const appConfig = require('../config/config');

chai.use(chaiHttp);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { expect } = chai;

const server = require('../../app');

const testFhirConsent = require('../test-fhir-consent-example.json');

testFhirConsent.id = `consent-${Date.now()}`;
const testPatientId = `Patient/patient-${Date.now()}`;
testFhirConsent.patient.reference = testPatientId;
let token;

const { dbNameFhirResource, dbPartitionKey, connection } = appConfig.databaseConfig;

// eslint-disable-next-line func-names
describe('Test Cloudant, poll FHIR consent history', function () {
  this.timeout(30000);
  const db = `${dbNameFhirResource}-test-${TENANT_ID}`;
  let changeIdMarker = '';
  let responseFromFhirResource;

  before(async () => {
    // eslint-disable-next-line no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, 7000));
  });

  before(async () => {
    const keyName = `${FHIR_KEY_PREFIX}-${TENANT_ID}`;
    const fhirTenantConfig = await getFHIRTenantConfig(keyName);
    const {
      fhirUrl, loginFhirHistoryReadSecret, loginFhirHistoryWriteSecret, loginFhirHistoryUrl,
    } = fhirTenantConfig;

    const loginWriteRes = await retrieveFhirBearerToken(TENANT_ID, loginFhirHistoryUrl, loginFhirHistoryWriteSecret, true);
    const tokenWrite = loginWriteRes.data.access_token;

    const fhirResourceUrl = `${fhirUrl}/applications/v4/Consent/${testFhirConsent.id}`;

    const authCreds = `${FHIR_CLIENT_CONFIG.CLIENT_ID_WRITE}:${loginFhirHistoryWriteSecret}`;
    const buf = Buffer.from(authCreds);
    const authCredToken = buf.toString('base64');

    await axios.put(fhirResourceUrl, testFhirConsent, {
      headers: {
        Authorization: `Bearer ${tokenWrite}`,
        [REQUEST_HEADERS.INTROSPECT_AUTH]: `${authCredToken}`,
      },
    });

    await axios.delete(fhirResourceUrl, {
      headers: {
        Authorization: `Bearer ${tokenWrite}`,
        [REQUEST_HEADERS.INTROSPECT_AUTH]: `${authCredToken}`,
      },
    });

    const fhirConsentMap = {
      map: `function (doc) {\n  if (doc.fhir_consent_id && doc.fhir_consent_id === '${testFhirConsent.id}') {\n    emit(doc.fhir_consent_id, doc)\n  }\n}`,
    };

    const partitionedDesignDocs = [
      {
        designDocument: {
          views: { [CLOUDANT_VIEW.FHIR_CONSENT_ID]: fhirConsentMap },
          language: 'javascript',
          options: { partitioned: true },
        },
        ddoc: CLOUDANT_VIEW.FHIR_CONSENT_ID,
      },
    ];

    const cloudantClient = CloudantHelperLib.getInstance({ dbPartitionKey, connection });
    await cloudantClient.setupCloudant();
    await cloudantClient.getOrCreateDB(db, partitionedDesignDocs);

    const loginReadRes = await retrieveFhirBearerToken(TENANT_ID, loginFhirHistoryUrl, loginFhirHistoryReadSecret);
    const tokenRead = loginReadRes.data.access_token;

    const authCredsReading = `${FHIR_CLIENT_CONFIG.CLIENT_ID_READ}:${loginFhirHistoryReadSecret}`;
    const bufReading = Buffer.from(authCredsReading);
    const authCredTokenReading = bufReading.toString('base64');

    const getLastHistoryID = async (dbName) => {
      try {
        const { value } = await cloudantClient.getDocument(dbName, `${dbPartitionKey}:${CHANGE_ID_MARKER}`);
        return value;
      } catch (err) {
        return false;
      }
    };

    const changeIdMarkerParams = await getLastHistoryID(db);
    const params = changeIdMarkerParams
      ? {
        _count: PAGE_SIZE,
        _changeIdMarker: changeIdMarkerParams,
      }
      : {
        _count: PAGE_SIZE,
      };

    const fhirHistoryUrl = `${fhirUrl}/applications/v4/_history`;
    responseFromFhirResource = await axios.get(fhirHistoryUrl, {
      params,
      headers: {
        Authorization: `Bearer ${tokenRead}`,
        [REQUEST_HEADERS.INTROSPECT_AUTH]: `${authCredTokenReading}`,
      },
    });

    const { link: [{ url }] } = responseFromFhirResource.data;
    const changeIdMarkerString = url.split('=')[4];
    changeIdMarker = Number(changeIdMarkerString);

    const urlLogin = `${httpClient.baseSimpleConsentUrl}/simple-consent/api/v1/users/login`;
    const res = await httpService.apiCall(urlLogin, {
      method: HTTP_METHOD.POST,
      payload: {
        email: process.env.TEST_SIMPLE_CONSENT_API_EMAIL,
        password: process.env.TEST_SIMPLE_CONSENT_API_PASSWORD,
      },
    });
    token = res.data.access_token;
  });

  describe('Process FHIR consents', function getTest() {
    this.timeout(30000);

    it('Should return 200 on success by getting poll history', (done) => {
      const path = `/fhir-consent-service/api/v1/fhir-consent/poll-fhir-consent-history?pageSize=${PAGE_SIZE}`;
      chai
        .request(server)
        .get(path)
        .set(REQUEST_HEADERS.TEST_MODE, true)
        .set(REQUEST_HEADERS.TENANT_ID, TENANT_ID)
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('message');
          expect(res.body.message).to.equal('Polling FHIR history and saving Consent resource IDs was successful');
          done();
        });
    });

    it('Should match history bundle', async () => {
      const cloudantClient = CloudantHelperLib.getInstance({ dbPartitionKey, connection });

      const batchConsents = responseFromFhirResource.data.entry
        .filter(({ fullUrl }) => fullUrl.includes('Consent') && fullUrl.includes(testFhirConsent.id))
        .map(({ fullUrl, response: { location } }) => {
          const fhirConsentId = fullUrl.split('/')[1];
          const fhirConsentIdVersion = location.split('/')[3];
          return `${dbPartitionKey}:${fhirConsentId}:${fhirConsentIdVersion}`;
        });

      const consentsQuery = await cloudantClient.getAllDocumentsByView(db, CLOUDANT_VIEW.FHIR_CONSENT_ID, dbPartitionKey);
      const { value } = await cloudantClient.getDocument(db, `${dbPartitionKey}:${CHANGE_ID_MARKER}`);

      const consentsQueryIds = consentsQuery.rows.map(({ id }) => id);
      expect(consentsQueryIds).to.have.members(batchConsents);
      expect(changeIdMarker).to.equal(value);
    });

    it('Should return 201 on success by registering FHIR consents', (done) => {
      const path = '/fhir-consent-service/api/v1/fhir-consent/register-fhir-consents';
      chai
        .request(server)
        .post(path)
        .set(REQUEST_HEADERS.TEST_MODE, true)
        .set(REQUEST_HEADERS.TENANT_ID, TENANT_ID)
        .end((err, res) => {
          expect(res).to.have.status(201);
          expect(res.body).to.have.property('message');
          expect(res.body.message).to.equal('Register FHIR consents has been successful');
          done();
        });
    });

    describe('Query consent by patient', function queryTest() {
      this.timeout(15000);

      it('Should return 200 by query consent by patient', (done) => {
        const path = '/simple-consent/api/v1/consent/query';
        const patientID = testPatientId.split('/')[1];

        setTimeout(() => {
          chai
            .request(httpClient.baseSimpleConsentUrl)
            .get(path)
            .set(REQUEST_HEADERS.PATIENT_ID, patientID)
            .set(REQUEST_HEADERS.TENANT_ID, TENANT_ID)
            .set({ Authorization: `Bearer ${token}` })
            .end((err, res) => {
              const Expiration = Date.parse(testFhirConsent.provision.period.end);
              expect(res).to.have.status(200);
              expect(res.body.msg).to.be.a('string');
              expect(res.body.msg).to.be.equal('GET /consent was successful');
              expect(res.body.payload).to.have.lengthOf(2);

              const deletedConsent = res.body.payload[0];
              expect(deletedConsent[CONSENT_FIELDS.TENANT_ID.VALUE]).to.be.a('string');
              expect(deletedConsent[CONSENT_FIELDS.TENANT_ID.VALUE]).to.be.equal(TENANT_ID);
              expect(deletedConsent[CONSENT_FIELDS.PATIENT_ID.VALUE]).to.be.a('string');
              expect(deletedConsent[CONSENT_FIELDS.PATIENT_ID.VALUE]).to.equal(testPatientId.split('/')[1]);
              expect(deletedConsent[CONSENT_FIELDS.SERVICE_ID.VALUE]).to.be.a('string');
              // eslint-disable-next-line no-unused-expressions
              expect(deletedConsent[CONSENT_FIELDS.SERVICE_ID.VALUE]).to.be.empty;
              // eslint-disable-next-line no-unused-expressions
              expect(deletedConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE]).to.not.be.empty;
              expect(JSON.parse(deletedConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE][0])).to.have.own.property('system');
              expect(JSON.parse(deletedConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE][0])).to.have.own.property('code');
              expect(deletedConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE][0]).to.include('patient-privacy');
              expect(deletedConsent[CONSENT_FIELDS.CONSENT_OPTION.VALUE]).to.be.an('array');
              expect(deletedConsent[CONSENT_FIELDS.CONSENT_OPTION.VALUE]).to.have.lengthOf(1);
              expect(deletedConsent[CONSENT_FIELDS.CONSENT_OPTION.VALUE][0]).to.equal('deny');
              expect(deletedConsent[CONSENT_FIELDS.FHIR_POLICY.VALUE]).to.equal('regular');
              expect(deletedConsent[CONSENT_FIELDS.FHIR_STATUS.VALUE]).to.be.a('string');
              expect(deletedConsent[CONSENT_FIELDS.FHIR_PROVISION_TYPE.VALUE]).to.be.a('string');
              expect(deletedConsent[CONSENT_FIELDS.FHIR_PROVISION_ACTION.VALUE]).to.be.a('string');
              expect(deletedConsent[CONSENT_FIELDS.EXPIRATION.VALUE]).to.equal(Expiration);

              const originalConsent = res.body.payload[1];
              expect(originalConsent[CONSENT_FIELDS.TENANT_ID.VALUE]).to.be.a('string');
              expect(originalConsent[CONSENT_FIELDS.TENANT_ID.VALUE]).to.be.equal(TENANT_ID);
              expect(originalConsent[CONSENT_FIELDS.PATIENT_ID.VALUE]).to.be.a('string');
              expect(originalConsent[CONSENT_FIELDS.PATIENT_ID.VALUE]).to.equal(testPatientId.split('/')[1]);
              expect(originalConsent[CONSENT_FIELDS.SERVICE_ID.VALUE]).to.be.a('string');
              // eslint-disable-next-line no-unused-expressions
              expect(originalConsent[CONSENT_FIELDS.SERVICE_ID.VALUE]).to.be.empty;
              // eslint-disable-next-line no-unused-expressions
              expect(originalConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE]).to.not.be.empty;
              expect(JSON.parse(originalConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE][0])).to.have.own.property('system');
              expect(JSON.parse(originalConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE][0])).to.have.own.property('code');
              expect(originalConsent[CONSENT_FIELDS.DATATYPEIDS.VALUE][0]).to.include('patient-privacy');
              expect(originalConsent[CONSENT_FIELDS.CONSENT_OPTION.VALUE]).to.be.an('array');
              expect(originalConsent[CONSENT_FIELDS.CONSENT_OPTION.VALUE]).to.have.lengthOf(1);
              expect(originalConsent[CONSENT_FIELDS.CONSENT_OPTION.VALUE][0]).to.equal('read');
              expect(originalConsent[CONSENT_FIELDS.FHIR_POLICY.VALUE]).to.equal('regular');
              expect(originalConsent[CONSENT_FIELDS.FHIR_STATUS.VALUE]).to.be.a('string');
              expect(originalConsent[CONSENT_FIELDS.FHIR_PROVISION_TYPE.VALUE]).to.be.a('string');
              expect(originalConsent[CONSENT_FIELDS.FHIR_PROVISION_ACTION.VALUE]).to.be.a('string');
              expect(originalConsent[CONSENT_FIELDS.EXPIRATION.VALUE]).to.equal(Expiration);

              done();
            });
        }, 10000);
      });
    });
  });

  after(async () => {
    const cloudantClient = CloudantHelperLib.getInstance({ dbPartitionKey, connection });
    await cloudantClient.deleteDB(db);
  });
});
