import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { makeStudyInput } from '../commands/study-input.ts';

test('TTY study input handles reveal, typing, correction, Ctrl-C and cleanup',async()=>{
  const stream=process.stdin;
  const wasTTY=Object.getOwnPropertyDescriptor(stream,'isTTY');
  const originalRaw=Object.getOwnPropertyDescriptor(stream,'setRawMode');
  const captured:boolean[]=[];
  Object.defineProperty(stream,'isTTY',{configurable:true,value:true});
  Object.defineProperty(stream,'setRawMode',{configurable:true,value:(value:boolean)=>{captured.push(value);}});
  let input:ReturnType<typeof makeStudyInput>|undefined;
  try {
    input=makeStudyInput();
    const reveal=input.ask('Reveal: ');
    stream.emit('keypress',' ',{name:'space'});
    assert.equal(await reveal,'');
    const answer=input.askText('Answer: ');
    stream.emit('keypress','A',{name:'a'});
    stream.emit('keypress','B',{name:'b'});
    stream.emit('keypress','',{name:'backspace'});
    stream.emit('keypress','C',{name:'c'});
    stream.emit('keypress','\r',{name:'return'});
    assert.equal(await answer,'AC');
    const invalid=input.ask('Rating: ');
    stream.emit('keypress','left',{name:'left',sequence:'left'});
    stream.emit('keypress','3',{name:'3'});
    assert.equal(await invalid,'3');
    const canceled=input.askText('Text: ');
    stream.emit('keypress','c',{name:'c',ctrl:true});
    assert.equal(await canceled,null);
    const rated=input.ask('Rating: ');
    stream.emit('keypress','s',{name:'s'});
    assert.equal(await rated,'s');
    stream.emit('keypress','2',{name:'2'});
    assert.equal(await input.ask('Buffered: '),'2');
    const pending=input.ask('Close: ');
    input.close();
    assert.equal(await pending,null);
    assert.deepEqual(captured,[true,false]);
  } finally {
    input?.close();
    if(wasTTY)Object.defineProperty(stream,'isTTY',wasTTY);
    else Reflect.deleteProperty(stream,'isTTY');
    if(originalRaw)Object.defineProperty(stream,'setRawMode',originalRaw);
    else Reflect.deleteProperty(stream,'setRawMode');
  }
});
