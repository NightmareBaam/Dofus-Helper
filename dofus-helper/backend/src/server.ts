import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleAutofocusRoute } from "./routes/autofocusRoutes.js";
import { handleCharactersRoute } from "./routes/charactersRoutes.js";
import { handleCraftsRoute } from "./routes/craftRoutes.js";
import { handleLinksRoute } from "./routes/linksRoutes.js";
import { handleRetroFamiliarsRoute } from "./routes/retroFamiliarsRoutes.js";
import { handleRuntimeRoute } from "./routes/runtimeRoutes.js";
import { handleShortcutsRoute } from "./routes/shortcutsRoutes.js";
import { handleSystemRoute } from "./routes/systemRoutes.js";
import { resolveBackendPort } from "./services/healthService.js";

const port = resolveBackendPort();

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    request.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    });
    request.on("end", () => resolve(chunks.join("")));
    request.on("error", reject);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if ((request.method ?? "GET") === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const bodyText = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method ?? "GET")
    ? await readRequestBody(request)
    : "";

  if (handleSystemRoute(url.pathname, response)) {
    return;
  }

  if (await handleRuntimeRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  if (handleLinksRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  if (handleRetroFamiliarsRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  if (handleAutofocusRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  if (handleShortcutsRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  if (await handleCharactersRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  if (handleCraftsRoute({ request, response, pathname: url.pathname, bodyText, url })) {
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, message: `Unknown route: ${url.pathname}` }));
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "Unexpected server error" }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[dofus-helper-backend] listening on http://127.0.0.1:${port}`);
});
