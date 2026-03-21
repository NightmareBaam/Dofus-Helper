import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, resolve } from "node:path";
import { retroFamiliarsStorage } from "../services/retroFamiliarsStorage.js";
import { resolveRetroFamiliarImageDirectories } from "../services/runtimePaths.js";

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

function imageContentType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  return "image/svg+xml";
}

function resolveImagePath(fileName: string): string | null {
  const safeFileName = basename(fileName);
  if (!safeFileName) {
    return null;
  }
  for (const directory of resolveRetroFamiliarImageDirectories()) {
    const candidate = resolve(directory, safeFileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function replyWithImage(response: ServerResponse, imageName: string): void {
  const imagePath = resolveImagePath(imageName);
  if (!imagePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Image introuvable.");
    return;
  }
  response.writeHead(200, {
    "Content-Type": imageContentType(imagePath),
    "Cache-Control": "public, max-age=86400",
  });
  response.end(readFileSync(imagePath, "utf8"));
}

export function handleRetroFamiliarsRoute(context: RouteContext): boolean {
  const { request, response, pathname, bodyText } = context;
  const method = request.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "api" || segments[1] !== "familiars" || segments[2] !== "retro") {
    return false;
  }

  if (segments.length === 5 && segments[3] === "images" && method === "GET") {
    replyWithImage(response, decodeURIComponent(segments[4] ?? ""));
    return true;
  }

  const body = parseJsonBody(bodyText);
  if (body === null) {
    reply(response, 400, { ok: false, message: "Payload JSON invalide." });
    return true;
  }

  if (segments.length === 3 && method === "GET") {
    reply(response, 200, retroFamiliarsStorage.list());
    return true;
  }

  if (segments.length === 4 && segments[3] === "summary" && method === "GET") {
    reply(response, 200, retroFamiliarsStorage.summary());
    return true;
  }

  if (segments.length === 4 && segments[3] === "entries" && method === "POST") {
    reply(
      response,
      200,
      retroFamiliarsStorage.add(
        String(body.familiarKey ?? body.familiar_key ?? ""),
        String(body.serverName ?? body.server_name ?? "").trim() || null,
        String(body.characterName ?? body.character_name ?? "").trim() || null,
      ),
    );
    return true;
  }

  if (segments.length === 5 && segments[3] === "entries" && method === "PATCH") {
    reply(
      response,
      200,
      retroFamiliarsStorage.update(segments[4], {
        serverName: typeof body.serverName !== "undefined" || typeof body.server_name !== "undefined"
          ? String(body.serverName ?? body.server_name ?? "").trim() || null
          : undefined,
        characterName: typeof body.characterName !== "undefined" || typeof body.character_name !== "undefined"
          ? String(body.characterName ?? body.character_name ?? "").trim() || null
          : undefined,
      }),
    );
    return true;
  }

  if (segments.length === 6 && segments[3] === "entries" && segments[5] === "feed" && method === "PATCH") {
    reply(response, 200, retroFamiliarsStorage.feed(segments[4], String(body.fedAt ?? body.fed_at ?? "").trim() || null));
    return true;
  }

  if (segments.length === 5 && segments[3] === "entries" && method === "DELETE") {
    reply(response, 200, retroFamiliarsStorage.delete(segments[4]));
    return true;
  }

  reply(response, 404, { ok: false, message: `Unknown familiars route: ${method} ${pathname}` });
  return true;
}
