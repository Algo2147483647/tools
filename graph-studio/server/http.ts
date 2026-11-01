import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { LocalService } from "./service";
import { choosePath, type DialogKind } from "./platform";
import { ServiceError, within, MAX_FILE_BYTES } from "./files";

const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".md": "text/markdown",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const mime = (path: string) => types[extname(path).toLowerCase()] || "application/octet-stream";
const json = (response: ServerResponse, data: unknown, status = 200) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(data));
};
async function body(request: IncomingMessage) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new ServiceError("JSON_REQUIRED", "JSON content type required.", 415);
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_FILE_BYTES + 1024 * 1024) throw new ServiceError("BODY_TOO_LARGE", "Request body too large.", 413);
    parts.push(bytes);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
export function createApplication(
  service: LocalService,
  options: {
    staticDirectory: string;
    frontend?: Middleware;
    dialog?: typeof choosePath;
  },
) {
  const token = randomBytes(32).toString("hex");
  const sessions = new Set<ServerResponse>();
  const consumers = new Map<string, number>();
  let dialogBusy = false;
  const dialog = async (kind: DialogKind, name?: string) => {
    if (dialogBusy) throw new ServiceError("DIALOG_BUSY", "A system file dialog is already open.", 409);
    dialogBusy = true;
    try {
      return await (options.dialog || choosePath)(kind, name);
    } finally {
      dialogBusy = false;
    }
  };
  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    const host = request.headers.host || "";
    const remote = request.socket.remoteAddress || "";
    if (
      !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)
    )
      return json(response, { error: { code: "LOCAL_ONLY", message: "Local access required." } }, 403);
    const url = new URL(request.url || "/", `http://${host}`);
    if (!url.pathname.startsWith("/api/")) {
      if (options.frontend)
        return options.frontend(request, response, () => {
          response.statusCode = 404;
          response.end("Not found");
        });
      try {
        const root = await realpath(options.staticDirectory);
        let path = within(root, resolve(root, "." + decodeURIComponent(url.pathname)));
        if (url.pathname === "/") path = join(root, "index.html");
        path = within(root, await realpath(path));
        response.setHeader("Content-Type", mime(path));
        response.end(await readFile(path));
      } catch {
        response.statusCode = 404;
        response.end("Not found");
      }
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    try {
      const origin = request.headers.origin;
      if ((origin && origin !== `http://${host}`) || request.headers["sec-fetch-site"] === "cross-site")
        throw new ServiceError("ORIGIN_DENIED", "Same-origin access required.", 403);
      if (url.pathname === "/api/v1/session" && request.method === "GET") {
        response.setHeader("Set-Cookie", `graph_studio_session=${token}; HttpOnly; SameSite=Strict; Path=/api`);
        return json(response, { token, version: 1 });
      }
      const cookie = request.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .includes(`graph_studio_session=${token}`);
      const authenticated = request.headers["x-graph-studio-token"] === token;
      if (!cookie || (!authenticated && url.pathname !== "/api/v1/events"))
        throw new ServiceError("SESSION_REQUIRED", "Reload Graph Studio to reconnect to its local service.", 401);
      if (request.method !== "GET" && origin !== `http://${host}`)
        throw new ServiceError("ORIGIN_DENIED", "Same-origin write required.", 403);
      const path = url.pathname.slice("/api/v1".length);
      const method = request.method;
      if (path === "/events" && method === "GET") {
        const locationId = url.searchParams.get("locationId");
        if (locationId) {
          service.watchLocation(locationId);
          consumers.set(locationId, (consumers.get(locationId) || 0) + 1);
        }
        response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
        response.write("event: ready\ndata: {}\n\n");
        sessions.add(response);
        const listener = (event: unknown) => response.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
        service.events.on("change", listener);
        const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15000);
        request.on("close", () => {
          clearInterval(heartbeat);
          service.events.off("change", listener);
          sessions.delete(response);
          if (locationId) {
            const count = (consumers.get(locationId) || 1) - 1;
            if (count) consumers.set(locationId, count);
            else {
              consumers.delete(locationId);
              service.stopWatching(locationId);
            }
          }
        });
        return;
      }
      if (path === "/recents" && method === "GET") return json(response, await service.recent());
      if (path === "/recents" && method === "DELETE") {
        const input = await body(request);
        await service.removeRecent(input.ids);
        return json(response, {});
      }
      if (path.startsWith("/dialogs/") && method === "POST") {
        const kind = path.slice(9);
        const input = await body(request);
        if (!["directory", "file", "save"].includes(kind))
          throw new ServiceError("INVALID_DIALOG", "Unknown dialog kind.");
        return json(response, { path: await dialog(kind as DialogKind, input.name) });
      }
      if (path === "/workspaces/open" && method === "POST") {
        const input = await body(request);
        const record = await service.register(input.path, "workspace", { id: input.id });
        return json(response, await service.snapshot(record.id));
      }
      if (path === "/workspaces" && method === "POST") {
        const input = await body(request);
        return json(response, await service.create(input.parent, input.name), 201);
      }
      if (path === "/files/open" && method === "POST") {
        const input = await body(request);
        return json(
          response,
          await service.register(input.path, "file", { id: input.id, allowMissing: input.saveAs === true }),
        );
      }
      if (path === "/examples/open" && method === "POST") {
        const input = await body(request);
        if (typeof input.id !== "string" || !/^[a-z0-9-]+$/.test(input.id))
          throw new ServiceError("INVALID_EXAMPLE", "Invalid example ID.");
        const exampleId = input.id === "europe-history" ? "china-history" : input.id;
        const root = await realpath(service.examplesDirectory);
        const location = within(root, await realpath(join(root, exampleId)));
        const record = await service.register(location, "workspace", { exampleId });
        return json(response, await service.snapshot(record.id));
      }
      const match = /^\/(workspaces|files)\/([^/]+)(?:\/(.*))?$/.exec(path);
      if (!match) throw new ServiceError("NOT_FOUND", "Unknown API endpoint.", 404);
      const [, , id, operation = ""] = match;
      const file = url.searchParams.get("path") || "";
      if (!operation && method === "GET") return json(response, await service.reopen(id));
      if (operation === "close" && method === "POST") {
        service.stopWatching(id);
        return json(response, {});
      }
      if (operation === "session" && method === "PATCH")
        return json(response, await service.session(id, (await body(request)).lastGraph));
      if (operation === "files" && method === "GET") {
        const files = await service.listFiles(id);
        const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
        return json(response, {
          files: files.slice(offset, offset + 500),
          nextOffset: offset + 500 < files.length ? offset + 500 : null,
        });
      }
      if (operation === "graphs" && method === "GET") {
        const snapshot = await service.snapshot(id);
        return json(response, { graphs: snapshot.graphs, notices: snapshot.notices });
      }
      if (operation === "file" && method === "GET") {
        const data = await service.read(id, file);
        response.setHeader("Content-Type", mime(file));
        response.setHeader("X-File-Revision", data.revision);
        response.end(data.bytes);
        return;
      }
      if (operation === "file" && method === "PUT") {
        const input = await body(request);
        return json(response, await service.write(id, file, input.content, input.expectedRevision));
      }
      if (operation === "open-external" && method === "POST")
        return json(response, await service.openFile(id, (await body(request)).path));
      if (operation === "linked-document" && method === "POST") {
        const input = await body(request);
        return json(response, await service.saveLinked(id, input.graphPath, input));
      }
      throw new ServiceError("NOT_FOUND", "Unknown API operation.", 404);
    } catch (error: any) {
      const status =
        error.status ||
        (error.code === "ENOENT"
          ? 404
          : error.code === "EEXIST"
            ? 409
            : error.code === "EACCES" || error.code === "EPERM"
              ? 403
              : 400);
      json(
        response,
        { error: { code: error.code || "REQUEST_FAILED", message: error.message || "Request failed." } },
        status,
      );
    }
  };
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  return {
    server,
    closeEvents() {
      for (const res of sessions) res.end();
    },
  };
}
