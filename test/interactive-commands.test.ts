import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../database/migrate.ts';
import { createDeck, getDeck } from '../services/decks.ts';
import { createCard, getCard } from '../services/cards.ts';
import { createNote, getNote } from '../services/notes.ts';
import { runCardSubcommandAdd } from '../commands/card/add.ts';
import { runCardSubcommandEdit } from '../commands/card/edit.ts';
import { runCardSubcommandDelete } from '../commands/card/delete.ts';
import { runDeckSubcommandDelete } from '../commands/deck/delete.ts';
import { runNoteSubcommandDelete } from '../commands/note/delete.ts';
import type { TerminalInteraction } from '../commands/terminal.ts';

test('cleanup-v3 subcommand prompts preserve existing data on cancellation and require explicit yes',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  try{
    const deck=createDeck(db,'Interactive');
    const original=createCard(db,deck.id,'Manual','Back');
    const note=createNote(db,deck.id,'basic',['Question','Answer']);
    const promptLog:string[]=[];
    let accepted=false;
    const terminal: TerminalInteraction={
      isTTY:true,
      async confirm(prompt){promptLog.push(prompt); return accepted;},
      async cardFields(existing){
        promptLog.push('card fields');
        return existing?{front:existing.front,back:'Edited via terminal'}:{front:'Question via terminal',back:'Answer via terminal'};
      }
    };
    const notTerminal:TerminalInteraction={...terminal,isTTY:false};
    assert.equal(await runCardSubcommandAdd(db,[String(deck.id)],terminal),0);
    const added=db.prepare("SELECT id FROM cards WHERE front='Question via terminal'").get() as {id:number}|undefined;
    assert.ok(added);
    assert.equal(await runCardSubcommandEdit(db,[String(added.id)],terminal),0);
    assert.equal(getCard(db,added.id).back,'Edited via terminal');
    await assert.rejects(runCardSubcommandAdd(db,[String(deck.id)],notTerminal),/requires a terminal/);
    await assert.rejects(runCardSubcommandEdit(db,[String(added.id)],notTerminal),/requires a terminal/);

    assert.equal(await runDeckSubcommandDelete(db,[String(deck.id)],terminal),0);
    assert.equal(await runCardSubcommandDelete(db,[String(original.id)],terminal),0);
    assert.equal(await runNoteSubcommandDelete(db,[String(note.note.id)],terminal),0);
    assert.equal(getDeck(db,deck.id).name,'Interactive');
    assert.equal(getCard(db,original.id).front,'Manual');
    assert.equal(getNote(db,note.note.id).type,'basic');
    assert.equal(await runDeckSubcommandDelete(db,[String(deck.id)],notTerminal),1);
    await assert.rejects(runCardSubcommandDelete(db,[String(original.id)],notTerminal),/confirmation/);
    await assert.rejects(runNoteSubcommandDelete(db,[String(note.note.id)],notTerminal),/confirmation/);

    accepted=true;
    assert.equal(await runNoteSubcommandDelete(db,[String(note.note.id)],terminal),0);
    assert.throws(()=>getNote(db,note.note.id),/retired/);
    assert.equal(await runCardSubcommandDelete(db,[String(original.id)],terminal),0);
    assert.throws(()=>getCard(db,original.id),/not found/);
    assert.equal(await runDeckSubcommandDelete(db,[String(deck.id)],terminal),0);
    assert.throws(()=>getDeck(db,deck.id),/not found/);
    assert.ok(promptLog.some(s=>s.startsWith('Delete card')));
    assert.ok(promptLog.some(s=>s.startsWith('Retire basic')));
    assert.ok(promptLog.some(s=>s.startsWith('Delete deck')));
  }finally{db.close();}
});
