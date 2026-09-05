import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildJudgePackage } from '../src/dashboard/build.js';
import { createStaticJudgeServer } from '../src/dashboard/static-server.js';
import { loadSanitizedProof, verifyProofIntegrity } from '../src/proof.js';

test('tracked Mission 002 proof is minimal, internally traceable and integrity verified', async () => {
  const { proof, transcript, integrity } = await loadSanitizedProof();
  assert.equal(integrity.files.length, 3);
  assert.equal(proof.callCount, 1);
  assert.equal(proof.startAttempts, 1);
  assert.equal(proof.redialCount, 0);
  assert.equal(proof.purchaseOrReservation, false);
  assert.equal(proof.coverage.supported, 7);
  assert.equal(proof.coverage.required, 8);
  assert.deepEqual(proof.coverage.unknown, ['constraints']);
  assert.equal(proof.evidence.length, 7);
  assert.equal(proof.sameCallClarification.completed, true);
  assert.ok(proof.evidence.every(item => item.speaker === 'USER' && transcript.includes(item.quote)));
  assert.ok(proof.evidence.every(item => /^transcript\.sanitized\.txt:L\d+-L\d+$/.test(item.sourceRef)));
  assert.ok(!proof.evidence.some(item => item.field === 'constraints'));
  assert.doesNotMatch(`${transcript}\n${JSON.stringify(proof)}`, /contactRef|runId|phone_number|to_phone|authorization|callback_url|bearer|access_token|refresh_token/i);
  assert.doesNotMatch(`${transcript}\n${JSON.stringify(proof)}`, /\+[1-9]\d(?:[\s().-]*\d){7,14}/);
});

test('proof verification rejects a changed sanitized transcript', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'partline-proof-test-'));
  try {
    await mkdir(resolve(root, 'proof'), { recursive: true });
    await cp(resolve(process.cwd(), 'proof', 'mission-002'), resolve(root, 'proof', 'mission-002'), { recursive: true });
    await appendFile(resolve(root, 'proof', 'mission-002', 'transcript.sanitized.txt'), '\nchanged\n', 'utf8');
    await assert.rejects(verifyProofIntegrity(root), /integrity mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('proof verification rejects unmanifested files', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'partline-proof-fileset-'));
  try {
    await mkdir(resolve(root, 'proof'), { recursive: true });
    await cp(resolve(process.cwd(), 'proof', 'mission-002'), resolve(root, 'proof', 'mission-002'), { recursive: true });
    await writeFile(resolve(root, 'proof', 'mission-002', 'unexpected.txt'), 'not part of the bundle', 'utf8');
    await assert.rejects(verifyProofIntegrity(root), /directory file set invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('portable judge build is self-contained, read-only and serves without run artifacts', async () => {
  await mkdir(resolve(process.cwd(), '.test-runs'), { recursive: true });
  const output = await mkdtemp(resolve(process.cwd(), '.test-runs', 'judge-build-'));
  try {
    await buildJudgePackage(process.cwd(), output);
    const [index, data, buildInfo] = await Promise.all([
      readFile(resolve(output, 'index.html'), 'utf8'),
      readFile(resolve(output, 'data.js'), 'utf8'),
      readFile(resolve(output, 'BUILD-INFO.json'), 'utf8'),
    ]);
    assert.match(index, /src="\.\/data\.js"/);
    assert.match(index, /src="\.\/app\.js"/);
    assert.match(data, /versioned_sanitized_proof/);
    assert.match(data, /REAL CALL-E VALIDATION/);
    assert.doesNotMatch(`${index}\n${data}\n${buildInfo}`, /\.runs|contactRef|runId|phone_number|to_phone/i);
    assert.equal(JSON.parse(buildInfo).mode, 'offline_read_only');
    await verifyProofIntegrity(output);

    const server = createStaticJudgeServer(output);
    await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Static server address unavailable');
      const base = `http://127.0.0.1:${address.port}`;
      const page = await fetch(base);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-security-policy') ?? '', /connect-src 'none'/);
      assert.equal((await fetch(`${base}/data.js`)).status, 200);
      assert.equal((await fetch(`${base}/api/dashboard`)).status, 404);
      assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    } finally {
      await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
