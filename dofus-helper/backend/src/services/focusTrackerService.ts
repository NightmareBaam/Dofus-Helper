import { focusWindow, getForegroundWindow } from "./windowsBridge.js";

interface FocusableWindow {
  hwnd: number;
}

const FOCUS_POLL_INTERVAL_MS = 150;

class FocusTrackerService {
  private lastFocusedHwnd: number | null = null;
  private previousFocusedHwnd: number | null = null;
  private lastSeenForeground: number | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.start();
  }

  private start(): void {
    if (this.intervalHandle) {
      return;
    }
    void this.pollForeground();
    this.intervalHandle = setInterval(() => {
      void this.pollForeground();
    }, FOCUS_POLL_INTERVAL_MS);
  }

  private async pollForeground(): Promise<void> {
    const foreground = await getForegroundWindow();
    if (!foreground || foreground === this.lastSeenForeground) {
      return;
    }
    this.lastSeenForeground = foreground;
    this.pushFocus(foreground);
  }

  private pushFocus(hwnd: number): void {
    if (hwnd === this.lastFocusedHwnd) {
      return;
    }
    this.previousFocusedHwnd = this.lastFocusedHwnd;
    this.lastFocusedHwnd = hwnd;
  }

  async focusWindow(hwnd: number): Promise<{ ok: boolean; message: string }> {
    const result = await focusWindow(hwnd);
    if (result.ok) {
      this.pushFocus(hwnd);
    }
    return result;
  }

  async cycle(direction: number, orderedWindows: FocusableWindow[]): Promise<{ ok: boolean; message: string }> {
    const windows = this.dedupeWindows(orderedWindows);
    if (!windows.length) {
      return { ok: false, message: "Aucune fenetre Dofus geree." };
    }

    const foreground = await getForegroundWindow();
    const hwnds = windows.map((window) => window.hwnd);

    if (foreground && hwnds.includes(foreground)) {
      const currentIndex = hwnds.indexOf(foreground);
      const target = windows[(currentIndex + direction + windows.length) % windows.length];
      return this.focusWindow(target.hwnd);
    }

    const fallback = this.windowFromHistory(windows) ?? windows[windows.length - 1];
    return this.focusWindow(fallback.hwnd);
  }

  async focusLast(orderedWindows: FocusableWindow[]): Promise<{ ok: boolean; message: string }> {
    const windows = this.dedupeWindows(orderedWindows);
    if (!windows.length) {
      return { ok: false, message: "Aucune fenetre Dofus geree." };
    }

    const foreground = await getForegroundWindow();
    const validHwnds = new Set(windows.map((window) => window.hwnd));
    const candidates = [
      foreground === this.lastFocusedHwnd ? this.previousFocusedHwnd : null,
      this.lastFocusedHwnd,
      this.previousFocusedHwnd,
    ];

    for (const hwnd of candidates) {
      if (hwnd && hwnd !== foreground && validHwnds.has(hwnd)) {
        return this.focusWindow(hwnd);
      }
    }

    const fallback = this.windowFromHistory(windows) ?? windows[windows.length - 1];
    return this.focusWindow(fallback.hwnd);
  }

  private windowFromHistory(windows: FocusableWindow[]): FocusableWindow | null {
    const byHwnd = new Map(windows.map((window) => [window.hwnd, window]));
    for (const hwnd of [this.lastFocusedHwnd, this.previousFocusedHwnd]) {
      if (hwnd && byHwnd.has(hwnd)) {
        return byHwnd.get(hwnd) ?? null;
      }
    }
    return null;
  }

  private dedupeWindows(windows: FocusableWindow[]): FocusableWindow[] {
    const seen = new Set<number>();
    const result: FocusableWindow[] = [];
    for (const window of windows) {
      if (seen.has(window.hwnd)) {
        continue;
      }
      seen.add(window.hwnd);
      result.push(window);
    }
    return result;
  }
}

export const focusTrackerService = new FocusTrackerService();
