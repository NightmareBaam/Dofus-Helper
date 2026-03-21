import type { IncomingMessage, ServerResponse } from "node:http";
import { charactersStorage } from "../services/charactersStorage.js";
import { autofocusService } from "../services/autofocusService.js";
import { runtimeStateService } from "../services/runtimeStateService.js";
import { shortcutsService } from "../services/shortcutsService.js";

interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  pathname: string;
  bodyText: string;
  url: URL;
}

function reply(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function ensureCharactersSnapshot() {
  const existing = runtimeStateService.getCharactersPayload();
  if (existing) {
    return existing;
  }
  const payload = await charactersStorage.list();
  runtimeStateService.publishCharacters(payload);
  return payload;
}

export async function handleRuntimeRoute(context: RouteContext): Promise<boolean> {
  const { request, response, pathname, url } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "runtime") {
    return false;
  }

  if (segments.length === 2 && method === "GET") {
    const charactersPayload = await ensureCharactersSnapshot();
    reply(response, 200, {
      ok: true,
      charactersRevision: runtimeStateService.getCharactersRevision(),
      charactersPayload,
      autofocusState: autofocusService.getState(true),
      shortcutsState: shortcutsService.getState(),
    });
    return true;
  }

  if (segments.length === 3 && segments[2] === "poll" && method === "GET") {
    await ensureCharactersSnapshot();
    const lastCharactersRevision = Number.parseInt(url.searchParams.get("lastCharactersRevision") ?? "0", 10);
    const lastAutofocusLogId = Number.parseInt(url.searchParams.get("lastAutofocusLogId") ?? "0", 10);
    const lastShortcutEventId = Number.parseInt(url.searchParams.get("lastShortcutEventId") ?? "0", 10);
    const autofocusPayload = autofocusService.poll(Number.isFinite(lastAutofocusLogId) ? lastAutofocusLogId : 0);
    const shortcutsPayload = shortcutsService.poll(Number.isFinite(lastShortcutEventId) ? lastShortcutEventId : 0);
    const charactersRevision = runtimeStateService.getCharactersRevision();
    const safeCharactersRevision = Number.isFinite(lastCharactersRevision) ? lastCharactersRevision : 0;

    reply(response, 200, {
      ok: true,
      charactersRevision,
      charactersPayload: charactersRevision > safeCharactersRevision ? runtimeStateService.getCharactersPayload() : null,
      autofocusLogs: autofocusPayload.logs,
      autofocusState: autofocusPayload.state,
      shortcutEvents: shortcutsPayload.shortcutEvents,
      shortcutsState: shortcutsPayload.shortcutsState,
    });
    return true;
  }

  reply(response, 404, { ok: false, message: `Unknown runtime route: ${method} ${pathname}` });
  return true;
}
