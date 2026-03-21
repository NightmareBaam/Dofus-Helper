declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | undefined>;
    on(event: "data", listener: (chunk: string | Uint8Array) => void): void;
    on(event: "end", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
  }

  export interface ServerResponse {
    setHeader(name: string, value: string): void;
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(chunk?: string): void;
  }

  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void,
  ): {
    listen(port: number, host: string, callback?: () => void): void;
  };
}

declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:buffer" {
  export const Buffer: {
    from(value: string, encoding: "base64"): {
      toString(encoding: "utf8"): string;
    };
  };
}

declare module "node:child_process" {
  export interface ReadableLike {
    on(event: "data", listener: (chunk: string | Uint8Array) => void): void;
  }

  export interface ChildProcessWithoutNullStreams {
    stdout: ReadableLike;
    stderr: ReadableLike;
    on(event: "exit", listener: (code: number | null) => void): void;
  }

  export function execFile(command: string, args: string[], options: { cwd?: string; windowsHide?: boolean }, callback: (error: Error | null, stdout: string, stderr: string) => void): void;
  export function spawn(command: string, args: string[], options: { cwd?: string; windowsHide?: boolean }): ChildProcessWithoutNullStreams;
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};
