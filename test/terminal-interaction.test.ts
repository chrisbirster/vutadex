import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { createTerminalInteraction } from '../commands/terminal.ts';

function fixture(answers: string[], interactive=true) {
  const input=Object.assign(new PassThrough(),{isTTY:interactive});
  const pending=[...answers];
  const prompts:string[]=[];
  const output=new Writable({
    write(chunk:Buffer,_encoding,callback) {
      const text=chunk.toString('utf8');
      prompts.push(text);
      if(text.includes('?') || text.startsWith('Front (') || text.startsWith('Back (')) {
        const response=pending.shift();
        if(response!==undefined)setImmediate(()=>input.write(response+'\n'));
      }
      callback();
    }
  });
  return {terminal:createTerminalInteraction(
    input as unknown as NodeJS.ReadStream,output as unknown as NodeJS.WriteStream),
    input,output,prompts};
}

test('terminal confirmation accepts yes and y; rejects blank and no', {timeout:4000}, async()=>{
  for(const [answer,expected] of [['yes',true],[' Y ',true],['NO',false],['',false]] as const) {
    const {terminal,input,output}=fixture([answer]);
    try {
      assert.equal(terminal.isTTY,true);
      assert.equal(await terminal.confirm('Delete? '),expected);
    }finally{input.destroy();output.destroy();}
  }
});

test('terminal card input supports line-break escapes and defaults to existing fields', {timeout:4000}, async()=>{
  const {terminal,input,output}=fixture(['Line 1\\nLine 2','Answer']);
  try{
    assert.deepEqual(await terminal.cardFields(),{front:'Line 1\nLine 2',back:'Answer'});
  }finally{input.destroy();output.destroy();}
  const next=fixture(['','New back']);
  try{
    assert.deepEqual(await next.terminal.cardFields({front:'Keep',back:'Old'}),{front:'Keep',back:'New back'});
  }finally{next.input.destroy();next.output.destroy();}
});

test('terminal card entry rejects noninteractive input before opening readline',async()=>{
  const {terminal,input,output}=fixture([],false);
  try{
    assert.equal(terminal.isTTY,false);
    await assert.rejects(terminal.cardFields(),/requires a terminal/);
  }finally{input.destroy();output.destroy();}
});
