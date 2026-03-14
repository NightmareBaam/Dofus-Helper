import threading
import time
from collections.abc import Sequence

from src.domain.constants import FOCUS_POLL_INTERVAL
from src.domain.models import GameType, GameWindow
from src.domain.fonctionnalites.title_parser import parse_window_title
from src.domain.utils.win32_helpers import (
    WIN32_OK,
    enum_windows,
    focus_window as focus_hwnd,
    get_foreground_window,
    get_window_text,
    is_window_visible,
)


class WindowService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_focused_hwnd: int | None = None
        self._previous_focused_hwnd: int | None = None
        self._tracking_thread: threading.Thread | None = None
        self._tracking_running = False
        self._last_seen_foreground: int | None = None

    @property
    def available(self) -> bool:
        return WIN32_OK

    def start_focus_tracking(self, poll_interval: float = FOCUS_POLL_INTERVAL) -> None:
        if not WIN32_OK or self._tracking_running:
            return
        self._tracking_running = True
        self._tracking_thread = threading.Thread(
            target=self._track_focus_loop,
            args=(poll_interval,),
            daemon=True,
        )
        self._tracking_thread.start()

    def stop_focus_tracking(self) -> None:
        self._tracking_running = False

    def list_game_windows(
        self,
        enable_retro: bool = True,
        enable_unity: bool = True,
    ) -> list[GameWindow]:
        if not WIN32_OK:
            return []

        windows: list[GameWindow] = []

        def callback(hwnd: int, _lparam: object) -> bool:
            if not is_window_visible(hwnd):
                return True
            title = get_window_text(hwnd)
            parsed = parse_window_title(hwnd, title)
            if parsed is None:
                return True
            if parsed.game_type == "retro" and not enable_retro:
                return True
            if parsed.game_type == "unity" and not enable_unity:
                return True
            windows.append(parsed)
            return True

        enum_windows(callback)
        return windows

    def get_foreground_hwnd(self) -> int | None:
        return get_foreground_window()

    def focus_window(self, hwnd: int) -> tuple[bool, str]:
        result = focus_hwnd(hwnd)
        if result[0]:
            self._push_focus(hwnd)
        return result

    def cycle(
        self,
        direction: int,
        ordered_windows: Sequence[GameWindow],
    ) -> tuple[bool, str]:
        windows = self._dedupe_windows(ordered_windows)
        if not windows:
            return False, "Aucune fenetre Dofus geree."

        foreground = self.get_foreground_hwnd()
        hwnds = [window.hwnd for window in windows]

        if foreground in hwnds:
            current_index = hwnds.index(foreground)
            target = windows[(current_index + direction) % len(windows)]
        else:
            target = self._window_from_history(windows) or windows[-1]

        return self.focus_window(target.hwnd)

    def focus_last(self, ordered_windows: Sequence[GameWindow]) -> tuple[bool, str]:
        windows = self._dedupe_windows(ordered_windows)
        if not windows:
            return False, "Aucune fenetre Dofus geree."

        foreground = self.get_foreground_hwnd()
        valid_hwnds = {window.hwnd for window in windows}

        with self._lock:
            last_focused = self._last_focused_hwnd
            previous_focused = self._previous_focused_hwnd

        candidates: list[int] = []
        if foreground == last_focused and previous_focused is not None:
            candidates.append(previous_focused)
        if last_focused is not None and last_focused != foreground:
            candidates.append(last_focused)
        if previous_focused is not None and previous_focused != foreground:
            candidates.append(previous_focused)

        for hwnd in candidates:
            if hwnd in valid_hwnds:
                return self.focus_window(hwnd)

        fallback = self._window_from_history(windows) or windows[-1]
        return self.focus_window(fallback.hwnd)

    def focus_pseudo(
        self,
        pseudo: str,
        enable_retro: bool = True,
        enable_unity: bool = True,
    ) -> tuple[bool, str]:
        pseudo_key = pseudo.casefold()
        for window in self.list_game_windows(enable_retro=enable_retro, enable_unity=enable_unity):
            if window.pseudo.casefold() == pseudo_key:
                return self.focus_window(window.hwnd)
        return False, f"Aucune fenetre compatible trouvee pour {pseudo}"

    def focus_game_type(
        self,
        game_type: GameType,
        enable_retro: bool = True,
        enable_unity: bool = True,
    ) -> tuple[bool, str]:
        windows = [
            window
            for window in self.list_game_windows(enable_retro=enable_retro, enable_unity=enable_unity)
            if window.game_type == game_type
        ]
        if not windows:
            return False, f"Aucune fenetre {game_type} compatible trouvee."

        target = self._window_from_history(windows) or windows[-1]
        return self.focus_window(target.hwnd)

    def count_game_windows(self, game_type: GameType) -> int:
        return sum(1 for window in self.list_game_windows() if window.game_type == game_type)

    def _track_focus_loop(self, poll_interval: float) -> None:
        while self._tracking_running:
            foreground = self.get_foreground_hwnd()
            if foreground and foreground != self._last_seen_foreground:
                self._last_seen_foreground = foreground
                title = get_window_text(foreground)
                if parse_window_title(foreground, title) is not None:
                    self._push_focus(foreground)
            time.sleep(poll_interval)

    def _push_focus(self, hwnd: int) -> None:
        with self._lock:
            if hwnd == self._last_focused_hwnd:
                return
            self._previous_focused_hwnd = self._last_focused_hwnd
            self._last_focused_hwnd = hwnd

    def _window_from_history(self, windows: Sequence[GameWindow]) -> GameWindow | None:
        valid_by_hwnd = {window.hwnd: window for window in windows}
        with self._lock:
            last_focused = self._last_focused_hwnd
            previous_focused = self._previous_focused_hwnd
        for hwnd in (last_focused, previous_focused):
            if hwnd in valid_by_hwnd:
                return valid_by_hwnd[hwnd]
        return None

    @staticmethod
    def _dedupe_windows(ordered_windows: Sequence[GameWindow]) -> list[GameWindow]:
        seen: set[int] = set()
        result: list[GameWindow] = []
        for window in ordered_windows:
            if window.hwnd in seen:
                continue
            seen.add(window.hwnd)
            result.append(window)
        return result
