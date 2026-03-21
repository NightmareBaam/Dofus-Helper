import type { IncomingMessage, ServerResponse } from "node:http";
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

function parseJsonBody(bodyText: string): Record<string, unknown> | null {
  if (!bodyText.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function handleShortcutsRoute(context: RouteContext): boolean {
  const { request, response, pathname, bodyText, url } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "shortcuts") {
    return false;
  }

  const body = parseJsonBody(bodyText);
  if (body === null) {
    reply(response, 400, { ok: false, message: "Payload JSON invalide." });
    return true;
  }

  if (segments.length === 2 && method === "GET") {
    reply(response, 200, { ok: true, shortcutsState: shortcutsService.getState() });
    return true;
  }

  if (segments.length === 3 && segments[2] === "poll" && method === "GET") {
    const lastEventId = Number.parseInt(url.searchParams.get("lastEventId") ?? "0", 10);
    const payload = shortcutsService.poll(Number.isFinite(lastEventId) ? lastEventId : 0);
    reply(response, 200, { ok: true, shortcutEvents: payload.shortcutEvents, shortcutsState: payload.shortcutsState });
    return true;
  }

  if (segments.length === 3 && segments[2] === "apply" && method === "POST") {
    reply(response, 200, { ok: true, shortcutsState: shortcutsService.applyShortcuts(false) });
    return true;
  }

  if (segments.length === 3 && segments[2] === "debug" && method === "PATCH") {
    reply(response, 200, { ok: true, shortcutsState: shortcutsService.setDebug(Boolean(body.enabled)) });
    return true;
  }

  if (segments.length === 3 && method === "PATCH") {
    try {
      const state = shortcutsService.setShortcut(segments[2], body.value === null ? null : String(body.value ?? ""));
      reply(response, 200, { ok: true, shortcutsState: state });
    } catch (error) {
      reply(response, 400, { ok: false, message: error instanceof Error ? error.message : "Action de raccourci invalide." });
    }
    return true;
  }

  reply(response, 404, { ok: false, message: `Unknown shortcuts route: ${method} ${pathname}` });
  return true;
}
