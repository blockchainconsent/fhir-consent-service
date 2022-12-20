/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const Joi = require('joi');
const { REQUEST_HEADERS } = require('../helpers/constants');
const logger = require('../helpers/logger').getLogger('validator');

// the validation schema for TenantID
const tenantIDSchema = Joi.object().keys({
  [REQUEST_HEADERS.TENANT_ID]: Joi.string().min(1).required()
    .messages({
      'string.base': `${REQUEST_HEADERS.TENANT_ID} should be a string'`,
      'string.empty': `${REQUEST_HEADERS.TENANT_ID} cannot be an empty field`,
      'any.required': `${REQUEST_HEADERS.TENANT_ID} is a required field`,
    }),
}).unknown(true);

// middleware for checking the validation schema
// error handler for the bad requests
const validate = (schema, property) => (req, res, next) => {
  const { error } = schema.validate(req[property]);
  if (!error) {
    return next();
  }
  const { details } = error;
  const message = details.map((i) => i.message).join(',');
  logger.error(message);
  return res.status(400).json({
    status: 400,
    message,
  });
};

module.exports = {
  validate,
  tenantIDSchema,
};
