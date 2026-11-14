import path from 'node:path';
import fs from 'node:fs';
// Emitted platform modules live at <app>/build/backend/platform.
export const appRoot = path.resolve(__dirname, '../../..');
export function runtimeDirectory(name: string, developmentName = name): string {
    const resources = process.resourcesPath;
    const packaged = resources && path.join(resources, name);
    if (packaged && fs.existsSync(packaged))
        return packaged;
    const adjacent = path.resolve(appRoot, '..', name);
    if (fs.existsSync(adjacent))
        return adjacent;
    return path.resolve(appRoot, '../.runtime', developmentName);
}
export function engineFile(name: string): string {
    const resources = process.resourcesPath;
    const packaged = resources && path.join(resources, 'math-engine', name);
    if (packaged && fs.existsSync(packaged))
        return packaged;
    const adjacent = path.resolve(appRoot, '../math-engine', name);
    return fs.existsSync(adjacent) ? adjacent : path.join(appRoot, 'engine', name);
}
