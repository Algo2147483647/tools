import {createHash} from 'node:crypto';
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
