import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Artifact, Id, type Artifact as RunArtifact } from './domain.js';
import { assertNoSecrets } from './safety.js';

export interface RunStore {
  acquire(id: string): Promise<() => Promise<void>>;
  load(id: string): Promise<RunArtifact | undefined>;
  save(artifact: RunArtifact): Promise<void>;
}
export class FileRunStore implements RunStore {
  private tail: Promise<void> = Promise.resolve();
  constructor(readonly root: string) {}
  private path(id: string, suffix: string): string { return join(this.root, `${Id.parse(id)}${suffix}`); }
  async acquire(id: string): Promise<() => Promise<void>> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try { const handle = await open(this.path(id, '.lock'), 'wx', 0o600); await handle.close(); }
    catch { throw new Error('Run locked; inspect any interrupted worker before removing its lock'); }
    return async () => { await rm(this.path(id, '.lock')); };
  }
  async load(id: string): Promise<RunArtifact | undefined> {
    let raw: string;
    try { raw = await readFile(this.path(id, '.json'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error('Artifact read failed'); }
    try { const data = Artifact.parse(JSON.parse(raw)); assertNoSecrets(data); return data; } catch { throw new Error('Invalid or sensitive artifact'); }
  }
  async save(artifact: RunArtifact): Promise<void> {
    const validated = Artifact.parse(artifact); assertNoSecrets(validated);
    // Freeze each checkpoint before queueing: concurrent workers cannot reorder stale mutable snapshots.
    const serialized = JSON.stringify(validated, null, 2) + '\n';
    const write = this.tail.then(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const tmp = this.path(validated.job.id, '.json.tmp');
      const handle = await open(tmp, 'w', 0o600);
      try { await handle.writeFile(serialized); await handle.sync(); } finally { await handle.close(); }
      await rename(tmp, this.path(validated.job.id, '.json'));
    });
    this.tail = write.catch(() => {});
    return write;
  }
}
export class MemoryRunStore implements RunStore {
  private records = new Map<string, RunArtifact>();
  private locks = new Set<string>();
  async acquire(id: string): Promise<() => Promise<void>> {
    if (this.locks.has(id)) throw new Error('Run locked');
    this.locks.add(id); return async () => { this.locks.delete(id); };
  }
  async load(id: string): Promise<RunArtifact | undefined> { const value = this.records.get(id); return value ? structuredClone(value) : undefined; }
  async save(artifact: RunArtifact): Promise<void> { Artifact.parse(artifact); assertNoSecrets(artifact); this.records.set(artifact.job.id, structuredClone(artifact)); }
}
