import { spawn } from "node:child_process";
import koffi from "koffi";

export interface RawWindowInfo {
  hwnd: number;
  title: string;
}

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

const EnumWindowsCallback = koffi.proto("bool __stdcall EnumWindowsProc(intptr hWnd, intptr lParam)");
const EnumWindows = user32.func("bool EnumWindows(EnumWindowsProc *lpEnumFunc, intptr lParam)");
const IsWindow = user32.func("bool IsWindow(intptr hWnd)");
const IsWindowVisible = user32.func("bool IsWindowVisible(intptr hWnd)");
const GetWindowTextW = user32.func("int GetWindowTextW(intptr hWnd, void* lpString, int nMaxCount)");
const GetForegroundWindowFn = user32.func("intptr GetForegroundWindow()");
const SetForegroundWindow = user32.func("bool SetForegroundWindow(intptr hWnd)");
const ShowWindowAsync = user32.func("bool ShowWindowAsync(intptr hWnd, int nCmdShow)");
const IsIconic = user32.func("bool IsIconic(intptr hWnd)");
const BringWindowToTop = user32.func("bool BringWindowToTop(intptr hWnd)");
const SetActiveWindow = user32.func("intptr SetActiveWindow(intptr hWnd)");
const SetFocus = user32.func("intptr SetFocus(intptr hWnd)");
const GetWindowThreadProcessId = user32.func("uint32 GetWindowThreadProcessId(intptr hWnd, void *lpdwProcessId)");
const AttachThreadInput = user32.func("bool AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool fAttach)");
const GetCurrentThreadId = kernel32.func("uint32 GetCurrentThreadId()");

function normalizeHandle(value: unknown): number {
  const handle = Number(value ?? 0);
  return Number.isFinite(handle) ? handle : 0;
}

function getWindowText(hwnd: number): string {
  const buffer = new Uint8Array(512 * 2);
  const length = GetWindowTextW(hwnd, buffer, 512);
  if (!length) {
    return "";
  }
  return new TextDecoder("utf-16le").decode(buffer.subarray(0, length * 2)).replace(/\0+$/, "").trim();
}

export async function listVisibleWindows(): Promise<RawWindowInfo[]> {
  const windows: RawWindowInfo[] = [];

  const callback = koffi.register((hwnd: number) => {
    if (!IsWindowVisible(hwnd)) {
      return true;
    }

    const title = getWindowText(hwnd);
    if (!title) {
      return true;
    }

    windows.push({ hwnd: normalizeHandle(hwnd), title });
    return true;
  }, koffi.pointer(EnumWindowsCallback));

  try {
    EnumWindows(callback, 0);
  } finally {
    koffi.unregister(callback);
  }

  return windows;
}

export async function focusWindowByTitle(title: string): Promise<{ ok: boolean; message: string }> {
  const normalizedTitle = String(title ?? "").trim().toLowerCase();
  if (!normalizedTitle) {
    return { ok: false, message: "Titre de fenetre invalide." };
  }

  const windows = await listVisibleWindows();
  const target = windows.find((window) => window.title.trim().toLowerCase() === normalizedTitle);
  if (!target) {
    return { ok: false, message: `Fenetre introuvable: ${title}.` };
  }
  return focusWindow(target.hwnd);
}

export async function getForegroundWindow(): Promise<number | null> {
  try {
    const hwnd = normalizeHandle(GetForegroundWindowFn());
    return hwnd > 0 ? hwnd : null;
  } catch {
    return null;
  }
}

export async function focusWindow(hwnd: number): Promise<{ ok: boolean; message: string }> {
  const safeHwnd = Math.trunc(hwnd);
  if (!Number.isFinite(safeHwnd) || safeHwnd <= 0) {
    return { ok: false, message: "Fenetre invalide." };
  }

  try {
    if (!IsWindow(safeHwnd)) {
      return { ok: false, message: "Fenetre introuvable." };
    }

    const foreground = normalizeHandle(GetForegroundWindowFn());
    const targetProcessId = new Uint32Array(1);
    const foregroundProcessId = new Uint32Array(1);
    const targetThread = Number(GetWindowThreadProcessId(safeHwnd, targetProcessId));
    const foregroundThread = foreground > 0 ? Number(GetWindowThreadProcessId(foreground, foregroundProcessId)) : 0;
    const currentThread = Number(GetCurrentThreadId());
    const attachedThreads: Array<[number, number]> = [];

    try {
      if (IsIconic(safeHwnd)) {
        ShowWindowAsync(safeHwnd, 9);
      } else {
        ShowWindowAsync(safeHwnd, 5);
      }

      if (targetThread > 0 && foregroundThread > 0 && foregroundThread !== targetThread) {
        if (AttachThreadInput(targetThread, foregroundThread, true)) {
          attachedThreads.push([targetThread, foregroundThread]);
        }
      }

      if (targetThread > 0 && currentThread > 0 && currentThread !== targetThread) {
        if (AttachThreadInput(targetThread, currentThread, true)) {
          attachedThreads.push([targetThread, currentThread]);
        }
      }

      BringWindowToTop(safeHwnd);
      SetActiveWindow(safeHwnd);
      SetFocus(safeHwnd);

      const ok = Boolean(SetForegroundWindow(safeHwnd));
      const nextForeground = normalizeHandle(GetForegroundWindowFn());
      const finalOk = ok || nextForeground === safeHwnd;

      return {
        ok: finalOk,
        message: finalOk ? "Focus envoye" : "Impossible de passer la fenetre au premier plan.",
      };
    } finally {
      for (const [fromThread, toThread] of attachedThreads.reverse()) {
        AttachThreadInput(fromThread, toThread, false);
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Impossible de focaliser la fenetre.",
    };
  }
}

export async function copyTextToClipboard(value: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/c", "clip"], { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));

    child.stdin.end(value, "utf8");
  });
}
