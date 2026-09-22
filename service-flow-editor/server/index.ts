import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { RepositoryError, WorkspaceRepository } from './repository.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bodyLimit = 32 * 1024 * 1024;

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json'))
    throw new RepositoryError('Requests must use application/json.', 415);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) throw new RepositoryError('The request exceeds the 32 MB size limit.', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch {
    throw new RepositoryError('Request body must contain a valid JSON object.');
  }
}

function assertLocalRequest(request: IncomingMessage) {
  const localNames = new Set(['localhost', '127.0.0.1', '[::1]']);
  try {
    if (!localNames.has(new URL(`http://${request.headers.host || ''}`).hostname)) throw new Error('host');
    const origin = request.headers.origin;
    if (
      origin &&
      (!['http:', 'https:'].includes(new URL(origin).protocol) || !localNames.has(new URL(origin).hostname))
    )
      throw new Error('origin');
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new Error('cross-site');
  } catch {
    throw new RepositoryError(
      'Only local browser sessions may access this application.',
      403,
      'FORBIDDEN_ORIGIN',
    );
  }
}

async function pickFolder(create: boolean): Promise<string | null> {
  if (process.platform !== 'win32')
    throw new RepositoryError(
      'The native folder picker is available on Windows. Enter a folder path instead.',
      501,
    );
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$picker = [System.Windows.Forms.FolderBrowserDialog]::new()
$picker.Description = '${create ? 'Choose or create a folder for your workspace' : 'Choose a workspace folder'}'
$picker.ShowNewFolderButton = $${create ? 'true' : 'false'}
try {
  if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($picker.SelectedPath) }
} finally { $picker.Dispose() }
`;
  // A hidden PowerShell host opens only the intentional folder selection dialog.
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new RepositoryError('Folder selection timed out. Enter a folder path or try again.', 408));
    }, 180_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new RepositoryError(`Cannot open the folder picker: ${error.message}`, 500));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0)
        reject(
          new RepositoryError(
            `Cannot open the folder picker. Enter a folder path instead. ${stderr.trim()}`,
            500,
          ),
        );
      else resolve(stdout.trim() || null);
    });
  });
}

export function createAppServer(repository = new WorkspaceRepository()) {
  const sessions = new Map<string, string>();
  function session(token: unknown) {
    const directory = typeof token === 'string' ? sessions.get(token) : undefined;
    if (!directory)
      throw new RepositoryError('Workspace session expired. Reopen the workspace.', 401, 'TOKEN_EXPIRED');
    return directory;
  }
  return createServer(async (request, response) => {
    try {
      assertLocalRequest(request);
      const url = new URL(request.url || '/', `http://${request.headers.host}`);
      if (url.pathname === '/api/health' && request.method === 'GET')
        return json(response, 200, { ok: true });
      if (url.pathname === '/api/workspace/open' && request.method === 'POST') {
        const input = await body(request);
        if (
          typeof input.path !== 'string' ||
          (input.create !== undefined && typeof input.create !== 'boolean') ||
          (input.name !== undefined && typeof input.name !== 'string')
        )
          throw new RepositoryError(
            'A folder path, optional create flag, and optional workspace name are required.',
          );
        const opened = await repository.open(input.path, {
          create: input.create as boolean | undefined,
          name: input.name as string | undefined,
        });
        const token = randomBytes(32).toString('hex');
        sessions.set(token, opened.path);
        return json(response, 200, { ...opened, token });
      }
      if (url.pathname === '/api/workspace/save' && request.method === 'POST') {
        const input = await body(request);
        return json(response, 200, await repository.save(session(input.token), input.workspace));
      }
      if (url.pathname === '/api/workspace/pick' && request.method === 'POST') {
        const input = await body(request);
        return json(response, 200, { path: await pickFolder(input.create === true) });
      }
      if (url.pathname === '/api/document' && request.method === 'GET')
        return json(
          response,
          200,
          await repository.readDocument(
            session(url.searchParams.get('token')),
            url.searchParams.get('key') || '',
          ),
        );
      if (url.pathname === '/api/document' && request.method === 'PUT') {
        const input = await body(request);
        if (typeof input.key !== 'string' || typeof input.content !== 'string')
          throw new RepositoryError('A service key and text content are required.');
        return json(
          response,
          200,
          await repository.writeDocument(session(input.token), input.key, input.content),
        );
      }
      if (url.pathname.startsWith('/api/'))
        return json(response, 404, { error: 'API endpoint was not found.' });
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return json(response, 405, { error: 'Method is not allowed.' });
      const root = path.join(projectRoot, 'dist');
      let relative: string;
      try {
        relative = decodeURIComponent(url.pathname);
      } catch {
        throw new RepositoryError('Invalid URL.');
      }
      let filename = path.resolve(root, `.${relative}`);
      if (!filename.startsWith(root + path.sep) && filename !== root)
        throw new RepositoryError('Path is not allowed.', 403);
      let stat = await fs.stat(filename).catch(() => null);
      if (!stat?.isFile()) {
        filename = path.join(root, 'index.html');
        stat = await fs.stat(filename).catch(() => null);
      }
      if (!stat?.isFile())
        return json(response, 404, {
          error: 'The application has not been built. Run npm run build, or use npm run dev.',
        });
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.json': 'application/json; charset=utf-8',
      };
      response.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': path.extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : await fs.readFile(filename));
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof RepositoryError)
        json(response, error.status, { error: error.message, code: error.code });
      else {
        console.error('Request failed:', error);
        json(response, 500, {
          error: `The operation failed: ${(error as Error).message}. Your current edits remain available; fix the issue and retry.`,
          code: 'FILESYSTEM_ERROR',
        });
      }
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4319);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  const server = createAppServer();
  server.on('error', (error) => {
    console.error(`Cannot start Service Atlas: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Service Atlas is running at ${url}`);
    if (process.argv.includes('--open') && ['win32', 'darwin'].includes(process.platform)) {
      const opener = process.platform === 'darwin' ? '/usr/bin/open' : 'explorer.exe';
      const browser = spawn(opener, [url], { windowsHide: true, detached: true, stdio: 'ignore' });
      browser.on('error', (error) =>
        console.error(`Open ${url} in your browser. Automatic browser launch failed: ${error.message}`),
      );
      browser.unref();
    }
  });
}
