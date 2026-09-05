import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Artifact } from './domain.js';
import { CalleAdapter, InstalledCliRunner, readiness } from './adapters/calle.js';
import { demoJob, demoRuntime, MockAdapter } from './demo.js';
import { approveManualAction } from './decision.js';
import { runJob } from './orchestrator.js';
import { report } from './report.js';
import { simulationGrant } from './safety.js';
import { FileRunStore } from './store.js';
import { reviewEvidence } from './review.js';
import { mission002Approval, mission002ContactRef, mission002Grant, mission002Job } from './live-validation.js';

async function main(args: string[]): Promise<void> {
  const command = args[0] ?? 'help';
  const store = new FileRunStore(resolve('.runs'));
  if (command === 'demo' && args.length <= 2) {
    const job = structuredClone(demoJob); if (args[1]) job.id = args[1];
    const artifact = await runJob(job, new MockAdapter(), store, demoRuntime, simulationGrant(job));
    const brief = report(artifact);
    await writeFile(resolve('.runs', `${artifact.job.id}.md`), brief, { mode: 0o600 });
    console.log(brief);
    console.log(`\nArtifact: .runs/${artifact.job.id}.json\nBrief: .runs/${artifact.job.id}.md`);
    return;
  }
  if (command === 'inspect' && args.length === 2) {
    const artifact = await store.load(args[1]!); if (!artifact) throw new Error('Run absent');
    console.log(report(artifact)); return;
  }
  if (command === 'approve-manual' && args.length === 4) {
    const release = await store.acquire(args[1]!);
    try {
      const artifact = await store.load(args[1]!); if (!artifact) throw new Error('Run absent');
      const approved = approveManualAction(artifact, args[2]!, args[3]!, new Date().toISOString());
      await store.save(approved); console.log('Human choice recorded for manual action. No purchase, booking or reservation executed.');
    } finally { await release(); }
    return;
  }
  if (command === 'schema' && args.length === 1) { const { z } = await import('zod'); console.log(JSON.stringify(z.toJSONSchema(Artifact), null, 2)); return; }
  if (command === 'review-evidence' && args.length === 3) {
    const release = await store.acquire(args[1]!);
    try {
      const artifact = await store.load(args[1]!); if (!artifact) throw new Error('Run absent');
      const review: unknown = JSON.parse(await readFile(resolve(args[2]!), 'utf8'));
      await store.save(reviewEvidence(artifact, review)); console.log('Human evidence review recorded. No call or consequential action executed.');
    } finally { await release(); }
    return;
  }
  if (command === 'verify-artifact' && args.length === 2) { Artifact.parse(JSON.parse(await readFile(resolve(args[1]!), 'utf8'))); console.log('Artifact schema valid'); return; }
  if (command === 'readiness' && args.length === 1) { console.log(JSON.stringify(await readiness(InstalledCliRunner.discover()), null, 2)); return; }
  if (command === 'live-test' && args.length === 1) {
    if (process.env.PARTLINE_LIVE_APPROVAL !== mission002Approval) throw new Error('Explicit Mission 002 approval marker absent');
    let phone = process.env.PARTLINE_TEST_PHONE?.trim() ?? '';
    const region = process.env.PARTLINE_TEST_REGION?.trim() ?? '';
    const language = process.env.PARTLINE_TEST_LANGUAGE?.trim() ?? '';
    const timezone = process.env.PARTLINE_TEST_TIMEZONE?.trim() ?? '';
    const deadline = process.env.PARTLINE_TEST_DEADLINE?.trim() ?? '';
    delete process.env.PARTLINE_TEST_PHONE;
    try {
      const now = new Date().toISOString();
      const job = mission002Job({ region, language, timezone, deadline, now });
      if (await store.load(job.id)) throw new Error('Mission 002 already has a run artifact; refusing a second live invocation');
      const grant = mission002Grant(job, phone);
      const runner = InstalledCliRunner.discover({ allowLive: true });
      const ready = await readiness(runner);
      if (!ready.authenticated || !ready.requiredToolsPresent) throw new Error('CALL-E readiness check failed');
      const adapter = new CalleAdapter(runner, {
        enableLive: true,
        grant,
        now: () => new Date().toISOString(),
        resolvePhone: contactRef => {
          if (contactRef !== mission002ContactRef) throw new Error('Unauthorized contact reference');
          return phone;
        },
        redactionPhones: () => [phone],
      });
      const artifact = await runJob(job, adapter, store, { now: () => new Date().toISOString(), sleep: ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)) }, grant);
      const brief = report(artifact);
      await writeFile(resolve('.runs', `${artifact.job.id}.md`), brief, { mode: 0o600 });
      console.log(brief);
    } finally {
      phone = '';
    }
    return;
  }
  if (command !== 'help') throw new Error('Unsupported command; live execution is disabled in Mission 001');
  console.log('PARTLINE\n  demo [run-id]          Deterministic fictional sourcing workflow\n  inspect <run-id>       Read a saved decision brief\n  approve-manual <run-id> <target-id> <reviewer>\n                        Record a human choice; never execute it\n  review-evidence <run-id> <review.json>\n                        Import operator annotations with exact transcript spans\n  schema                Print the dashboard artifact JSON Schema\n  verify-artifact <path> Validate an artifact\n  readiness             Read CALL-E auth status and tool names only\n  live-test             Mission 002 only: one approval-gated real call');
}
main(process.argv.slice(2)).catch(() => { console.error('PARTLINE operation failed. Check command, input, approval, or run lock. Raw errors are suppressed to protect credentials.'); process.exitCode = 1; });
