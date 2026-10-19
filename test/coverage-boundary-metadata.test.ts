import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDataHome } from '../utils/paths.ts';
import { handleVersionCommand } from '../commands/version.ts';
import { handleHelpCommand } from '../commands/help.ts';

test('version and help handlers return successful exit codes',()=>{
  const prior = console.log;
  const output:string[]=[];
  console.log = (...values:unknown[])=>{output.push(values.map(String).join(' '));};
  try {
    assert.equal(handleVersionCommand(),0);
    assert.equal(handleHelpCommand(),0);
    assert.match(output.join('\n'),/Vutadex/);
  }finally{console.log=prior;}
});

test('user data directory resolves to a nonempty platform-appropriate path',()=>{
  assert.ok(getDataHome().length>0);
});
