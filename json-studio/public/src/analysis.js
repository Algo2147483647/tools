import { JsonCore } from './json-core.js';
import { StudioCore } from './studio-core.js';

/** Shared worker entry point; operates exclusively on the supplied document text. */
export function analyzeDocument(kind, payload) {
  const parsed = JsonCore.parse(payload.text);
  if (kind === 'schema' && parsed.duplicateKeys) {
    throw new Error('Schema validation requires unique object keys.');
  }

  switch (kind) {
    case 'diff':
      return StudioCore.diff(parsed.root, JsonCore.parse(payload.after).root, payload.ignoreOrder);
    case 'path':
      return StudioCore.query(parsed.root, payload.expression);
    case 'schema':
      return StudioCore.schema(parsed.root, JsonCore.parse(payload.schema).root);
    default:
      throw new Error('Unknown analysis kind: ' + kind);
  }
}
