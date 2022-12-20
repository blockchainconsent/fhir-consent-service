/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const { transform } = require('node-json-transform');

const mappingFhirConsent = require('../config/fhir-consent-mapping.json');
const logger = require('./logger').getLogger('transfer-fhir-helper');

const {
  ENUM_CONSENT_OPTION,
  CONSENT_STATUS,
  CONSENT_PROVISION_TYPE,
  CONSENT_FIELDS,
  MAPPING_TYPE
} = require('./constants');

// parse ID
const parseId = (id) => (id && id.includes('/') ? id.split('/')[1] : id);

// mapping helper for an array
const mapArray = (data) => (Array.isArray(data)
  ? data.map((item) => (typeof val && Object.keys(item).length
    ? JSON.stringify(item) : item)) : data);

/* eslint-disable no-nested-ternary */
// helper to getting field Consent Option
const getConsentOption = (fields, isFhirConsentResourceDeleted) => {
  if (isFhirConsentResourceDeleted) return [ENUM_CONSENT_OPTION.DENY];

  const [status, provision] = fields;
  const option = status === CONSENT_STATUS.ACTIVE && provision.type === CONSENT_PROVISION_TYPE.PERMIT
    ? ENUM_CONSENT_OPTION.READ
    : status === CONSENT_STATUS.ACTIVE && provision.type === CONSENT_PROVISION_TYPE.DENY
      ? ENUM_CONSENT_OPTION.DENY
      : status === CONSENT_STATUS.REJECTED
      || status === CONSENT_STATUS.INACTIVE
      || status === CONSENT_STATUS.ENTERED_IN_ERROR
        ? ENUM_CONSENT_OPTION.DENY
        : '';
  return option ? [option] : [];
};

//Helper to get performer details based on type
const getActorDetails = (fields, actorType, type) => {
  const {actor} = fields;
  let actorFlag = false;
  let result = false;
  const mappingType = actorType === 'performer' ? MAPPING_TYPE.PERFORMER : MAPPING_TYPE.IRCP;
  try {
    actor.forEach(x => {
      if(x.role && Array.isArray(x.role.coding)) {
        x.role.coding.forEach(y => {
          if(y.code === mappingType && actorFlag === false) {
            actorFlag = true;
            return false;
          }else {
            actorFlag = false;
          }
        })
        if(actorFlag && x.reference ) {
          if((type === 'FHIRPerformerIDSystem' || type === 'FHIRRecipientIDSystem')
            && x.reference.identifier && x.reference.identifier.system) {
            result =  x.reference.identifier.system;
            return false;
          }
          if((type === 'FHIRPerformerIDValue' || type === 'FHIRRecipientIDValue')
            && x.reference.identifier && x.reference.identifier.value) {
            result =  x.reference.identifier.value;
            return false;
          }
          if((type === 'FHIRPerformerDisplay' || type === 'FHIRRecipientDisplay') && x.reference.display) {
            result =  x.reference.display;
            return false;
          }
        }
      }
    });
  } catch (err) {
    logger.error(`${err}`);
    throw err
  }
  return result;
}

const getFHIRPolicyURI = (fields) => {
  return Array.isArray(fields) && fields[0] && fields[0].uri ? fields[0].uri : '';
}

// transform the object structure
exports.mapObjectStructure = (fhirConsent, isFhirConsentResourceDeleted, extra) => {
  const map = {
    item: mappingFhirConsent,
    operate: [
      {
        run: 'Date.parse',
        on: CONSENT_FIELDS.EXPIRATION.VALUE,
      },
      {
        run: (val) => parseId(val),
        on: CONSENT_FIELDS.PATIENT_ID.VALUE,
      },
      {
        run: (val) => mapArray(val),
        on: CONSENT_FIELDS.DATATYPEIDS.VALUE,
      },
      {
        run: (val) => getConsentOption(val, isFhirConsentResourceDeleted),
        on: CONSENT_FIELDS.CONSENT_OPTION.VALUE,
      },
      {
        run: (val) => (Number.isNaN(val) ? 0 : val),
        on: CONSENT_FIELDS.EXPIRATION.VALUE,
      },
      {
        run: (val) => getFHIRPolicyURI(val),
        on: CONSENT_FIELDS.FHIR_POLICY.VALUE,
      },
      {
        run: 'Date.parse',
        on: CONSENT_FIELDS.CREATION.VALUE,
      },
      {
        run: (val) => val,
        on: CONSENT_FIELDS.FHIRRESOURCEID.VALUE,
      },
      {
        run: (val) => val || '1',
        on: CONSENT_FIELDS.FHIRRESOURCEVERSION.VALUE,
      },
      {
        run: (val) => getActorDetails(val, 'performer', 'FHIRPerformerIDSystem'),
        on: CONSENT_FIELDS.FHIRPERFORMERIDSYSTEM.VALUE,
      },
      {
        run: (val) => getActorDetails(val, 'performer', 'FHIRPerformerIDValue'),
        on: CONSENT_FIELDS.FHIRPERFORMERIDVALUE.VALUE,
      },
      {
        run: (val) => getActorDetails(val, 'performer', 'FHIRPerformerDisplay'),
        on: CONSENT_FIELDS.FHIRPERFORMERDISPLAY.VALUE,
      },
      {
        run: (val) => getActorDetails(val, 'recipient', 'FHIRRecipientIDSystem'),
        on: CONSENT_FIELDS.FHIRRECIPIENTIDSYSTEM.VALUE,
      },
      {
        run: (val) => getActorDetails(val, 'recipient', 'FHIRRecipientIDValue'),
        on: CONSENT_FIELDS.FHIRRECIPIENTIDVALUE.VALUE,
      },
      {
        run: (val) => getActorDetails(val, 'recipient', 'FHIRRecipientDisplay'),
        on: CONSENT_FIELDS.FHIRRECIPIENTDISPLAY.VALUE,
      },
    ]
  };

  return {
    ...transform(fhirConsent, map),
    ...extra,
  };
};
