import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, utimes, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('48-hour default removes expired temporary recordings while preserving recent files and owner archives', { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'uds-retention-'));
  let child;
  try {
    for (const folder of ['program', 'iso', 'owner']) await mkdir(join(root, folder));
    const expired = join(root, 'program', 'old.mp4');
    const recent = join(root, 'iso', 'recent.webm');
    const owner = join(root, 'owner', 'archive.mp4');
    for (const [path, hours] of [[expired, 49], [recent, 47], [owner, 100]]) {
      await writeFile(path, 'isolated-test-file');
      const time = new Date(Date.now() - hours * 3600000);
      await utimes(path, time, time);
    }
    const env = { ...process.env, ENCODER_HOST: '127.0.0.1', ENCODER_PORT: '0', ENCODER_API_TOKEN: 'isolated-test-token', SCENEPILOT_RECORDING_ROOT: root };
    delete env.SCENEPILOT_RECORDING_RETENTION_HOURS;
    child = spawn(process.execPath, ['server/encoder.js'], { env });
    const url = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on (http:\/\/[^\s]+)/);
        if (match) resolve(match[1]);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Encoder exited: ${code}`)));
    });
    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.temporaryRetentionHours, 48);
    assert.equal(health.ownerRetention, 'permanent');
    for (let attempt = 0; attempt < 20; attempt++) {
      try { await access(expired); } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await assert.rejects(access(expired), { code: 'ENOENT' });
    await access(recent);
    await access(owner);
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
    await rm(root, { recursive: true, force: true });
  }
});
