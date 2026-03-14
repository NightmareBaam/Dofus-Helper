import asyncio
import re
import threading
from collections.abc import Callable

from src.domain.constants import AUTOFOCUS_POLL_INTERVAL
from src.domain.fonctionnalites.title_parser import extract_pseudo_from_title
from src.domain.fonctionnalites.window_service import WindowService
from src.domain.utils.win32_helpers import WIN32_OK, WINSDK_OK, copy_text_to_clipboard, winman, winnot

NOTIFICATION_PATTERNS = [
    ("combat", ("de jouer",), "combat"),
    ("echange", ("te propose de faire un echange",), "echange"),
    ("groupe", ("t'invite", "rejoindre son groupe"), "groupe"),
    ("mp", ("de ", "(prive)"), "mp"),
]

MP_SENDER_PATTERN = re.compile(
    r"^\s*(?:de\s+|\((?:prive|priv\u00e9)\)\s+)(?P<sender>[^:]+?)\s*:",
    re.IGNORECASE,
)
UNITY_NOTIFICATION_TITLE_PATTERN = re.compile(r"^dofus\s+3(?:\.\d+)*$", re.IGNORECASE)


def _normalize_text(value: str) -> str:
    return (
        value.replace("\u00e9", "e")
        .replace("\u00e8", "e")
        .replace("\u00ea", "e")
        .replace("\u00e0", "a")
        .replace("\u00e2", "a")
        .replace("\u00f9", "u")
        .replace("\u00fb", "u")
        .replace("\u00ef", "i")
        .replace("\u00ee", "i")
        .replace("\u00f4", "o")
        .replace("\u00e7", "c")
        .casefold()
    )


class AutoFocusService:
    def __init__(
        self,
        window_service: WindowService,
        log_fn: Callable[[str, str], None],
        stats_fn: Callable[[dict[str, str]], None],
    ) -> None:
        self._window_service = window_service
        self._log_fn = log_fn
        self._stats_fn = stats_fn
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._running = False
        self._debug_enabled = False
        self._enabled_types = {
            "combat": True,
            "echange": True,
            "groupe": True,
            "mp": True,
        }
        self._stats = {
            "notifications": "0",
            "matches": "0",
            "focus": "0",
            "last": "-",
        }
        self._filters_getter: Callable[[], tuple[bool, bool]] = lambda: (True, True)
        self._character_rule_getter: Callable[[str, str], bool] = lambda _pseudo, _notif_type: True
        self._mp_clipboard_enabled_getter: Callable[[], bool] = lambda: True

    @property
    def available(self) -> bool:
        return WIN32_OK and WINSDK_OK

    @property
    def running(self) -> bool:
        return self._running

    def set_filters_getter(self, getter: Callable[[], tuple[bool, bool]]) -> None:
        self._filters_getter = getter

    def set_character_rule_getter(self, getter: Callable[[str, str], bool]) -> None:
        self._character_rule_getter = getter

    def set_mp_clipboard_enabled_getter(self, getter: Callable[[], bool]) -> None:
        self._mp_clipboard_enabled_getter = getter

    def set_debug(self, enabled: bool) -> None:
        self._debug_enabled = enabled

    def set_type_enabled(self, key: str, enabled: bool) -> None:
        if key in self._enabled_types:
            self._enabled_types[key] = enabled

    def is_type_enabled(self, key: str) -> bool:
        return self._enabled_types.get(key, False)

    def start(self) -> None:
        if not self.available or self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_async_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._loop is not None and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)

    def _run_async_loop(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._listen())
        except Exception as exc:
            if self._running:
                self._log_fn(f"Erreur fatale AutoFocus : {exc}", "error")
        finally:
            self._loop.close()

    async def _listen(self) -> None:
        listener = winman.UserNotificationListener.current
        access = await listener.request_access_async()
        if access != winman.UserNotificationListenerAccessStatus.ALLOWED:
            self._log_fn(
                "Acces notifications refuse. Active-les dans Parametres -> Systeme -> Notifications.",
                "error",
            )
            self.stop()
            return

        self._log_fn("Acces aux notifications accorde.", "ok")
        seen_ids: set[int] = set()
        change_event = asyncio.Event()
        token = None
        use_events = False

        def on_notification_changed(_sender, _args) -> None:
            if self._loop is not None and self._loop.is_running():
                self._loop.call_soon_threadsafe(change_event.set)

        try:
            token = listener.add_notification_changed(on_notification_changed)
            use_events = True
            self._log_fn("Mode event-driven actif.", "ok")
        except Exception:
            self._log_fn("Mode polling actif.", "dim")

        try:
            while self._running:
                if use_events:
                    try:
                        await asyncio.wait_for(change_event.wait(), timeout=30.0)
                    except asyncio.TimeoutError:
                        pass
                    except asyncio.CancelledError:
                        break
                    change_event.clear()
                else:
                    try:
                        await asyncio.sleep(AUTOFOCUS_POLL_INTERVAL)
                    except asyncio.CancelledError:
                        break

                notifications = await listener.get_notifications_async(
                    winnot.NotificationKinds.TOAST,
                )
                new_notifications = [item for item in notifications if item.id not in seen_ids]
                if not new_notifications:
                    continue

                self._increment_stat("notifications", len(new_notifications))

                for notification in new_notifications:
                    seen_ids.add(notification.id)
                    await self._handle_notification(notification)

                if len(seen_ids) > 500:
                    seen_ids.clear()
        finally:
            try:
                listener.remove_notification_changed(token)
            except Exception:
                pass

    async def _handle_notification(self, notification) -> None:
        try:
            binding = notification.notification.visual.get_binding(
                winnot.KnownNotificationBindings.toast_generic,
            )
        except Exception:
            binding = None

        if binding is None:
            return

        elements = [element.text for element in binding.get_text_elements()]
        if not elements:
            return

        title = elements[0]
        body = " | ".join(part.strip() for part in elements[1:] if part and part.strip())

        if self._debug_enabled:
            self._log_fn(f"[debug] titre={title!r} corps={body!r}", "debug")

        notif_type = self._detect_notification_type(body)
        if notif_type is None:
            return

        if notif_type == "mp" and self._mp_clipboard_enabled_getter():
            sender = self._extract_mp_sender(body)
            if sender:
                whisper = f"/w {sender} "
                if copy_text_to_clipboard(whisper):
                    self._log_fn(f"  Presse-papiers -> {whisper}", "ok")
                else:
                    self._log_fn("  Echec copie presse-papiers MP.", "warn")

        pseudo = extract_pseudo_from_title(title)
        unity_fallback = pseudo is None and self._is_unity_notification_title(title)
        if unity_fallback and self._window_service.count_game_windows("unity") > 1:
            self._log_fn("[unity] ignore focus (plusieurs fenetres Unity ouvertes)", "dim")
            return
        if pseudo is None and not unity_fallback:
            return

        target_label = pseudo or "Unity"

        if not self.is_type_enabled(notif_type):
            self._log_fn(f"[{notif_type}] ignore (desactive) -> {target_label}", "dim")
            return

        if pseudo and not self._character_rule_getter(pseudo, notif_type):
            self._log_fn(f"[{notif_type}] ignore pour {pseudo} (regle personnage)", "dim")
            return

        self._increment_stat("matches", 1)
        self._stats["last"] = target_label
        self._stats_fn(dict(self._stats))
        self._log_fn(f"[{notif_type.upper()}] {target_label} -> {body}", f"type_{notif_type}")

        enable_retro, enable_unity = self._filters_getter()
        if pseudo:
            ok, detail = self._window_service.focus_pseudo(
                pseudo,
                enable_retro=enable_retro,
                enable_unity=enable_unity,
            )
        else:
            ok, detail = self._window_service.focus_game_type(
                "unity",
                enable_retro=enable_retro,
                enable_unity=enable_unity,
            )

        if ok:
            self._increment_stat("focus", 1)
            self._log_fn(f"  Focus -> {detail}", "ok")
        else:
            self._log_fn(f"  {detail}", "error")

    def _increment_stat(self, key: str, increment: int) -> None:
        current = int(self._stats[key])
        self._stats[key] = str(current + increment)
        self._stats_fn(dict(self._stats))

    @staticmethod
    def _detect_notification_type(body: str) -> str | None:
        normalized_body = _normalize_text(body)
        for key, patterns, _label in NOTIFICATION_PATTERNS:
            if any(pattern in normalized_body for pattern in patterns):
                return key
        return None

    @staticmethod
    def _is_unity_notification_title(title: str) -> bool:
        return UNITY_NOTIFICATION_TITLE_PATTERN.fullmatch(title.strip()) is not None

    @staticmethod
    def _extract_mp_sender(body: str) -> str | None:
        match = MP_SENDER_PATTERN.match(body.strip())
        if match is None:
            return None
        sender = match.group("sender").strip()
        return sender or None
