import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matureRetention,type RatedEvent} from '../server/retention.ts';
const time=Date.parse('2026-10-30T12:00:00Z');
const e=(changes:Partial<RatedEvent>={}):RatedEvent=>({
  rating:3,created_at:time,undone_at:null,review_count_before:2,
  due_at_before:time-60_000,last_review_at_before:time-5*86400000,deck:'Philosophy',...changes
});
test('observed retention counts only mature due reviews and excludes undone/learning/Again retries',()=>{
  const events=[e(),e({rating:1}),e({review_count_before:0}),e({last_review_at_before:time-60_000}),
    e({due_at_before:time+86400000}),e({undone_at:time+10}),e({rating:4,deck:'TypeScript'})];
  const report=matureRetention(events);
  assert.equal(report.eligible,3);assert.equal(report.recalled,2);
  assert.equal(report.observedPercent,66.7);
  assert.equal(report.byDeck.find(x=>x.deck==='Philosophy')?.observedPercent,50);
});
test('unknown historical provenance yields no invented percentage',()=>{
  const result=matureRetention([e({review_count_before:null})]);
  assert.equal(result.eligible,0);assert.equal(result.observedPercent,null);
});
