import type { IncomingMessage, ServerResponse } from "node:http";
import { craftsStorage } from "../services/craftsStorage.js";

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

export function handleCraftsRoute(context: RouteContext): boolean {
  const { request, response, pathname, bodyText, url } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "crafts") {
    return false;
  }

  const body = parseJsonBody(bodyText);
  if (body === null) {
    reply(response, 400, { ok: false, message: "Payload JSON invalide." });
    return true;
  }

  if (segments.length === 2 && method === "GET") {
    reply(response, 200, craftsStorage.list());
    return true;
  }

  if (segments.length === 4 && segments[2] === "catalog" && segments[3] === "search" && method === "GET") {
    reply(
      response,
      200,
      craftsStorage.searchCatalog(
        url.searchParams.get("query") ?? "",
        Number.parseInt(url.searchParams.get("limit") ?? "12", 10) || 12,
        url.searchParams.get("source") ?? "all",
      ),
    );
    return true;
  }

  if (segments.length === 2 && method === "POST") {
    reply(response, 200, craftsStorage.addCraft(String(body.name ?? ""), Number(body.sellPrice ?? body.sell_price ?? 0), Number(body.targetQuantity ?? body.target_quantity ?? 1), String(body.itemKey ?? body.item_key ?? "").trim() || null));
    return true;
  }

  if (segments.length === 3 && segments[2] === "collapse-all" && method === "PATCH") {
    reply(response, 200, craftsStorage.setAllCollapsed(Boolean(body.collapsed)));
    return true;
  }

  if (segments.length === 3 && segments[2] === "reorder" && method === "POST") {
    reply(response, 200, craftsStorage.saveOrder(Array.isArray(body.craftIds) ? body.craftIds.map(String) : []));
    return true;
  }

  if (segments.length === 3) {
    const craftId = segments[2];

    if (method === "PATCH") {
      reply(response, 200, craftsStorage.updateCraft(craftId, String(body.name ?? ""), Number(body.sellPrice ?? body.sell_price ?? 0), Number(body.targetQuantity ?? body.target_quantity ?? 1), String(body.itemKey ?? body.item_key ?? "").trim() || null));
      return true;
    }

    if (method === "DELETE") {
      reply(response, 200, craftsStorage.deleteCraft(craftId));
      return true;
    }
  }

  if (segments.length === 4 && segments[3] === "target-quantity" && method === "PATCH") {
    reply(response, 200, craftsStorage.setTargetQuantity(segments[2], Number(body.targetQuantity ?? body.target_quantity ?? 1)));
    return true;
  }

  if (segments.length === 4 && segments[3] === "collapsed" && method === "PATCH") {
    reply(response, 200, craftsStorage.setCollapsed(segments[2], Boolean(body.collapsed)));
    return true;
  }

  if (segments.length === 4 && segments[3] === "resources" && method === "POST") {
    reply(response, 200, craftsStorage.addResource(segments[2], String(body.name ?? ""), Number(body.unitPrice ?? body.unit_price ?? 0), Number(body.quantity ?? 1), Number(body.ownedQuantity ?? body.owned_quantity ?? 0), Boolean(body.included ?? true)));
    return true;
  }

  if (segments.length === 5 && segments[3] === "resources") {
    if (method === "PATCH") {
      reply(response, 200, craftsStorage.updateResource(segments[2], segments[4], String(body.name ?? ""), Number(body.unitPrice ?? body.unit_price ?? 0), Number(body.quantity ?? 1), Number(body.ownedQuantity ?? body.owned_quantity ?? 0), Boolean(body.included ?? true)));
      return true;
    }
    if (method === "DELETE") {
      reply(response, 200, craftsStorage.deleteResource(segments[2], segments[4]));
      return true;
    }
  }

  reply(response, 404, { ok: false, message: `Unknown crafts route: ${method} ${pathname}` });
  return true;
}
