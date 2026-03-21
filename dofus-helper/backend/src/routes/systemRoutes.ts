import type { ServerResponse } from "node:http";
import { getBackendHealth } from "../services/healthService.js";

export function handleSystemRoute(pathname: string, response: ServerResponse): boolean {
  if (pathname !== "/api/system/health") {
    return false;
  }

  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(getBackendHealth()));
  return true;
}
