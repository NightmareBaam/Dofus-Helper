import type { IncomingMessage, ServerResponse } from "node:http";
import { linksStorage } from "../services/linksStorage.js";

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

export function handleLinksRoute(context: RouteContext): boolean {
  const { request, response, pathname, bodyText } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "api" || segments[1] !== "links") {
    return false;
  }

  const body = parseJsonBody(bodyText);
  if (body === null) {
    reply(response, 400, { ok: false, message: "Payload JSON invalide." });
    return true;
  }

  if (segments.length === 2 && method === "GET") {
    reply(response, 200, linksStorage.list());
    return true;
  }

  if (segments.length === 3 && segments[2] === "groups" && method === "POST") {
    reply(response, 200, linksStorage.addGroup(String(body.name ?? "")));
    return true;
  }

  if (segments.length === 4 && segments[2] === "groups" && segments[3] === "reorder" && method === "POST") {
    reply(response, 200, linksStorage.saveGroupOrder(Array.isArray(body.groupIds) ? body.groupIds.map(String) : []));
    return true;
  }

  if (segments.length === 4 && segments[2] === "groups") {
    const groupId = segments[3];

    if (method === "PATCH") {
      if (typeof body.collapsed !== "undefined") {
        reply(response, 200, linksStorage.setGroupCollapsed(groupId, Boolean(body.collapsed)));
        return true;
      }
      reply(response, 200, linksStorage.renameGroup(groupId, String(body.name ?? "")));
      return true;
    }

    if (method === "DELETE") {
      reply(response, 200, linksStorage.deleteGroup(groupId));
      return true;
    }
  }

  if (segments.length === 6 && segments[2] === "groups" && segments[4] === "links" && segments[5] === "reorder" && method === "POST") {
    reply(response, 200, linksStorage.saveLinkOrder(segments[3], Array.isArray(body.linkIds) ? body.linkIds.map(String) : []));
    return true;
  }

  if (segments.length === 5 && segments[2] === "groups" && segments[4] === "links" && method === "POST") {
    reply(response, 200, linksStorage.addLink(segments[3], String(body.label ?? ""), String(body.url ?? "")));
    return true;
  }

  if (segments.length === 6 && segments[2] === "groups" && segments[4] === "links") {
    const groupId = segments[3];
    const linkId = segments[5];

    if (method === "PATCH") {
      reply(response, 200, linksStorage.updateLink(groupId, linkId, String(body.label ?? ""), String(body.url ?? "")));
      return true;
    }

    if (method === "DELETE") {
      reply(response, 200, linksStorage.deleteLink(groupId, linkId));
      return true;
    }
  }

  reply(response, 404, { ok: false, message: `Unknown links route: ${method} ${pathname}` });
  return true;
}