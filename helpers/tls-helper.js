/*
 *
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const { constants } = require('crypto');
const fs = require('fs');
const https = require('https');

const agentTrustSelfSigned = new https.Agent({
  rejectUnauthorized: false,
});

const validateSSLFiles = (serverKey, serverCert) => fs.existsSync(serverKey) && fs.existsSync(serverCert);

const getCapCiphers = () => [
  'ECDHE-RSA-AES128-GCM-SHA256', // TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  'ECDHE-RSA-AES256-GCM-SHA384', // TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  'ECDHE-RSA-AES128-SHA256', // TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256
  'ECDHE-RSA-AES256-SHA384', // TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384
  'AES256-GCM-SHA384', // TLS_RSA_WITH_AES_256_GCM_SHA384
  'AES256-SHA256', // TLS_RSA_WITH_AES_256_CBC_SHA256
  'AES128-GCM-SHA256', // TLS_RSA_WITH_AES_128_GCM_SHA256
  'AES128-SHA256', // TLS_RSA_WITH_AES_128_CBC_SHA256
];
const getCiphersForServerOptions = () => {
  const capCiphers = getCapCiphers();
  return `${capCiphers.join(':')}:!MD5:!aNULL`;
};
const getSecureOptions = () => (
  // eslint-disable-next-line no-bitwise
  constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3 | constants.SSL_OP_NO_TLSv1 | constants.SSL_OP_NO_TLSv1
);

const getAgentHeaderForSelfSignedCerts = () => agentTrustSelfSigned;

module.exports = {
  validateSSLFiles,
  getCapCiphers,
  getCiphersForServerOptions,
  getSecureOptions,
  getAgentHeaderForSelfSignedCerts,
};
