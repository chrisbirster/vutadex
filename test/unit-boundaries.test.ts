import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initialMemoryState, nextIntervalDays, nextMemoryState, retrievability,
  fastRetrievability } from '../fsrs/algorithm.ts';
import type { Rating } from '../fsrs/algorithm.ts';
import { DEFAULT_PARAMETERS, validateParameters } from '../fsrs/parameters.ts';
import { migrate } from '../database/migrate.ts';
import { createDeck, renameDeck, describeDeck } from '../services/decks.ts';
import { createCard, getCard, editCard, deleteCard } from '../services/cards.ts';
import { parseCardId } from '../commands/card/utils.ts';
import { createNote, getNote, updateNote, retireNote, generatedCards, noteForCard } from '../services/notes.ts';
import { parseNoteType, parseChoices, parseSelection, parseMasks, parseClozes, generateCards,
  NoteError } from '../services/note-types.ts';
import { interactionForCard, evaluateAnswer, needsAnswerInput, answerPrompt } from '../services/study-interactions.ts';
import { reviewCard, undoReview, getSchedule, reviewHistory } from '../services/reviews.ts';
import { openStudySession, rateStudyCard, skipStudyCard, undoLastStudyReview,
  sessionSummary, finishStudySession } from '../services/study.ts';

function withDatabase(fn: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrate(db);
    fn(db);
  } finally { db.close(); }
}

test('FSRS validation rejects malformed states, elapsed times, ratings and weights', () => {
  const state = initialMemoryState(3);
  assert.throws(() => initialMemoryState(0 as Rating), /Rating/);
  assert.throws(() => nextMemoryState(null, -1, 3), /Elapsed/);
  assert.throws(() => nextMemoryState(state, 0, 8 as Rating), /Rating/);
  assert.throws(() => nextMemoryState({ ...state, stability: Infinity }, 1, 3), /finite/);
  assert.throws(() => retrievability({ ...state, difficulty: NaN }, 1), /finite/);
  assert.throws(() => retrievability(state, -1), /Elapsed/);
  assert.throws(() => fastRetrievability(NaN, 0), /Invalid/);
  assert.throws(() => fastRetrievability(1, Infinity), /Elapsed/);
  for (const target of [-1, 0, 1.1, NaN]) {
    assert.throws(() => nextIntervalDays(state, target), /retention/);
  }
  const bad = [...DEFAULT_PARAMETERS];
  bad[0] = -1;
  assert.throws(() => validateParameters(bad), /parameter 0/);
  const reordered = [...DEFAULT_PARAMETERS];
  reordered[0] = 3;
  reordered[1] = 1;
  assert.throws(() => validateParameters(reordered), /ordering/);
  const reorderedRetention = [...DEFAULT_PARAMETERS];
  reorderedRetention[25] = 0.85;
  reorderedRetention[26] = 0.5;
  assert.throws(() => validateParameters(reorderedRetention), /ordering/);
  assert.throws(() => validateParameters([]), /34/);
});

test('note-type aliases and invalid names are validated', () => {
  for (const [alias, expected] of [
    ['basic-reverse','reverse'], ['type','type-answer'], ['mcq','multiple-choice'],
    ['multi-select','multiple-select'], ['order','ordering'], ['occlusion','image-occlusion']
  ]) assert.equal(parseNoteType(alias!), expected);
  assert.throws(() => parseNoteType('unrecognized'), /Unsupported/);
  assert.throws(() => generateCards(0, 'basic', ['a', 'b']), /note ID/);
  assert.throws(() => generateCards(1, 'basic', ['only one']), /requires fields/);
  assert.throws(() => generateCards(1, 'basic', [' ', 'back']), /Front/);
  assert.throws(() => generateCards(1, 'reverse', ['a', ' ']), /Back/);
});

test('choice and selection parsers reject bad JSON, invalid IDs and duplicate entries', () => {
  const json = JSON.stringify([{id:'a',text:'Alpha'}, {id:'b',text:'Beta'}]);
  const choices = parseChoices(json);
  assert.deepEqual(parseSelection('["b","a"]', choices), ['b','a']);
  assert.throws(() => parseChoices('garbage'), /valid JSON/);
  assert.throws(() => parseChoices('{}'), /2–100/);
  assert.throws(() => parseChoices('[]'), /2–100/);
  assert.throws(() => parseChoices(JSON.stringify([{id:'a',text:'x',other:1},{id:'b',text:'y'}])), /only id and text/);
  assert.throws(() => parseChoices(JSON.stringify([{id:'a',text:'x'},{id:'a',text:'y'}])), /Duplicate/);
  assert.throws(() => parseChoices(JSON.stringify([{id:'',text:'x'},{id:'b',text:'y'}])), /Choice ID/);
  assert.throws(() => parseSelection('{}', choices), /nonempty/);
  assert.throws(() => parseSelection('[]', choices), /nonempty/);
  assert.throws(() => parseSelection('["unknown"]', choices), /present/);
  assert.throws(() => parseSelection('["a","a"]', choices), /unique/);
  assert.throws(() => parseSelection('[1]', choices), /nonempty/);
  assert.throws(() => generateCards(1,'multiple-choice',['What?',json,'z','']), /Correct ID/);
});

test('occlusion validation checks structure, geometry, IDs and references', () => {
  const image = 'deez-media://sha256:' + 'a'.repeat(64);
  const mask = {id:1,x:0.1,y:0.2,width:0.3,height:0.4,answer:'Eye',prompt:'Identify'};
  assert.equal(parseMasks(JSON.stringify([mask]))[0]?.id, 1);
  assert.throws(() => parseMasks('{}'), /1–100/);
  assert.throws(() => parseMasks('[]'), /1–100/);
  assert.throws(() => parseMasks(JSON.stringify([mask,mask])), /unique/);
  assert.throws(() => parseMasks(JSON.stringify([{...mask,x:-1}])), /rectangle/);
  assert.throws(() => parseMasks(JSON.stringify([{...mask,width:0}])), /rectangle/);
  assert.throws(() => parseMasks(JSON.stringify([{...mask,x:'abc'}])), /coordinate/);
  assert.throws(() => parseMasks(JSON.stringify([{...mask,id:0}])), /IDs/);
  assert.throws(() => parseMasks(JSON.stringify([{...mask,answer:''}])), /Mask answer/);
  assert.throws(() => parseMasks(JSON.stringify([{...mask,surprise:true}])), /Invalid mask/);
  assert.throws(() => generateCards(1,'image-occlusion',['https://example.test/image',JSON.stringify([mask]),'']), /deez-media/);
  const drafts = generateCards(1,'image-occlusion',[image,JSON.stringify([mask]),'Extra']);
  assert.equal(drafts.length,1);
  assert.match(drafts[0]!.front, /Identify/);
  assert.match(drafts[0]!.back, /Extra/);
});

test('cloze parser enforces markers and generates one card per distinct ordinal', () => {
  const parsed = parseClozes('{{c1::Paris::city}} is in {{c2::France}}; also {{c1::Lyon}}');
  assert.deepEqual(parsed.map(x=>x.ordinal),[1,2,1]);
  const drafts = generateCards(5,'cloze',['{{c1::Paris::city}} is in {{c2::France}}','']);
  assert.deepEqual(drafts.map(x=>x.key), ['note:5:cloze:1','note:5:cloze:2']);
  assert.match(drafts[0]!.front, /\[city\]/);
  assert.match(drafts[1]!.front, /Paris/);
  assert.throws(() => parseClozes('{{c0::bad}}'), /valid/);
  assert.throws(() => parseClozes('{{c1::}}'), /Cloze text/);
  assert.throws(() => parseClozes('{{c100001::x}}'), /range/);
  assert.throws(() => parseClozes('bad {{c1::x}} and {{c2}}'), /valid/);
});

test('notes validate tags, unknown decks, retired note access and stable generated card mapping', () => {
  withDatabase(db => {
    const deck = createDeck(db,'Geography');
    assert.throws(() => createNote(db,999,'basic',['a','b']),/not found/);
    assert.throws(() => createNote(db,deck.id,'basic',['a','b'],['x'.repeat(101)]), /tags/);
    assert.throws(() => createNote(db,deck.id,'bad' as 'basic',['a','b']),/Invalid note type/);
    assert.throws(() => getNote(db,999),/not found/);
    const value = createNote(db,deck.id,'basic',['Question','Answer'],['geo']);
    assert.deepEqual(getNote(db,value.note.id).tags,['geo']);
    assert.equal(noteForCard(db,value.cardIds[0]!)?.generationKey,'note:'+value.note.id+':template:0');
    const manual = createCard(db,deck.id,'Q','A');
    assert.equal(noteForCard(db,manual.id),null);
    assert.throws(() => editCard(db,value.cardIds[0]!,'wrong'),/Generated/);
    assert.throws(() => deleteCard(db,value.cardIds[0]!),/Generated/);
    assert.throws(() => updateNote(db,999,['a','b']),/not found/);
    const before = generatedCards(db,value.note.id);
    assert.deepEqual(updateNote(db,value.note.id,['New','Answer']).cardIds,value.cardIds);
    assert.deepEqual(generatedCards(db,value.note.id),before);
    retireNote(db,value.note.id);
    assert.equal(noteForCard(db,value.cardIds[0]!),null);
    assert.throws(() => retireNote(db,value.note.id),/retired/);
    assert.throws(() => updateNote(db,value.note.id,['new','b']),/retired/);
  });
});

test('study interaction parsers distinguish semantic correctness from FSRS ratings', () => {
  withDatabase(db => {
    const deck = createDeck(db,'Quiz');
    const typed = createNote(db,deck.id,'type-answer',['Spell','Café']);
    const typedInteraction = interactionForCard(db,typed.cardIds[0]!);
    assert.equal(needsAnswerInput(typedInteraction),true);
    assert.match(answerPrompt(typedInteraction),/Type/);
    assert.equal(evaluateAnswer(typedInteraction,'  CAFE\u0301 ').correct,true);
    assert.equal(evaluateAnswer(typedInteraction,'incorrect').correct,false);
    const choice = JSON.stringify([{id:'1st',text:'One'},{id:'2nd',text:'Two'}]);
    const multi = createNote(db,deck.id,'multiple-select',['Select',choice,'["1st","2nd"]','']);
    const interaction=interactionForCard(db,multi.cardIds[0]!);
    assert.equal(evaluateAnswer(interaction,'1,2').correct,true);
    assert.equal(evaluateAnswer(interaction,'1,1').correct,false);
    const ordering=createNote(db,deck.id,'ordering',['Order',choice,'']);
    const ordered=interactionForCard(db,ordering.cardIds[0]!);
    assert.equal(evaluateAnswer(ordered,'2,1').correct,true);
    assert.equal(evaluateAnswer(ordered,'1,2').correct,false);
    const basic=createNote(db,deck.id,'basic',['Manual','Self rate']);
    const basicInteraction=interactionForCard(db,basic.cardIds[0]!);
    assert.equal(needsAnswerInput(basicInteraction),false);
    assert.throws(() => evaluateAnswer(basicInteraction,'x'),/does not have/);
    assert.match(answerPrompt(basicInteraction),/Answer/);
    assert.equal(reviewHistory(db,typed.cardIds[0]!).length,0);
  });
});

test('review and undo fail closed on corrupt or stale scheduler state', () => {
  withDatabase(db => {
    const deck=createDeck(db,'Review');
    const card=createCard(db,deck.id,'What?','That.');
    assert.throws(() => getCard(db,1234),/not found/);
    assert.throws(() => parseCardId('0'),/positive integer/);
    assert.throws(() => createCard(db,deck.id,'a',''),/Back/);
    const date=new Date('2026-01-01T00:00:00.000Z');
    reviewCard(db,card.id,3,date);
    db.prepare("UPDATE card_schedules SET scheduler_version='unexpected' WHERE card_id=?").run(card.id);
    assert.throws(() => getSchedule(db,card.id),/Unsupported scheduler version/);
    assert.throws(() => reviewCard(db,card.id,3,new Date('2026-01-02')),/Unsupported scheduler version/);
    db.prepare("UPDATE card_schedules SET scheduler_version='fsrs-7-vutadex-1', difficulty=1 WHERE card_id=?").run(card.id);
    assert.throws(() => undoReview(db,card.id),/does not match/);
    assert.equal(reviewHistory(db,card.id).length,1);
  });
});

test('session validation, stale queue, skipping and undo without history', () => {
  withDatabase(db=>{
    const deck=createDeck(db,'Sessions');
    const card=createCard(db,deck.id,'New','answer');
    assert.throws(() => openStudySession(db,{newLimit:-1}),/limits/);
    assert.throws(() => openStudySession(db,{reviewLimit:1001}),/limits/);
    const session=openStudySession(db,{deckId:deck.id,newLimit:1});
    assert.throws(() => undoLastStudyReview(db,session.id),/no session review/);
    assert.throws(() => finishStudySession(db,999),/not found/);
    reviewCard(db,card.id,3,new Date('2026-01-01T00:00:00Z'));
    assert.throws(() => rateStudyCard(db,session.id,card.id,3,new Date('2026-01-02T00:00:00Z')),/outside this session/);
    assert.equal(sessionSummary(db,session.id).pending,1);
    assert.equal(skipStudyCard(db,session.id,card.id).status,'completed');
    assert.throws(() => skipStudyCard(db,session.id,card.id),/no longer active|already processed/);
  });
});

test('migration rejects a future version without mutating it',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('PRAGMA user_version=5');
    assert.throws(()=>migrate(db),/newer version/);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,5);
  }finally{db.close();}
});

test('failed migration rolls back created tables and leaves schema version untouched',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('PRAGMA user_version=1; CREATE TABLE review_events (id INTEGER PRIMARY KEY)');
    assert.throws(()=>migrate(db),/review_events/);
    assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,1);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='card_schedules'").get(),undefined);
  }finally{db.close();}
});

test('deck boundary values and descriptions preserve valid data',()=>{
  withDatabase(db=>{
    assert.throws(()=>createDeck(db,'x'.repeat(121)),/Deck name/);
    assert.throws(()=>createDeck(db,'bad\rname'),/Deck name/);
    const deck=createDeck(db,'N','d');
    assert.equal(renameDeck(db,deck.id,' N ').name,'N');
    assert.throws(()=>createDeck(db,'n'),/already exists/);
    assert.throws(()=>describeDeck(db,deck.id,'x'.repeat(2001)),/Description/);
    assert.equal(describeDeck(db,deck.id,'').description,'');
  });
});
