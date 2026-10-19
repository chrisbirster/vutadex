import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { getDatabase } from '../database/index.ts';
import { getDeck, createDeck } from '../services/decks.ts';
import { getCard, addCard } from '../services/cards.ts';
import { createNote, getNote } from '../services/notes.ts';
import { runDeckCommand } from '../commands/deck.ts';
import { runCardCommand } from '../commands/card.ts';
import { runNoteCommand } from '../commands/note.ts';
import type { TerminalInteraction } from '../commands/terminal.ts';

test('deterministic CLI prompts cover add, edit, cancel, confirm and preservation of data', async () => {
  const home = mkdtempSync(join(tmpdir(), 'vutadex-commands-'));
  const old = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA, XDG_DATA_HOME: process.env.XDG_DATA_HOME };
  process.env.HOME=home;
  process.env.USERPROFILE=home;
  process.env.LOCALAPPDATA=join(home,'local');
  process.env.XDG_DATA_HOME=join(home,'xdg');
  try {
    const db=getDatabase();
    let deckId:number, cardId:number, noteId:number;
    try {
      deckId=createDeck(db,'Interactive').id;
      cardId=addCard(db,deckId,'First','Answer').id;
      noteId=createNote(db,deckId,'basic',['Question','Answer']).note.id;
    } finally { db.close(); }

    const prompts:string[]=[];
    let confirmation=false;
    let answer={front:'Interactive front',back:'Interactive back'};
    const terminal:TerminalInteraction={
      isTTY:true,
      async confirm(prompt) { prompts.push(prompt); return confirmation; },
      async cardFields(existing) {
        prompts.push('fields');
        return existing ? {front:existing.front,back:'Edited back'} : answer;
      }
    };
    const noTerminal:TerminalInteraction={...terminal,isTTY:false};
    assert.equal(await runCardCommand('add',[String(deckId)],noTerminal),1);
    assert.equal(await runCardCommand('edit',[String(cardId)],noTerminal),1);
    assert.equal(await runCardCommand('add',[String(deckId)],terminal),0);

    const c=getDatabase();
    let newCardId:number;
    try {
      const row=c.prepare("SELECT id FROM cards WHERE front='Interactive front'").get() as {id:number}|undefined;
      assert.ok(row);
      newCardId=row.id;
    } finally { c.close(); }
    assert.equal(await runCardCommand('edit',[String(newCardId)],terminal),0);

    assert.equal(await runDeckCommand('delete',[String(deckId)],terminal),0);
    assert.equal(await runCardCommand('delete',[String(cardId)],terminal),0);
    assert.equal(await runNoteCommand(['delete',String(noteId)],terminal),0);
    const existing=getDatabase();
    try {
      assert.equal(getDeck(existing,deckId).name,'Interactive');
      assert.equal(getCard(existing,cardId).front,'First');
      assert.equal(getCard(existing,newCardId).back,'Edited back');
      assert.equal(getNote(existing,noteId).type,'basic');
    }finally{existing.close();}

    assert.equal(await runDeckCommand('delete',[String(deckId)],noTerminal),1);
    assert.equal(await runCardCommand('delete',[String(cardId)],noTerminal),1);
    assert.equal(await runNoteCommand(['delete',String(noteId)],noTerminal),1);

    confirmation=true;
    assert.equal(await runCardCommand('delete',[String(cardId)],terminal),0);
    assert.equal(await runNoteCommand(['delete',String(noteId)],terminal),0);
    assert.equal(await runDeckCommand('delete',[String(deckId)],terminal),0);
    const after=getDatabase();
    try {
      assert.throws(()=>getDeck(after,deckId),/not found/);
      assert.throws(()=>getCard(after,cardId),/not found/);
      assert.throws(()=>getNote(after,noteId),/retired|not found/);
    }finally{after.close();}
    assert.ok(prompts.some(p=>p.startsWith('Delete deck')));
    assert.ok(prompts.some(p=>p.startsWith('Delete card')));
    assert.ok(prompts.some(p=>p.startsWith('Retire basic note')));
  }finally{
    for(const [key,value] of Object.entries(old)) {
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
    rmSync(home,{recursive:true,force:true});
  }
});
