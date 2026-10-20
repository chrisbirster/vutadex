import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('npm tarball installs an executable CLI with SQLite assets and works offline', () => {
  const root = mkdtempSync(join(tmpdir(), 'vdex-install-'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const runNpm = (args: string[]) => spawnSync(npm, args, {
    cwd: process.cwd(), encoding:'utf8',timeout:120000,
    shell:process.platform === 'win32'
  });
  try {
    const pack = runNpm(['pack','--ignore-scripts','--pack-destination',root]);
    assert.equal(pack.status,0,pack.stderr);
    const tarball = readdirSync(root).find(name => name.endsWith('.tgz'));
    assert.ok(tarball, 'expected a pack artifact');
    const prefix = join(root,'install');
    const installed = runNpm(['install','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund',join(root,tarball)]);
    assert.equal(installed.status,0,installed.stderr);
    const nodeEntry = join(prefix,'node_modules','vutadex','dist','index.js');
    const query = join(prefix,'node_modules','vutadex','dist','database','query','deck-file','manual-cards.sql');
    assert.ok(existsSync(nodeEntry),'entrypoint missing');
    assert.ok(existsSync(query),'SQL asset missing');
    const home = join(root,'home');
    const env = {...process.env, HOME:home, USERPROFILE:home,
      LOCALAPPDATA:join(home,'local'),XDG_DATA_HOME:join(home,'xdg')};
    const cmd=(args:string[])=>spawnSync(process.execPath,[nodeEntry,...args],
      {encoding:'utf8',timeout:20000,env});
    const version=cmd(['version']);
    assert.equal(version.status,0,version.stderr);
    assert.match(version.stdout,/v1\.0\.0/);
    const created=cmd(['deck','create','Installed deck']);
    assert.equal(created.status,0,created.stderr);
    const note=cmd(['note','add','1','basic','Installed question','Installed answer']);
    assert.equal(note.status,0,note.stderr);
    const due=cmd(['due','1']);
    assert.equal(due.status,0,due.stderr);
    assert.match(due.stdout,/Installed question/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
