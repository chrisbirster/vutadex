import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { getDatabase } from '../database/index.ts';
import { createDeck, getDeck } from '../services/decks.ts';
import { addCard, getCard } from '../services/cards.ts';
import { createNote, getNote } from '../services/notes.ts';
import { runDeckCommand } from '../commands/deck.ts';
import { runCardCommand } from '../commands/card.ts';
import { runNoteCommand } from '../commands/note.ts';

function respond(...lines:string[]):void{
  for(const [i,line] of lines.entries()){
    setTimeout(()=>process.stdin.emit('data',Buffer.from(line+'\n')),(i+1)*120);
  }
}
test('TTY handlers prompt for card entry/edit and explicit deletion confirmations', {timeout:15000},async()=>{
  const home=mkdtempSync(join(tmpdir(),'vutadex-tty-handlers-'));
  const prior={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,
    LOCALAPPDATA:process.env.LOCALAPPDATA,XDG_DATA_HOME:process.env.XDG_DATA_HOME};
  const tty=Object.getOwnPropertyDescriptor(process.stdin,'isTTY');
  process.env.HOME=home;process.env.USERPROFILE=home;
  process.env.LOCALAPPDATA=join(home,'data');process.env.XDG_DATA_HOME=join(home,'data');
  Object.defineProperty(process.stdin,'isTTY',{configurable:true,value:true});
  try{
    const db=getDatabase();
    let deckId:number, initialCardId:number, noteId:number;
    try{
      deckId=createDeck(db,'TTY').id;
      initialCardId=addCard(db,deckId,'Manual','Back').id;
      noteId=createNote(db,deckId,'basic',['From note','Answer']).note.id;
    }finally{db.close();}

    respond('Front from interactive','Back from interactive');
    assert.equal(await runCardCommand('add',[String(deckId)]),0);
    const inspect=getDatabase();
    const created=inspect.prepare("SELECT id FROM cards WHERE front='Front from interactive'").get() as {id:number}|undefined;
    inspect.close();
    assert.ok(created);

    respond('','Edited back');
    assert.equal(await runCardCommand('edit',[String(created.id)]),0);
    const modified=getDatabase();
    try{
      assert.equal(getCard(modified,created.id).front,'Front from interactive');
      assert.equal(getCard(modified,created.id).back,'Edited back');
    }finally{modified.close();}

    respond('n');
    assert.equal(await runDeckCommand('delete',[String(deckId)]),0);
    const afterCancel=getDatabase();
    try{assert.equal(getDeck(afterCancel,deckId).name,'TTY');}
    finally{afterCancel.close();}

    respond('yes');
    assert.equal(await runCardCommand('delete',[String(initialCardId)]),0);

    respond('y');
    assert.equal(await runNoteCommand(['delete',String(noteId)]),0);
    const retired=getDatabase();
    try{assert.throws(()=>getNote(retired,noteId),/retired/);}
    finally{retired.close();}

    respond('y');
    assert.equal(await runDeckCommand('delete',[String(deckId)]),0);
    const gone=getDatabase();
    try{assert.throws(()=>getDeck(gone,deckId),/not found/);}
    finally{gone.close();}
  }finally{
    if(tty)Object.defineProperty(process.stdin,'isTTY',tty);
    else Reflect.deleteProperty(process.stdin,'isTTY');
    for(const [key,value] of Object.entries(prior)){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
    rmSync(home,{recursive:true,force:true});
  }
});
