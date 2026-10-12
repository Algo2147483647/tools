import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Both paths are fixed children of this project, independent of the caller's cwd.
const source = fileURLToPath(new URL('../public/', import.meta.url));
const destination = fileURLToPath(new URL('../dist/', import.meta.url));
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log('Static build ready in dist/.');
