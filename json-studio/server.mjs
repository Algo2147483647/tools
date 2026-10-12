import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** Serve only public assets. JSON documents stay entirely in the browser. */
export function createAppServer({ root = resolve(projectRoot, 'public') } = {}) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }

    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const asset = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (asset.includes('\0') || asset.includes('\\') || asset.split('/').includes('..')) {
        response.writeHead(400).end('Invalid path');
        return;
      }
      const base = await realpath(root);
      const file = await realpath(resolve(base, asset));
      const inside = relative(base, file);
      if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!(await stat(file)).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
        'Content-Length': body.byteLength,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status =
        error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
      response.writeHead(status).end(status === 500 ? 'Internal server error' : 'Not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const port = Number(portIndex === -1 ? 4189 : args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Port must be an integer between 1 and 65535.');
    process.exit(1);
  }
  const server = createAppServer({
    root: resolve(projectRoot, args.includes('--dist') ? 'dist' : 'public'),
  });
  server.on('error', (error) => {
    console.error('Could not start JSON Studio: ' + error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`JSON Studio: http://127.0.0.1:${port}/`);
    console.log('Press Ctrl+C to stop.');
  });
}
