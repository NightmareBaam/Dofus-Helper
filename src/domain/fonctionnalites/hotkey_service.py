import ctypes
import threading
import time
from collections.abc import Callable, Mapping

try:
    import keyboard

    KEYBOARD_OK = True
except Exception:
    keyboard = None
    KEYBOARD_OK = False

try:
    import mouse

    MOUSE_OK = True
except Exception:
    mouse = None
    MOUSE_OK = False

SHORTCUT_MODIFIERS = ("ctrl", "shift", "alt")
SHORTCUT_MOUSE_BUTTONS = {
    "mouse:left",
    "mouse:middle",
    "mouse:right",
    "mouse:x1",
    "mouse:x2",
}
TK_MOUSE_BUTTONS = {
    1: "mouse:left",
    2: "mouse:middle",
    3: "mouse:right",
    4: "mouse:x1",
    5: "mouse:x2",
}
MOUSE_HOOK_BUTTONS = {
    "mouse:left": "left",
    "mouse:middle": "middle",
    "mouse:right": "right",
    "mouse:x1": "x",
    "mouse:x2": "x2",
}
GLOBAL_MOUSE_BUTTONS = {
    "left": "mouse:left",
    "middle": "mouse:middle",
    "right": "mouse:right",
    "x": "mouse:x1",
    "x2": "mouse:x2",
}
VK_MOUSE_BUTTONS = {
    0x01: "left",
    0x02: "right",
    0x04: "middle",
    0x05: "x",
    0x06: "x2",
}
MOUSE_POLL_INTERVAL = 0.005

try:
    _user32 = ctypes.windll.user32
    NATIVE_MOUSE_OK = True
except Exception:
    _user32 = None
    NATIVE_MOUSE_OK = False


class _MousePoller:
    def __init__(self) -> None:
        self._listeners: dict[int, Callable[[dict[str, object]], None]] = {}
        self._lock = threading.Lock()
        self._next_listener_id = 1
        self._thread: threading.Thread | None = None
        self._running = False
        self._last_states = {vk: False for vk in VK_MOUSE_BUTTONS}

    def add_listener(self, callback: Callable[[dict[str, object]], None]) -> int:
        if not NATIVE_MOUSE_OK:
            raise RuntimeError("Capture souris Win32 indisponible.")

        with self._lock:
            listener_id = self._next_listener_id
            self._next_listener_id += 1
            self._listeners[listener_id] = callback
            should_start = not self._running

        if should_start:
            self._start()
        return listener_id

    def remove_listener(self, listener_id: int) -> None:
        with self._lock:
            self._listeners.pop(listener_id, None)
            should_stop = not self._listeners

        if should_stop:
            self.stop()

    def stop(self) -> None:
        self._running = False
        thread = self._thread
        if thread is not None:
            thread.join(timeout=0.5)
        self._thread = None
        self._last_states = {vk: False for vk in VK_MOUSE_BUTTONS}

    def _start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while self._running:
            emitted: list[tuple[str, dict[str, object]]] = []
            for vk_code, button_name in VK_MOUSE_BUTTONS.items():
                current = self._is_pressed(vk_code)
                previous = self._last_states[vk_code]
                if current and not previous:
                    emitted.append((button_name, {"event_type": "down", "button": button_name}))
                self._last_states[vk_code] = current

            if emitted:
                with self._lock:
                    listeners = list(self._listeners.values())
                for _button_name, event in emitted:
                    for listener in listeners:
                        try:
                            listener(event)
                        except Exception:
                            pass

            time.sleep(MOUSE_POLL_INTERVAL)

    @staticmethod
    def _is_pressed(vk_code: int) -> bool:
        if _user32 is None:
            return False
        return bool(_user32.GetAsyncKeyState(vk_code) & 0x8000)


_MOUSE_POLLER = _MousePoller() if NATIVE_MOUSE_OK else None


def normalize_shortcut(shortcut: str | None) -> str | None:
    if shortcut is None:
        return None

    raw = str(shortcut).strip().lower()
    if raw in {"", "aucun", "none"}:
        return None

    aliases = {
        "control": "ctrl",
        "ctl": "ctrl",
        "mouse1": "mouse:left",
        "button1": "mouse:left",
        "mouse_left": "mouse:left",
        "mouse2": "mouse:right",
        "button2": "mouse:right",
        "mouse_right": "mouse:right",
        "mouse3": "mouse:middle",
        "button3": "mouse:middle",
        "mouse_middle": "mouse:middle",
        "mouse4": "mouse:x1",
        "button4": "mouse:x1",
        "mouse_x1": "mouse:x1",
        "mouse5": "mouse:x2",
        "button5": "mouse:x2",
        "mouse_x2": "mouse:x2",
        "xbutton1": "mouse:x1",
        "xbutton2": "mouse:x2",
    }

    parts: list[str] = []
    for raw_part in raw.split("+"):
        part = aliases.get(raw_part.strip(), raw_part.strip())
        if not part:
            continue
        if part.startswith("mouse:"):
            part = f"mouse:{part.split(':', 1)[1]}"
        if part not in parts:
            parts.append(part)

    ordered = [part for part in SHORTCUT_MODIFIERS if part in parts]
    ordered.extend(part for part in parts if part not in SHORTCUT_MODIFIERS)
    return "+".join(ordered) if ordered else None


def shortcut_parts(shortcut: str | None) -> list[str]:
    normalized = normalize_shortcut(shortcut)
    return normalized.split("+") if normalized else []


def shortcut_mouse_button(shortcut: str | None) -> str | None:
    for part in reversed(shortcut_parts(shortcut)):
        if part in SHORTCUT_MOUSE_BUTTONS:
            return part
    return None


def modifiers_from_state(state: int) -> list[str]:
    modifiers: list[str] = []
    if state & 0x4:
        modifiers.append("ctrl")
    if state & 0x1:
        modifiers.append("shift")
    if state & 0x20000:
        modifiers.append("alt")
    return modifiers


def pressed_modifiers() -> list[str]:
    if not KEYBOARD_OK:
        return []
    modifiers: list[str] = []
    for modifier in SHORTCUT_MODIFIERS:
        try:
            if keyboard.is_pressed(modifier):
                modifiers.append(modifier)
        except Exception:
            return []
    return modifiers


def global_mouse_button_name(button: object) -> str | None:
    if button is None:
        return None
    return GLOBAL_MOUSE_BUTTONS.get(str(button).lower())


class HotkeyService:
    def __init__(self) -> None:
        self._mouse_hooks: list[int] = []
        self._registered_shortcuts: set[str] = set()
        self._debug_callback: Callable[[str, bool], None] | None = None
        self._debug_mouse_hook: int | None = None
        self._debug_keyboard_hook = None

    def clear_all(self, preserve_debug: bool = True) -> None:
        self._registered_shortcuts.clear()

        if KEYBOARD_OK:
            for name in ("unhook_all_hotkeys", "remove_all_hotkeys", "clear_all_hotkeys"):
                if hasattr(keyboard, name):
                    try:
                        getattr(keyboard, name)()
                        break
                    except Exception:
                        pass
            if self._debug_keyboard_hook is not None:
                try:
                    keyboard.unhook(self._debug_keyboard_hook)
                except Exception:
                    pass
                self._debug_keyboard_hook = None

        for hook_id in self._mouse_hooks:
            if _MOUSE_POLLER is not None:
                _MOUSE_POLLER.remove_listener(hook_id)
        self._mouse_hooks.clear()

        if self._debug_mouse_hook is not None and _MOUSE_POLLER is not None:
            _MOUSE_POLLER.remove_listener(self._debug_mouse_hook)
            self._debug_mouse_hook = None

        if preserve_debug and self._debug_callback is not None:
            self._install_debug_hooks()

    def apply_shortcuts(
        self,
        shortcuts: Mapping[str, str | None],
        callbacks: Mapping[str, Callable[[], None]],
    ) -> None:
        self.clear_all()
        for action, shortcut in shortcuts.items():
            callback = callbacks.get(action)
            if callback is None or shortcut is None:
                continue
            self.register_shortcut(shortcut, callback)

    def register_shortcut(self, shortcut: str, callback: Callable[[], None]) -> None:
        combo = normalize_shortcut(shortcut)
        if combo is None:
            return

        self._registered_shortcuts.add(combo)
        mouse_button = shortcut_mouse_button(combo)
        if mouse_button is not None:
            if not self._mouse_shortcut_supported(combo):
                raise RuntimeError("Combinaison souris non supportee sur cette machine.")

            def on_mouse_event(event, _combo: str = combo, _button: str = mouse_button) -> None:
                if event.get("event_type") != "down":
                    return
                if global_mouse_button_name(event.get("button")) != _button:
                    return
                if not self._shortcut_is_pressed(_combo, _button):
                    return
                callback()

            if _MOUSE_POLLER is None:
                raise RuntimeError("Capture souris Win32 indisponible.")
            hook_id = _MOUSE_POLLER.add_listener(on_mouse_event)
            self._mouse_hooks.append(hook_id)
            return

        if not KEYBOARD_OK:
            raise RuntimeError("Module 'keyboard' non charge.")
        keyboard.add_hotkey(combo, callback)

    def set_debug_listener(self, callback: Callable[[str, bool], None] | None) -> None:
        self._debug_callback = callback
        self._remove_debug_hooks()
        if callback is not None:
            self._install_debug_hooks()

    def _shortcut_is_pressed(
        self,
        shortcut: str,
        trigger_button: str | None = None,
    ) -> bool:
        parts = shortcut_parts(shortcut)
        if not parts:
            return False

        mouse_button = shortcut_mouse_button(shortcut)
        if trigger_button is not None and mouse_button != trigger_button:
            return False

        keyboard_keys = [part for part in parts if part not in SHORTCUT_MOUSE_BUTTONS]
        if keyboard_keys and not KEYBOARD_OK:
            return False

        for key_name in keyboard_keys:
            try:
                if not keyboard.is_pressed(key_name):
                    return False
            except Exception:
                return False

        return True

    def _install_debug_hooks(self) -> None:
        if self._debug_callback is None:
            return

        if _MOUSE_POLLER is not None and self._debug_mouse_hook is None:
            self._debug_mouse_hook = _MOUSE_POLLER.add_listener(self._handle_debug_mouse_event)

        if KEYBOARD_OK and self._debug_keyboard_hook is None:
            self._debug_keyboard_hook = keyboard.hook(self._handle_debug_keyboard_event)

    def _remove_debug_hooks(self) -> None:
        if self._debug_mouse_hook is not None and _MOUSE_POLLER is not None:
            _MOUSE_POLLER.remove_listener(self._debug_mouse_hook)
            self._debug_mouse_hook = None

        if KEYBOARD_OK and self._debug_keyboard_hook is not None:
            try:
                keyboard.unhook(self._debug_keyboard_hook)
            except Exception:
                pass
            self._debug_keyboard_hook = None

    def _handle_debug_mouse_event(self, event) -> None:
        if self._debug_callback is None or event.get("event_type") != "down":
            return

        button = global_mouse_button_name(event.get("button"))
        if button is None:
            return

        combo = normalize_shortcut("+".join(pressed_modifiers() + [button]))
        if combo is None:
            return
        self._debug_callback(combo, combo in self._registered_shortcuts)

    def _handle_debug_keyboard_event(self, event) -> None:
        if self._debug_callback is None or getattr(event, "event_type", None) != "down":
            return

        key_name = normalize_shortcut(getattr(event, "name", None))
        if key_name is None or key_name in SHORTCUT_MODIFIERS or key_name in SHORTCUT_MOUSE_BUTTONS:
            return

        combo = normalize_shortcut("+".join(pressed_modifiers() + [key_name]))
        if combo is None:
            return
        self._debug_callback(combo, combo in self._registered_shortcuts)

    @staticmethod
    def _mouse_shortcut_supported(shortcut: str) -> bool:
        mouse_button = shortcut_mouse_button(shortcut)
        return mouse_button in MOUSE_HOOK_BUTTONS and NATIVE_MOUSE_OK
