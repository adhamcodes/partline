import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Field, Value } from './domain.js';
import { assertNoSecrets } from './safety.js';

const proofFiles = ['README.md', 'transcript.sanitized.txt', 'validation.json'] as const;
const directoryFiles = [...proofFiles, 'integrity.json'].sort();

const ProofEvidence = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  field: Field,
  value: Value,
  quote: z.string().min(1).max(4000),
  speaker: z.literal('USER'),
  timestamp: z.string().regex(/^\d{2}:\d{2}:\d{2}(?:-\d{2}:\d{2}:\d{2})?$/),
  sourceRef: z.string().regex(/^transcript\.sanitized\.txt:L\d+-L\d+$/),
}).strict();

export const SanitizedProof = z.object({
  schemaVersion: z.literal(1),
  proofId: z.literal('mission-002-calle-validation'),
  kind: z.literal('real_calle_validation'),
  context: z.literal('consenting_role_play'),
  supplierAlias: z.literal('Beacon Supply'),
  status: z.literal('COMPLETED'),
  callCount: z.literal(1),
  startAttempts: z.literal(1),
  redialCount: z.literal(0),
  purchaseOrReservation: z.literal(false),
  request: z.object({
    exactModel: z.literal('ACME MX-240'), quantity: z.literal(2),
    deadline: z.literal('2026-09-05T16:00:00+06:00'), timezone: z.literal('Asia/Dhaka'), fulfillment: z.literal('pickup'),
  }).strict(),
  coverage: z.object({ supported: z.literal(7), required: z.literal(8), unknown: z.tuple([z.literal('constraints')]) }).strict(),
  sameCallClarification: z.object({ field: z.literal('warranty'), completed: z.literal(true), sourceRef: z.string().regex(/^transcript\.sanitized\.txt:L\d+-L\d+$/) }).strict(),
  evidence: z.array(ProofEvidence).length(7),
}).strict().superRefine((proof, context) => {
  const fields = proof.evidence.map(item => item.field);
  if (new Set(fields).size !== fields.length) context.addIssue({ code: 'custom', message: 'Duplicate proof field' });
  if (fields.includes('constraints')) context.addIssue({ code: 'custom', message: 'Unknown constraints cannot have evidence' });
  for (const required of ['availability', 'model', 'quantity', 'total_price', 'ready_at', 'fulfillment', 'warranty'] as const) {
    if (!fields.includes(required)) context.addIssue({ code: 'custom', message: `Missing proof field: ${required}` });
  }
});
export type SanitizedProof = z.infer<typeof SanitizedProof>;

const IntegrityManifest = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal('sha256'),
  canonicalization: z.literal('utf8-crlf-to-lf'),
  files: z.array(z.object({ path: z.enum(proofFiles), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(proofFiles.length),
  bundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type IntegrityManifest = z.infer<typeof IntegrityManifest>;

const normalizedText = (text: string): string => text.replace(/\r\n/g, '\n');
const digest = (text: string): string => createHash('sha256').update(normalizedText(text), 'utf8').digest('hex');
const bundleDigest = (files: IntegrityManifest['files']): string => digest(files.map(file => `${file.path}\0${file.sha256}`).join('\n'));
export const proofDirectory = (root = process.cwd()): string => resolve(root, 'proof', 'mission-002');

export async function verifyProofIntegrity(root = process.cwd()): Promise<IntegrityManifest> {
  const directory = proofDirectory(root);
  const actualFiles = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
  if (actualFiles.length !== directoryFiles.length || actualFiles.some((file, index) => file !== directoryFiles[index])) {
    throw new Error('Proof bundle directory file set invalid');
  }
  const manifest = IntegrityManifest.parse(JSON.parse(await readFile(resolve(directory, 'integrity.json'), 'utf8')));
  const paths = manifest.files.map(file => file.path);
  if (new Set(paths).size !== proofFiles.length || proofFiles.some(path => !paths.includes(path))) throw new Error('Proof integrity manifest file set invalid');
  for (const file of manifest.files) {
    const actual = digest(await readFile(resolve(directory, file.path), 'utf8'));
    if (actual !== file.sha256) throw new Error(`Proof integrity mismatch: ${file.path}`);
  }
  if (bundleDigest(manifest.files) !== manifest.bundleSha256) throw new Error('Proof bundle digest mismatch');
  return manifest;
}

function quotedLines(transcript: string, sourceRef: string): string {
  const match = sourceRef.match(/:L(\d+)-L(\d+)$/);
  if (!match) throw new Error('Proof source reference invalid');
  const start = Number(match[1]);
  const end = Number(match[2]);
  const lines = normalizedText(transcript).split('\n');
  if (start < 1 || end < start || end > lines.length) throw new Error('Proof source reference outside transcript');
  return lines.slice(start - 1, end).join('\n');
}

export async function loadSanitizedProof(root = process.cwd()): Promise<{ proof: SanitizedProof; transcript: string; integrity: IntegrityManifest }> {
  const integrity = await verifyProofIntegrity(root);
  const directory = proofDirectory(root);
  const transcript = normalizedText(await readFile(resolve(directory, 'transcript.sanitized.txt'), 'utf8')).trimEnd();
  const proof = SanitizedProof.parse(JSON.parse(await readFile(resolve(directory, 'validation.json'), 'utf8')));
  assertNoSecrets(proof);
  assertNoSecrets(transcript);
  if (/\+[1-9]\d(?:[\s().-]*\d){7,14}/.test(`${transcript}\n${JSON.stringify(proof)}`)) throw new Error('Phone-like value rejected from proof bundle');
  for (const evidence of proof.evidence) {
    if (quotedLines(transcript, evidence.sourceRef) !== evidence.quote) throw new Error(`Proof quote mismatch: ${evidence.id}`);
    if (!evidence.quote.includes(`USER:`) || !evidence.quote.includes(evidence.timestamp.split('-')[0]!)) throw new Error(`Proof speaker/timestamp mismatch: ${evidence.id}`);
  }
  return { proof, transcript, integrity };
}
