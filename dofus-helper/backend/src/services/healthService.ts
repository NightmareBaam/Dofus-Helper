export interface BackendHealth {
  service: string;
  status: "ok";
  transport: "http";
  sidecar: boolean;
  port: number;
  timestamp: string;
}

const DEFAULT_PORT = 3210;

export function resolveBackendPort(): number {
  const rawPort = Number(process.env.DOFUS_HELPER_BACKEND_PORT ?? DEFAULT_PORT);
  return Number.isFinite(rawPort) && rawPort > 0 ? rawPort : DEFAULT_PORT;
}

export function getBackendHealth(): BackendHealth {
  return {
    service: "dofus-helper-node-backend",
    status: "ok",
    transport: "http",
    sidecar: true,
    port: resolveBackendPort(),
    timestamp: new Date().toISOString(),
  };
}
