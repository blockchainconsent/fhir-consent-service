/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const chai = require('chai');

const { expect } = chai;
chai.use(require('chai-like'));
chai.use(require('chai-things'));
const { ENUM_CONSENT_POLICY, CONSENT_FIELDS } = require('../../helpers/constants');
const transformFhirHelper = require('../../helpers/transform-fhir-helper');

// Example JSON for the FHIR consent resource: https://www.hl7.org/fhir/consent-examples.html
const fhirConsent = require('../test-fhir-consent-example.json');

const testTenantID = 'test-tenantID1';

describe('transform-fhir-consent', () => {
  it('transformConsent should return consent', (done) => {
    const result = transformFhirHelper.mapObjectStructure(fhirConsent, false, {
      [CONSENT_FIELDS.TENANT_ID.VALUE]: testTenantID,
    });
    const FHIRResourceID = fhirConsent.id;
    expect(result[CONSENT_FIELDS.TENANT_ID.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.TENANT_ID.VALUE]).to.be.equal(testTenantID);
    expect(result[CONSENT_FIELDS.PATIENT_ID.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.PATIENT_ID.VALUE]).to.equal('patient-001');
    // eslint-disable-next-line no-unused-expressions
    expect(result[CONSENT_FIELDS.DATATYPEIDS.VALUE]).to.not.be.empty;
    expect(JSON.parse(result[CONSENT_FIELDS.DATATYPEIDS.VALUE][0])).to.have.own.property('system');
    expect(JSON.parse(result[CONSENT_FIELDS.DATATYPEIDS.VALUE][0])).to.have.own.property('code');
    expect(result[CONSENT_FIELDS.DATATYPEIDS.VALUE][0]).to.include('patient-privacy');
    expect(result[CONSENT_FIELDS.CONSENT_OPTION.VALUE]).to.be.an('array');
    expect(result[CONSENT_FIELDS.CONSENT_OPTION.VALUE]).to.have.lengthOf(0);
    expect(result[CONSENT_FIELDS.FHIR_POLICY.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIR_POLICY.VALUE]).to.equal("http://hl7.org/fhir/us/davinci-hrex/StructureDefinition-hrex-consent.html#regular");
    expect(result[CONSENT_FIELDS.EXPIRATION.VALUE]).to.equal(Date.parse('2022-01-31'));
    expect(result[CONSENT_FIELDS.FHIRRESOURCEID.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRRESOURCEID.VALUE]).to.equal(FHIRResourceID);
    expect(result[CONSENT_FIELDS.FHIRRESOURCEVERSION.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRRESOURCEVERSION.VALUE]).to.equal('2');
    expect(result[CONSENT_FIELDS.FHIRPERFORMERIDSYSTEM.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRPERFORMERIDSYSTEM.VALUE]).to.equal('http://hl7.org/fhir/sid/us-npi');
    expect(result[CONSENT_FIELDS.FHIRPERFORMERIDVALUE.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRPERFORMERIDVALUE.VALUE]).to.equal('9876543210');
    expect(result[CONSENT_FIELDS.FHIRPERFORMERDISPLAY.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRPERFORMERDISPLAY.VALUE]).to.equal('Old Payer');
    expect(result[CONSENT_FIELDS.FHIRRECIPIENTIDSYSTEM.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRRECIPIENTIDSYSTEM.VALUE]).to.equal('http://hl7.org/fhir/sid/us-npi');
    expect(result[CONSENT_FIELDS.FHIRRECIPIENTIDVALUE.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRRECIPIENTIDVALUE.VALUE]).to.equal('0123456789');
    expect(result[CONSENT_FIELDS.FHIRRECIPIENTDISPLAY.VALUE]).to.be.a('string');
    expect(result[CONSENT_FIELDS.FHIRRECIPIENTDISPLAY.VALUE]).to.equal('New Payer');
    done();
  });
});
