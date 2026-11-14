const { randomUUID, createHash } = require('node:crypto');
class ArtifactStore {
  constructor(maxBytes = 32 * 1024 * 1024) { this.entries = new Map(); this.bytes = 0; this.maxBytes = maxBytes; }
  put(runId, value) {
    const data = JSON.stringify(value), bytes = Buffer.byteLength(data);
    if (bytes > 4 * 1024 * 1024 || this.bytes + bytes > this.maxBytes) throw Object.assign(Error('Artifact storage limit reached.'), { code: 'RESOURCE_LIMIT' });
    const descriptor = { id: randomUUID(), kind: 'json', mimeType: 'application/json', bytes, sha256: createHash('sha256').update(data).digest('hex') };
    this.entries.set(descriptor.id, { runId, descriptor, data }); this.bytes += bytes; return descriptor;
  }
  putView(runId, view) {
    if (!view || !['image','table','math'].includes(view.kind)) throw Error('Unsupported visual artifact.');
    if (view.kind === 'image') {
      if (view.mimeType !== 'image/png' || typeof view.data !== 'string' || !Buffer.from(view.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid PNG artifact.');
    } else if (view.kind === 'table') {
      if (!Array.isArray(view.columns) || view.columns.length > 100 || !Array.isArray(view.rows) || view.rows.length > 200 || view.rows.some(row => !Array.isArray(row) || row.length !== view.columns.length)) throw Error('Invalid table artifact.');
    } else if (typeof view.latex !== 'string' || view.latex.length > 65536) throw Error('Invalid mathematical artifact.');
    const descriptor = this.put(runId, view);
    Object.assign(descriptor, { kind: view.kind, title: String(view.title || 'Result').slice(0,160), mimeType: view.kind === 'image' ? 'image/png' : 'application/json' });
    this.entries.get(descriptor.id).descriptor = descriptor;
    return descriptor;
  }
  get(runId, id) { const item = this.entries.get(id); if (!item || item.runId !== runId) throw Error('Artifact not found for this run.'); return { ...item.descriptor, value: JSON.parse(item.data) }; }
  clear() { this.entries.clear(); this.bytes = 0; }
}
module.exports = { ArtifactStore };
