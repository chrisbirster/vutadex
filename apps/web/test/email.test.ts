import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailConfig,signedSesRequest} from '../server/email.ts';

test('SES request is signed without putting secrets in email content or query URL',()=>{
  const config={region:'us-east-1',from:'noreply@example.com',accessKeyId:'AKIDEXAMPLE',secretAccessKey:'secret-example'};
  const result=signedSesRequest(config,'member@example.com','https://vutadex.example/auth/verify#token=once',new Date('2026-10-30T12:30:00.000Z'));
  assert.equal(result.url,'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails');
  assert.match(result.headers.authorization,/AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261030\/us-east-1\/ses\/aws4_request/);
  assert.match(result.body,/#token=once/);
  assert.ok(!result.body.includes(config.secretAccessKey));
  assert.ok(!result.url.includes('token='));
  assert.equal(result.headers['x-amz-date'],'20261030T123000Z');
});
test('production sender requires a valid SES configuration',()=>{
  assert.throws(()=>mailConfig({AWS_REGION:'wat',SES_FROM_EMAIL:'oops'}));
  assert.equal(mailConfig({AWS_REGION:'us-east-1',SES_FROM_EMAIL:'noreply@example.com',AWS_ACCESS_KEY_ID:'a',AWS_SECRET_ACCESS_KEY:'b'}).region,'us-east-1');
});
