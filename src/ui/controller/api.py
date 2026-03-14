from __future__ import annotations

from src.ui.controller.controller import WebviewController


class WebviewApi:
    def __init__(self) -> None:
        self.controller = WebviewController()

    def bootstrap(self) -> dict[str, object]:
        return self.controller.bootstrap()

    def poll_runtime(self, shortcut_event_id: int = 0, autofocus_log_id: int = 0) -> dict[str, object]:
        return self.controller.poll_runtime(shortcut_event_id, autofocus_log_id)

    def refresh_windows(self) -> dict[str, object]:
        return {'windows': self.controller._serialize_windows(self.controller.refresh_windows())}

    def focus_window(self, hwnd: int) -> dict[str, object]:
        return self.controller.focus_window(hwnd)

    def cycle_next(self) -> dict[str, object]:
        return self.controller.cycle(+1)

    def cycle_prev(self) -> dict[str, object]:
        return self.controller.cycle(-1)

    def focus_last(self) -> dict[str, object]:
        return self.controller.focus_last()

    def set_game_filter(self, game_type: str, enabled: bool) -> dict[str, object]:
        return self.controller.set_game_filter(game_type, enabled)

    def set_character_rule(self, pseudo: str, notif_type: str, enabled: bool) -> dict[str, object]:
        return self.controller.set_character_rule(pseudo, notif_type, enabled)

    def set_autofocus_type(self, notif_type: str, enabled: bool) -> dict[str, object]:
        return self.controller.set_autofocus_type(notif_type, enabled)

    def set_autofocus_debug(self, enabled: bool) -> dict[str, object]:
        return self.controller.set_autofocus_debug(enabled)

    def set_shortcut(self, action: str, value: str | None) -> dict[str, object]:
        return self.controller.set_shortcut(action, value)

    def apply_shortcuts(self) -> dict[str, object]:
        return self.controller.apply_shortcuts()

    def set_shortcuts_debug(self, enabled: bool) -> dict[str, object]:
        return self.controller.set_shortcuts_debug(enabled)

    def save_order(self, hwnds: list[int]) -> dict[str, object]:
        return self.controller.save_order(hwnds)

    def add_link_group(self, name: str) -> dict[str, object]:
        return self.controller.add_link_group(name)

    def rename_link_group(self, group_id: str, name: str) -> dict[str, object]:
        return self.controller.rename_link_group(group_id, name)

    def delete_link_group(self, group_id: str) -> dict[str, object]:
        return self.controller.delete_link_group(group_id)

    def save_link_group_order(self, group_ids: list[str]) -> dict[str, object]:
        return self.controller.save_link_group_order(group_ids)

    def move_link_group(self, group_id: str, direction: int) -> dict[str, object]:
        return self.controller.move_link_group(group_id, direction)

    def set_link_group_collapsed(self, group_id: str, collapsed: bool) -> dict[str, object]:
        return self.controller.set_link_group_collapsed(group_id, collapsed)

    def add_link(self, group_id: str, label: str, url: str) -> dict[str, object]:
        return self.controller.add_link(group_id, label, url)

    def update_link(self, group_id: str, link_id: str, label: str, url: str) -> dict[str, object]:
        return self.controller.update_link(group_id, link_id, label, url)

    def delete_link(self, group_id: str, link_id: str) -> dict[str, object]:
        return self.controller.delete_link(group_id, link_id)

    def save_link_order(self, group_id: str, link_ids: list[str]) -> dict[str, object]:
        return self.controller.save_link_order(group_id, link_ids)

    def move_link(self, group_id: str, link_id: str, direction: int) -> dict[str, object]:
        return self.controller.move_link(group_id, link_id, direction)

    def open_link(self, url: str) -> dict[str, object]:
        return self.controller.open_link(url)

    def shutdown(self) -> None:
        self.controller.shutdown()

