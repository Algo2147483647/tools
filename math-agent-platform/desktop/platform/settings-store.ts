const fs = require('node:fs/promises') as typeof import('node:fs/promises'), path = require('node:path') as typeof import('node:path'), { createHash } = require('node:crypto') as typeof import('node:crypto');
class SettingsStore {
    file: string;
    crypto: any;
    cache: Map<any, any>;
    queue: Promise<void>;
    constructor(directory: string, crypto: any) { this.file = path.join(directory, 'ai-settings.json'); this.crypto = crypto; this.cache = new Map(); this.queue = Promise.resolve(); }
    async load() { try {
        const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
        if (saved.version !== 1)
            throw Error('Unsupported settings version');
        let apiKey = '';
        if (saved.key) {
            const decrypted = await this.crypto.decryptStringAsync(Buffer.from(saved.key, 'base64'));
            apiKey = decrypted.result;
        }
        for (const [key, value] of saved.models || [])
            this.cache.set(key, value);
        return { ...saved.settings, apiKey };
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return null;
        throw Error('Saved AI settings could not be opened. Reapply Settings to replace them.');
    } }
    key(settings: any) { return createHash('sha256').update(settings.provider + '\n' + settings.baseUrl + '\n' + (settings.apiKey || '')).digest('hex'); }
    models(settings: any) { const item = this.cache.get(this.key(settings)); return item && Date.now() - item.at < 86400000 ? item.models : null; }
    save(settings: any) { const snapshot = { ...settings }; const action = async () => { const { apiKey, ...plain } = snapshot; const key = apiKey ? (await this.crypto.encryptStringAsync(apiKey)).toString('base64') : null; await fs.mkdir(path.dirname(this.file), { recursive: true }); const temporary = this.file + '.tmp'; await fs.writeFile(temporary, JSON.stringify({ version: 1, settings: plain, key, models: [...this.cache].slice(-20) }), { mode: 0o600 }); await fs.rename(temporary, this.file); }; this.queue = this.queue.then(action, action); return this.queue; }
}
export { SettingsStore };
