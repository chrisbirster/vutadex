import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intervalPreviews,localDayStart,validTimezone,pickReadyIndex} from '../server/study-policy.ts';
test('account midnight follows DST transitions',()=>{
  assert.equal(new Date(localDayStart(Date.parse('2026-03-08T09:00:00Z'),'America/New_York')).toISOString(),'2026-03-08T05:00:00.000Z');
  assert.equal(new Date(localDayStart(Date.parse('2026-03-09T10:00:00Z'),'America/New_York')).toISOString(),'2026-03-09T04:00:00.000Z');
  assert.equal(new Date(localDayStart(Date.parse('2026-11-02T11:00:00Z'),'America/New_York')).toISOString(),'2026-11-02T05:00:00.000Z');
  assert.equal(validTimezone('Mars/Space'),false);
});
test('interval previews have one minute retry and future intervals',()=>{
  const previews=intervalPreviews(null,null,Date.parse('2026-10-30T12:00:00Z'));
  assert.equal(previews.length,4);
  assert.equal(previews[0]!.intervalMs,60000);
  assert.ok(previews.slice(1).every(x=>x.intervalMs>=60000));
});
test('ready retries do not block other ready cards',()=>{
  const due=new Map([['a',100],['b',500]]);
  assert.equal(pickReadyIndex(['b','a'],0,due,200),1);
  assert.equal(pickReadyIndex(['b'],0,due,200),-1);
});
