import type { IncomingMessage, ServerResponse } from "node:http";
import { charactersStorage } from "../services/charactersStorage.js";
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

export async function handleCharactersRoute(context: RouteContext): Promise<boolean> {
  const { request, response, pathname, bodyText } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "characters") {
    return false;
  }

  const body = parseJsonBody(bodyText);
  if (body === null) {
    reply(response, 400, { ok: false, message: "Payload JSON invalide." });
    return true;
  }

  if (segments.length === 2 && method === "GET") {
    const payload = await charactersStorage.list();
    runtimeStateService.publishCharacters(payload);
    reply(response, 200, payload);
    return true;
  }

  if (segments.length === 3 && segments[2] === "refresh" && method === "POST") {
    const payload = await charactersStorage.refresh();
    runtimeStateService.publishCharacters(payload);
    reply(response, 200, payload);
    return true;
  }

  if (segments.length === 3 && segments[2] === "filters" && method === "PATCH") {
    const payload = await charactersStorage.setFilter(String(body.gameType ?? ""), Boolean(body.enabled));
    runtimeStateService.publishCharacters(payload);
    reply(response, 200, payload);
    return true;
  }

  if (segments.length === 3 && segments[2] === "copy-mp" && method === "PATCH") {
    const payload = await charactersStorage.setCopyMpSender(Boolean(body.enabled));
    runtimeStateService.publishCharacters(payload);
    reply(response, 200, payload);
    return true;
  }

  if (segments.length === 3 && segments[2] === "order" && method === "POST") {
    const payload = await charactersStorage.saveOrder(Array.isArray(body.hwnds) ? body.hwnds.map(Number) : []);
    runtimeStateService.publishCharacters(payload);
    reply(response, 200, payload);
    return true;
  }

  if (segments.length === 3 && segments[2] === "rules" && method === "PATCH") {
    const payload = await charactersStorage.setAllRules(String(body.notifType ?? ""), Boolean(body.enabled));
    runtimeStateService.publishCharacters(payload);
    reply(response, payload.ok ? 200 : 400, payload);
    return true;
  }

  if (segments.length === 4 && segments[2] === "rules" && method === "PATCH") {
    const payload = await charactersStorage.setRule(decodeURIComponent(segments[3]), String(body.notifType ?? ""), Boolean(body.enabled));
    runtimeStateService.publishCharacters(await charactersStorage.refresh());
    reply(response, payload.ok ? 200 : 400, payload);
    return true;
  }

  if (segments.length === 4 && segments[2] === "rotation" && method === "PATCH") {
    const payload = await charactersStorage.setRotation(decodeURIComponent(segments[3]), Boolean(body.enabled));
    runtimeStateService.publishCharacters(await charactersStorage.refresh());
    reply(response, 200, payload);
    return true;
  }

  if (segments.length === 4 && segments[2] === "shortcuts" && method === "PATCH") {
    try {
      await shortcutsService.setCharacterShortcut(decodeURIComponent(segments[3]), body.value === null ? null : String(body.value ?? ""));
      const payload = await charactersStorage.refresh();
      runtimeStateService.publishCharacters(payload);
      reply(response, 200, payload);
    } catch (error) {
      reply(response, 400, { ok: false, message: error instanceof Error ? error.message : "Raccourci personnage invalide." });
    }
    return true;
  }

  if (segments.length === 4 && segments[2] === "focus" && method === "POST") {
    reply(response, 200, await charactersStorage.focusWindow(Number(segments[3])));
    return true;
  }

  reply(response, 404, { ok: false, message: `Unknown characters route: ${method} ${pathname}` });
  return true;
}
