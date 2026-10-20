import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck, deleteDeck } from '../services/decks.ts';
import { createCard } from '../services/cards.ts';
import { createNote, retireNote } from '../services/notes.ts';
import { reviewCard, undoReview } from '../services/reviews.ts';
import { getStudyProgress } from '../services/progress.ts';

const NOW = new Date('2026-10-19T12:00:00.000Z');

function fixture(run: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    run(db);
  } finally { db.close(); }
}

test('empty database returns a read-only zero summary and UTC forecast', () => {
  fixture(db => {
    const before = (db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
    const stats = getStudyProgress(db, undefined, NOW);
    assert.equal(stats.asOf, NOW.toISOString());
    assert.equal(stats.timezone, 'UTC');
    assert.equal(stats.deckId, null);
    assert.deepEqual([stats.totalCards,stats.newCards,stats.reviewedCards,stats.dueNow,stats.overdueBeforeToday,stats.reviewsLast7Days,stats.completedSessions],[0,0,0,0,0,0,0]);
    assert.deepEqual(stats.ratingsLast7Days, {again:0,hard:0,good:0,easy:0});
    assert.deepEqual(stats.forecast.map(d => d.date), [
      '2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25'
    ]);
    assert.ok(stats.forecast.every(day => day.scheduled === 0));
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version, before);
  });
});

test('per-deck and global forecasts exclude retired generated cards, undone ratings and unscheduled new cards', () => {
  fixture(db => {
    const first = createDeck(db, 'First');
    const second = createDeck(db, 'Second');
    const newA = createCard(db,first.id,'New','New');
    const reviewed = [
      ['Overdue','2026-10-18T23:59:59.000Z',3,'2026-10-17T08:00:00.000Z'],
      ['Today','2026-10-19T23:59:59.000Z',2,'2026-10-18T08:00:00.000Z'],
      ['Tomorrow','2026-10-20T00:00:00.000Z',4,'2026-10-16T08:00:00.000Z'],
      ['Day six','2026-10-25T12:00:00.000Z',1,'2026-10-18T09:00:00.000Z'],
      ['Outside','2026-10-26T12:00:00.000Z',3,'2026-09-01T09:00:00.000Z']
    ] as const;
    for (const [front, dueAt, rating, when] of reviewed) {
      const card = createCard(db,first.id,front,'Answer');
      reviewCard(db,card.id,rating,new Date(when));
      db.prepare('UPDATE card_schedules SET due_at=? WHERE card_id=?').run(dueAt,card.id);
    }
    const reverted = createCard(db,first.id,'Undone','Answer');
    reviewCard(db,reverted.id,3,new Date('2026-10-17T09:00:00Z'));
    undoReview(db,reverted.id,new Date('2026-10-18T09:00:00Z'));

    const newB = createCard(db,second.id,'Another new','Answer');
    const dueB = createCard(db,second.id,'Second due','Answer');
    reviewCard(db,dueB.id,3,new Date('2026-10-18T00:00:00Z'));
    db.prepare('UPDATE card_schedules SET due_at=? WHERE card_id=?').run('2026-10-19T08:00:00.000Z',dueB.id);

    const retired = createNote(db,first.id,'basic',['Retired front','Answer']);
    reviewCard(db,retired.cardIds[0]!,3,new Date('2026-10-18T00:00:00Z'));
    retireNote(db,retired.note.id);

    db.prepare("INSERT INTO study_sessions(deck_id,mode,new_limit,review_limit,status,created_at,updated_at) VALUES(?,'due',10,10,'completed',?,?)")
      .run(first.id,NOW.toISOString(),NOW.toISOString());
    db.prepare("INSERT INTO study_sessions(deck_id,mode,new_limit,review_limit,status,created_at,updated_at) VALUES(NULL,'due',10,10,'completed',?,?)")
      .run(NOW.toISOString(),NOW.toISOString());

    const a = getStudyProgress(db,first.id,NOW);
    assert.equal(a.deckId,first.id);
    assert.deepEqual([a.totalCards,a.newCards,a.reviewedCards,a.dueNow,a.overdueBeforeToday,a.reviewsLast7Days,a.completedSessions],
      [7,2,5,1,1,4,1]);
    assert.deepEqual(a.ratingsLast7Days,{again:1,hard:1,good:1,easy:1});
    assert.deepEqual(a.forecast.map(d => d.scheduled), [1,1,0,0,0,0,1]);
    assert.equal(a.forecast[0]?.date,'2026-10-19');

    const b = getStudyProgress(db,second.id,NOW,2);
    assert.deepEqual([b.totalCards,b.newCards,b.reviewedCards,b.dueNow,b.overdueBeforeToday,b.reviewsLast7Days,b.completedSessions],
      [2,1,1,1,0,1,0]);
    assert.deepEqual(b.forecast.map(d => d.scheduled),[1,0]);

    const global = getStudyProgress(db,undefined,NOW);
    assert.deepEqual([global.totalCards,global.newCards,global.reviewedCards,global.dueNow,global.reviewsLast7Days,global.completedSessions],
      [9,3,6,2,5,2]);
    assert.deepEqual(global.forecast.map(d => d.scheduled),[2,1,0,0,0,0,1]);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.ok(newA.id > 0 && newB.id > 0);
  });
});

test('invalid dates, forecast lengths and missing decks fail without modifying the database', () => {
  fixture(db => {
    const first = createDeck(db,'Remaining');
    for(const days of [0,-1,91,1.2,Infinity,NaN]) {
      assert.throws(() => getStudyProgress(db,undefined,NOW,days),/Forecast days/);
    }
    assert.throws(() => getStudyProgress(db,undefined,new Date('invalid')),/Invalid progress date/);
    assert.throws(() => getStudyProgress(db,999,NOW),/not found/);
    assert.equal(getStudyProgress(db,first.id,NOW,1).forecast.length,1);
    deleteDeck(db,first.id);
    assert.throws(() => getStudyProgress(db,first.id,NOW),/not found/);
  });
});

test('UTC day boundaries include today midnight and exclude yesterday while respecting exact due instant', () => {
  fixture(db => {
    const deck = createDeck(db,'Boundaries');
    const a = createCard(db,deck.id,'At midnight','Back');
    const b = createCard(db,deck.id,'Before midnight','Back');
    reviewCard(db,a.id,3,new Date('2026-10-18T00:00:00Z'));
    reviewCard(db,b.id,3,new Date('2026-10-18T00:00:00Z'));
    db.prepare('UPDATE card_schedules SET due_at=? WHERE card_id=?').run('2026-10-19T00:00:00.000Z',a.id);
    db.prepare('UPDATE card_schedules SET due_at=? WHERE card_id=?').run('2026-10-18T23:59:59.999Z',b.id);
    const stats = getStudyProgress(db,deck.id,new Date('2026-10-19T00:00:00.000Z'),1);
    assert.equal(stats.dueNow,2);
    assert.equal(stats.overdueBeforeToday,1);
    assert.equal(stats.forecast[0]?.scheduled,1);
  });
});
