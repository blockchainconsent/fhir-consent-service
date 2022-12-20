/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

exports.REQUEST_HEADERS = {
  TEST_MODE: 'x-cm-testmode',
  TENANT_ID: 'x-cm-tenantid',
  PATIENT_ID: 'x-cm-patientid',
  INTROSPECT_AUTH: 'x-introspect-basic-authorization-header',
};

exports.QUERY_PARAMS = {
  PAGE_SIZE: 500,
  TENANT_ID: '4102',
  CHANGE_ID_MARKER: 'changeIdMarker',
};

exports.HTTP_METHOD = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  DELETE: 'delete',
};

exports.CLOUDANT_VIEW = {
  FHIR_CONSENT_ID: 'fhir-consent-id-view',
};

exports.CONSENT_FIELDS = {
  PATIENT_ID: {
    VALUE: 'PatientID',
    REQUIRED: true,
  },
  SERVICE_ID: {
    VALUE: 'ServiceID',
    REQUIRED: false,
  },
  TENANT_ID: {
    VALUE: 'TenantID',
    REQUIRED: true,
  },
  DATATYPEIDS: {
    VALUE: 'DatatypeIDs',
    REQUIRED: true,
  },
  CONSENT_OPTION: {
    VALUE: 'ConsentOption',
    REQUIRED: false,
  },
  FHIR_POLICY: {
    VALUE: 'FHIRPolicy',
    REQUIRED: false,
  },
  FHIR_STATUS: {
    VALUE: 'FHIRStatus',
    REQUIRED: false,
  },
  FHIR_PROVISION_TYPE: {
    VALUE: 'FHIRProvisionType',
    REQUIRED: false,
  },
  FHIR_PROVISION_ACTION: {
    VALUE: 'FHIRProvisionAction',
    REQUIRED: false,
  },
  EXPIRATION: {
    VALUE: 'Expiration',
    REQUIRED: false,
  },
  CREATION: {
    VALUE: 'Creation',
    REQUIRED: false,
  },
  FHIRRESOURCEID: {
    VALUE: 'FHIRResourceID',
    REQUIRED: false,
  },
  FHIRRESOURCEVERSION: {
    VALUE: 'FHIRResourceVersion',
    REQUIRED: false,
  },
  FHIRPERFORMERIDSYSTEM: {
    VALUE: 'FHIRPerformerIDSystem',
    REQUIRED: false,
  },
  FHIRPERFORMERIDVALUE: {
    VALUE: 'FHIRPerformerIDValue',
    REQUIRED: false,
  }, 
  FHIRPERFORMERDISPLAY: {
    VALUE: 'FHIRPerformerDisplay',
    REQUIRED: false,
  },
  FHIRRECIPIENTIDSYSTEM: {
    VALUE: 'FHIRRecipientIDSystem',
    REQUIRED: false,
  },
  FHIRRECIPIENTIDVALUE: {
    VALUE: 'FHIRRecipientIDValue',
    REQUIRED: false,
  },
  FHIRRECIPIENTDISPLAY: {
    VALUE: 'FHIRRecipientDisplay',
    REQUIRED: false,
  },
};

exports.FHIR_KEY_PREFIX = 'fhir-connection';

exports.FHIR_CLIENT_CONFIG = {
  GRANT_TYPE: 'client_credentials',
  SCOPE_READ: 'fhir-read-all',
  CLIENT_ID_READ: 'sample-read-client',
  SCOPE_WRITE: 'fhir-write-all',
  CLIENT_ID_WRITE: 'sample-write-client',
};

exports.MAPPING_TYPE = {
  PERFORMER: 'performer',
  IRCP: 'IRCP'
}
