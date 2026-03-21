import type { IncomingMessage, ServerResponse } from "node:http";
import { autofocusService } from "../services/autofocusService.js";

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

export function handleAutofocusRoute(context: RouteContext): boolean {
  const { request, response, pathname, bodyText, url } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "autofocus") {
    return false;
  }

  const body = parseJsonBody(bodyText);
  if (body === null) {
    reply(response, 400, { ok: false, message: "Payload JSON invalide." });
    return true;
  }

  if (segments.length === 2 && method === "GET") {
    reply(response, 200, { ok: true, autofocusState: autofocusService.getState(true) });
    return true;
  }

  if (segments.length === 3 && segments[2] === "poll" && method === "GET") {
    const lastLogId = Number.parseInt(url.searchParams.get("lastLogId") ?? "0", 10);
    const payload = autofocusService.poll(Number.isFinite(lastLogId) ? lastLogId : 0);
    reply(response, 200, { ok: true, autofocusLogs: payload.logs, autofocusState: payload.state });
    return true;
  }

  if (segments.length === 3 && segments[2] === "types" && method === "PATCH") {
    try {
      const state = autofocusService.setTypeEnabled(String(body.notifType ?? ""), Boolean(body.enabled));
      reply(response, 200, { ok: true, autofocusState: state });
    } catch (error) {
      reply(response, 400, { ok: false, message: error instanceof Error ? error.message : "Type AutoFocus invalide." });
    }
    return true;
  }

  if (segments.length === 3 && segments[2] === "debug" && method === "PATCH") {
    const state = autofocusService.setDebug(Boolean(body.enabled));
    reply(response, 200, { ok: true, autofocusState: state });
    return true;
  }

  reply(response, 404, { ok: false, message: `Unknown autofocus route: ${method} ${pathname}` });
  return true;
}
