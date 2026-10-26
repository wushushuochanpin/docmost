import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const oidc = await import(pathToFileURL(require.resolve('openid-client')).href);
const { IdentityProvider } = require('../../../dist/core/identity/identity.provider.js');
const issuer = 'https://oidc.synthetic.test';
const clientId = 'docmost';
const callback = 'https://docmost.synthetic.test/api/identity/callback';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-signing-key', alg: 'RS256', use: 'sig' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (claims, key = privateKey) => {
  const message = `${encode({alg:'RS256',kid:'test-signing-key',typ:'JWT'})}.${encode(claims)}`;
  return `${message}.${sign('RSA-SHA256',Buffer.from(message),key).toString('base64url')}`;
};

async function exercise(change = {}, key = privateKey, maxAge) {
  const claims = {iss:issuer,sub:'person',aud:clientId,nonce:'expected-nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,...change};
  const configuration = new oidc.Configuration({issuer,token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',id_token_signing_alg_values_supported:['RS256']},clientId,'secret',oidc.ClientSecretPost('secret'));
  oidc.enableNonRepudiationChecks(configuration);
  configuration[oidc.customFetch] = async (url, init) => {
    if (String(url) === issuer+'/jwks') return Response.json({keys:[jwk]});
    assert.equal(String(url),issuer+'/token');
    assert.equal(init.method,'POST');
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('code_verifier'),'expected-verifier');
    assert.equal(body.get('redirect_uri'),callback);
    return Response.json({access_token:'synthetic-access-token',token_type:'Bearer',expires_in:60,id_token:jwt(claims,key)});
  };
  const provider = new IdentityProvider({get:() => ({issuer,clientId,clientSecret:'secret',callback,encryptionKey:Buffer.alloc(32,1),surface:'web'})});
  provider.provider = async () => ({oidc,config:configuration});
  return provider.exchange(new URL(callback+'?code=synthetic-code&state=expected-state'),'expected-state','expected-nonce','expected-verifier',maxAge);
}

test('real openid-client verifies a correctly signed ID token', async () => {
  const result = await exercise(); assert.equal(result.subject,'person');
});
for (const [name, claims] of [['nonce',{nonce:'wrong'}],['audience',{aud:'other-client'}],['issuer',{iss:'https://other.test'}],['expiry',{exp:1}]]) {
  test(`real openid-client rejects wrong ${name}`, async () => {
    await assert.rejects(exercise(claims), /identity_invalid/);
  });
}
test('real openid-client rejects a forged signature with the same key id', async () => {
  await assert.rejects(exercise({},wrongKey), /identity_invalid/);
});

test('compiled CommonJS provider loads the ESM OIDC library and validates discovery', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(String(url),issuer+'/.well-known/openid-configuration');
      return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks'});
    };
    const provider = new IdentityProvider({get:() => ({issuer,clientId,clientSecret:'secret',callback,encryptionKey:Buffer.alloc(32,1),surface:'web'})});
    const result = await provider.provider();
    assert.equal(result.config.serverMetadata().issuer,issuer);
  } finally { globalThis.fetch = originalFetch; }
});

for (const [name,claims] of [['missing',{}],['stale',{auth_time:Math.floor(Date.now()/1000)-3600}]]) {
  test(`link requires fresh auth_time: rejects ${name} authentication evidence`, async () => {
    await assert.rejects(exercise(claims,privateKey,0), /identity_invalid/);
  });
}
test('link accepts a fresh signed auth_time with max_age zero', async () => {
  const result = await exercise({auth_time:Math.floor(Date.now()/1000)},privateKey,0);
  assert.equal(result.subject,'person');
});
