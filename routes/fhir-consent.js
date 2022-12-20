/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const express = require('express');
const fhirConsentController = require('../controllers/fhir-consent');
const { tenantIDSchema, validate } = require('../middleware/validator');

const requestLogger = require('../middleware/request-logger');

const router = express.Router();

// Get poll from FHIR consent history
router.get(
  '/poll-fhir-consent-history',
  requestLogger,
  validate(tenantIDSchema, 'headers'),
  fhirConsentController.pollFhirConsentHistory,
);
// Register the FHIR consents
router.post(
  '/register-fhir-consents',
  requestLogger,
  validate(tenantIDSchema, 'headers'),
  fhirConsentController.registerFhirConsents,
);
// Process the FHIR consents
router.post(
  '/process-fhir-consents',
  requestLogger,
  validate(tenantIDSchema, 'headers'),
  fhirConsentController.processFhirConsents,
);

module.exports = router;
