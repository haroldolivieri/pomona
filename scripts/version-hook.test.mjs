import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'pomona-hook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = path.join(root, 'work');
  const remote = path.join(root, 'remote.git');
  mkdirSync(work);
  const env = { ...process.env, POMONA_SKIP_BUMP: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  function git(...args) {
    const result = spawnSync('git', args, { cwd: work, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--bare', remote);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Hook Test');
  git('config', 'user.email', 'hook@example.invalid');
  for (const name of ['scripts/version-bump.mjs', 'scripts/hooks/pre-push']) {
    mkdirSync(path.dirname(path.join(work, name)), { recursive: true });
    copyFileSync(new URL(`../${name}`, import.meta.url), path.join(work, name));
  }
  chmodSync(path.join(work, 'scripts/hooks/pre-push'), 0o755);
  mkdirSync(path.join(work, 'apps/web'), { recursive: true });
  const versionFile = path.join(work, 'apps/web/package.json');
  writeFileSync(versionFile, '{"version": "0.1.0"}\n');
  writeFileSync(path.join(work, 'source.js'), 'old\n');
  git('add', '.');
  git('commit', '-m', 'initial');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', 'main');
  const initial = git('rev-parse', 'HEAD');
  git('config', 'core.hooksPath', 'scripts/hooks');
  writeFileSync(path.join(work, 'source.js'), 'new\n');
  git('add', 'source.js');
  git('commit', '-m', 'source change');
  const push = () => spawnSync('git', ['push', 'origin', 'main'], { cwd: work, env, encoding: 'utf8' });
  return { work, remote, versionFile, git, initial, push };
}

test('bump stops first push; second push sends release without unrelated staged work', t => {
  const f = fixture(t);
  writeFileSync(path.join(f.work, 'unrelated.txt'), 'unfinished work\n');
  f.git('add', 'unrelated.txt');
  const first = f.push();
  assert.notEqual(first.status, 0);
  assert.match(first.stderr, /run the same push again/);
  assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'main'), f.initial);
  assert.equal(f.git('show', '--format=', '--name-only', 'HEAD'), 'apps/web/package.json');
  assert.equal(f.git('diff', '--cached', '--name-only'), 'unrelated.txt');
  assert.equal(JSON.parse(readFileSync(f.versionFile, 'utf8')).version, '0.1.1');
  const second = f.push();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'main'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git('diff', '--cached', '--name-only'), 'unrelated.txt');
});

test('unfinished version edits remain untouched and block automatic commit', t => {
  const f = fixture(t);
  const edited = '{"version": "0.9.0"}\n';
  writeFileSync(f.versionFile, edited);
  f.git('add', 'apps/web/package.json');
  const before = f.git('rev-parse', 'HEAD');
  assert.notEqual(f.push().status, 0);
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(readFileSync(f.versionFile, 'utf8'), edited);
  assert.equal(f.git('diff', '--cached', '--name-only'), 'apps/web/package.json');
});

test('rejects another outgoing branch before modifying the checkout', t => {
  const f = fixture(t);
  f.git('branch', 'other');
  const before = f.git('rev-parse', 'HEAD');
  const version = readFileSync(f.versionFile, 'utf8');
  const result = spawnSync('git', ['push', 'origin', '--all'], { cwd: f.work,
    env: { ...process.env, POMONA_SKIP_BUMP: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Only the checked-out branch/);
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(readFileSync(f.versionFile, 'utf8'), version);
  assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'main'), f.initial);
});

test('whole-push base catches source changes before a documentation-only tip', t => {
  const f = fixture(t);
  writeFileSync(path.join(f.work, 'README.md'), 'Documentation update\n');
  f.git('add', 'README.md');
  f.git('commit', '-m', 'documentation');
  const result = spawnSync(process.execPath, ['scripts/version-bump.mjs', '--base', f.initial], {
    cwd: f.work, encoding: 'utf8', env: { ...process.env, POMONA_SKIP_BUMP: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(f.versionFile, 'utf8')).version, '0.1.1');
});

test('whole-push base accepts a bump preceding the final source commit', t => {
  const f = fixture(t);
  writeFileSync(f.versionFile, '{"version": "0.1.1"}\n');
  f.git('add', 'apps/web/package.json');
  f.git('commit', '-m', 'version bump');
  writeFileSync(path.join(f.work, 'source.js'), 'final change\n');
  f.git('add', 'source.js');
  f.git('commit', '-m', 'final source change');
  const result = spawnSync(process.execPath, ['scripts/version-bump.mjs', '--base', f.initial], {
    cwd: f.work, encoding: 'utf8', env: { ...process.env, POMONA_SKIP_BUMP: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no bump needed/);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('review pushes preserve the feature branch bump relative to main', t => {
  const f = fixture(t);
  f.git('checkout', '-b', 'feature/review');
  writeFileSync(f.versionFile, '{"version": "0.2.0"}\n');
  f.git('add', 'apps/web/package.json');
  f.git('commit', '-m', 'feature version bump');
  f.git('push', '-u', 'origin', 'feature/review');
  writeFileSync(path.join(f.work, 'source.js'), 'review fix\n'.repeat(200));
  f.git('add', 'source.js');
  f.git('commit', '-m', 'review fix');
  const before = f.git('rev-parse', 'HEAD');
  f.git('push', 'origin', 'feature/review');
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(JSON.parse(readFileSync(f.versionFile, 'utf8')).version, '0.2.0');
  assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'feature/review'), before);
});
