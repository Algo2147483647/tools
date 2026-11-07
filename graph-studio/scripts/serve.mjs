import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildServer } from "./build-server.mjs";

export async function serve(root, options = {}) {
  const { LocalService, defaultStateDirectory, createApplication, openExternal, closePlatformProcesses } = await import(
    pathToFileURL(await buildServer(root)).href
  );
  const service = new LocalService(
    process.env.GRAPH_STUDIO_STATE_DIR || defaultStateDirectory(),
    join(root, "public/examples"),
  );
  await service.initialize();
  let app;
  let stopping;
  const shutdown = () =>
    (stopping ||= (async () => {
      closePlatformProcesses();
      app?.closeEvents();
      const closed =
        app &&
        new Promise((resolve) => {
          app.server.close(resolve);
          app.server.closeAllConnections();
        });
      await closed;
      await service.close();
    })());
  try {
    app = createApplication(service, {
      staticDirectory: join(root, "dist"),
    });
    await new Promise((resolve, reject) => {
      app.server.once("error", reject);
      app.server.listen(Number(process.env.GRAPH_STUDIO_PORT || 0), "127.0.0.1", resolve);
    });
    const url = `http://127.0.0.1:${app.server.address().port}`;
    console.log(`Graph Studio frontend + backend ready: ${url}`);
    console.log(`User state: ${service.stateDirectory}`);
    console.log("Press Ctrl+C to stop both services.");
    if (!options.noBrowser)
      await openExternal(url).catch((error) => console.error(`Open ${url} in your browser. ${error.message}`));
    const onSignal = () => {
      void shutdown().then(() => {
        process.exitCode = 0;
      });
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    app.server.once("close", () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    });
    return { url, close: shutdown };
  } catch (error) {
    await shutdown();
    throw error;
  }
}
