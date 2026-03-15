from __future__ import annotations

import threading
import webbrowser
from collections import deque
from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from src.ui.controller.runtime import as_data_url
from src.domain.config import load_config, save_config
from src.domain.constants import APP_LEGAL, APP_NAME, APP_VERSION, ASSETS_DIR, AUTOFOCUS_TYPES, LOGO_PATH
from src.domain.craft_catalog import CraftCatalog, CraftCatalogItem
from src.domain.models import AppConfig, GameWindow
from src.domain.fonctionnalites.autofocus_service import AutoFocusService
from src.domain.fonctionnalites.hotkey_service import KEYBOARD_OK, MOUSE_OK, HotkeyService, normalize_shortcut
from src.domain.fonctionnalites.reorder_service import reorder_with_ungroup_regroup
from src.domain.fonctionnalites.window_service import WindowService
from src.domain.utils.win32_helpers import WIN32_OK, WINSDK_OK


class WebviewController:
    def __init__(self) -> None:
        self.config_data: AppConfig = load_config()
        self.window_service = WindowService()
        self.window_service.start_focus_tracking()
        self.craft_catalog = CraftCatalog()
        self.hotkey_service = HotkeyService()
        self.autofocus_service = AutoFocusService(
            self.window_service,
            self._log_from_service,
            self._stats_from_service,
        )
        self.autofocus_service.set_filters_getter(self._get_filters)
        self.autofocus_service.set_character_rule_getter(self._is_character_autofocus_enabled)
        self.autofocus_service.set_mp_clipboard_enabled_getter(lambda: self.config_data.copy_mp_sender)

        self._char_order: list[GameWindow] = []
        self._asset_cache = self._load_assets()
        self._lock = threading.Lock()
        self._shortcut_status = {'text': '', 'tone': 'muted'}
        self._shortcut_debug_enabled = False
        self._shortcut_debug_seq = 0
        self._shortcut_debug_events: deque[dict[str, object]] = deque(maxlen=250)
        self._autofocus_debug_enabled = False
        self._autofocus_log_seq = 0
        self._autofocus_logs: deque[dict[str, object]] = deque(maxlen=400)
        self._autofocus_stats = {
            'notifications': '0',
            'matches': '0',
            'focus': '0',
            'last': '-',
        }
        self._pending_windows: list[dict[str, object]] | None = None

        self._log_dependency_warnings()
        self._apply_shortcuts(silent=True)
        if self.autofocus_service.available:
            self.autofocus_service.start()
            self._append_autofocus_log('AutoFocus demarre automatiquement.', 'ok')

    def shutdown(self) -> None:
        save_config(self.config_data)
        self.hotkey_service.clear_all(preserve_debug=False)
        self.autofocus_service.stop()
        self.window_service.stop_focus_tracking()

    def bootstrap(self) -> dict[str, object]:
        return {
            'appName': APP_NAME,
            'version': APP_VERSION,
            'legal': APP_LEGAL,
            'links': self._serialize_links(),
            'crafts': self._serialize_crafts(),
            'craftCatalogState': self._serialize_craft_catalog_state(),
            'assets': self._asset_cache,
            'config': self._serialize_config(),
            'windows': self._serialize_windows(self.refresh_windows()),
            'availableTypes': list(AUTOFOCUS_TYPES),
            'shortcutsState': self._serialize_shortcuts_state(),
            'autofocusState': self._serialize_autofocus_state(include_logs=True),
        }

    def poll_runtime(self, shortcut_event_id: int, autofocus_log_id: int) -> dict[str, object]:
        with self._lock:
            shortcut_events = [event for event in self._shortcut_debug_events if int(event['id']) > shortcut_event_id]
            autofocus_logs = [event for event in self._autofocus_logs if int(event['id']) > autofocus_log_id]
            autofocus_state = self._serialize_autofocus_state_locked(include_logs=False)
            shortcuts_state = self._serialize_shortcuts_state_locked()
            windows = self._pending_windows
            self._pending_windows = None
        return {
            'shortcutEvents': shortcut_events,
            'autofocusLogs': autofocus_logs,
            'autofocusState': autofocus_state,
            'shortcutsState': shortcuts_state,
            'windows': windows,
        }

    def refresh_windows(self) -> list[GameWindow]:
        windows = self.window_service.list_game_windows(*self._get_filters())
        known = {window.hwnd: window for window in windows}
        ordered = [known[window.hwnd] for window in self._char_order if window.hwnd in known]
        known_hwnds = {window.hwnd for window in ordered}
        ordered.extend(window for window in windows if window.hwnd not in known_hwnds)
        self._char_order = ordered

        rules_changed = False
        for window in self._char_order:
            previous_rule = dict(self.config_data.autofocus_rules.get(window.pseudo, {}))
            self.config_data.ensure_autofocus_rule(window.pseudo)
            if previous_rule != self.config_data.autofocus_rules.get(window.pseudo, {}):
                rules_changed = True
        if rules_changed:
            save_config(self.config_data)

        return list(self._char_order)

    def focus_window(self, hwnd: int) -> dict[str, object]:
        ok, message = self.window_service.focus_window(hwnd)
        return {'ok': ok, 'message': message}

    def cycle(self, direction: int) -> dict[str, object]:
        windows = self._managed_characters()
        ok, message = self.window_service.cycle(direction, windows)
        return {'ok': ok, 'message': message}

    def focus_last(self) -> dict[str, object]:
        windows = self._managed_characters()
        ok, message = self.window_service.focus_last(windows)
        return {'ok': ok, 'message': message}

    def set_game_filter(self, game_type: str, enabled: bool) -> dict[str, object]:
        if game_type == 'retro':
            self.config_data.enable_retro = enabled
        elif game_type == 'unity':
            self.config_data.enable_unity = enabled
        save_config(self.config_data)
        windows = self.refresh_windows()
        return {
            'config': self._serialize_config(),
            'windows': self._serialize_windows(windows),
            'autofocusState': self._serialize_autofocus_state(include_logs=False),
        }

    def set_copy_mp_sender(self, enabled: bool) -> dict[str, object]:
        self.config_data.copy_mp_sender = enabled
        save_config(self.config_data)
        return {
            'config': self._serialize_config(),
            'autofocusState': self._serialize_autofocus_state(include_logs=False),
        }

    def set_character_rule(self, pseudo: str, notif_type: str, enabled: bool) -> dict[str, object]:
        rule = self.config_data.ensure_autofocus_rule(pseudo)
        rule[notif_type] = enabled
        save_config(self.config_data)
        return {'ok': True, 'rule': dict(rule)}

    def set_character_rotation(self, pseudo: str, enabled: bool) -> dict[str, object]:
        rule = self.config_data.ensure_autofocus_rule(pseudo)
        rule['rotation'] = enabled
        save_config(self.config_data)
        return {'ok': True, 'rule': dict(rule)}

    def set_autofocus_type(self, notif_type: str, enabled: bool) -> dict[str, object]:
        self.autofocus_service.set_type_enabled(notif_type, enabled)
        if self.autofocus_service.available:
            if self._any_autofocus_type_enabled() and not self.autofocus_service.running:
                self.autofocus_service.start()
                self._append_autofocus_log('AutoFocus active.', 'ok')
            elif not self._any_autofocus_type_enabled() and self.autofocus_service.running:
                self.autofocus_service.stop()
                self._append_autofocus_log('AutoFocus stoppee (aucun type actif).', 'dim')
        return {'ok': True, 'autofocusState': self._serialize_autofocus_state(include_logs=False)}

    def set_autofocus_debug(self, enabled: bool) -> dict[str, object]:
        self._autofocus_debug_enabled = enabled
        self.autofocus_service.set_debug(enabled)
        if enabled:
            self._append_autofocus_log('Mode debug AutoFocus actif.', 'debug')
        else:
            self._append_autofocus_log('Mode debug AutoFocus desactive.', 'dim')
        return {'ok': True, 'autofocusState': self._serialize_autofocus_state(include_logs=False)}

    def set_shortcut(self, action: str, value: str | None) -> dict[str, object]:
        normalized = normalize_shortcut(value)
        if action == 'next':
            self.config_data.shortcut_next = normalized
        elif action == 'prev':
            self.config_data.shortcut_prev = normalized
        elif action == 'last':
            self.config_data.shortcut_last = normalized
        elif action == 'refresh':
            self.config_data.shortcut_refresh = normalized
        save_config(self.config_data)
        return {'ok': True, 'shortcutsState': self._serialize_shortcuts_state()}

    def apply_shortcuts(self) -> dict[str, object]:
        self._apply_shortcuts(silent=False)
        return {'ok': True, 'shortcutsState': self._serialize_shortcuts_state()}

    def set_shortcuts_debug(self, enabled: bool) -> dict[str, object]:
        self._shortcut_debug_enabled = enabled
        if enabled:
            self.hotkey_service.set_debug_listener(self._shortcut_debug_event)
            with self._lock:
                self._shortcut_status = {'text': 'Mode debug actif.', 'tone': 'muted'}
        else:
            self.hotkey_service.set_debug_listener(None)
            with self._lock:
                self._shortcut_status = {'text': '', 'tone': 'muted'}
        return {'ok': True, 'shortcutsState': self._serialize_shortcuts_state()}

    def save_order(self, hwnds: list[int]) -> dict[str, object]:
        by_hwnd = {window.hwnd: window for window in self._char_order}
        ordered = [by_hwnd[hwnd] for hwnd in hwnds if hwnd in by_hwnd]
        if len(ordered) != len(self._char_order):
            remaining = [window for window in self._char_order if window.hwnd not in {item.hwnd for item in ordered}]
            ordered.extend(remaining)
        self._char_order = ordered
        threading.Thread(
            target=reorder_with_ungroup_regroup,
            args=([window.hwnd for window in self._char_order], None),
            daemon=True,
        ).start()
        return {'ok': True, 'windows': self._serialize_windows(self._char_order)}

    def add_link_group(self, name: str) -> dict[str, object]:
        group_name = str(name).strip()
        if not group_name:
            return {'ok': False, 'message': 'Nom de dossier invalide.'}
        self.config_data.link_groups.append({'id': self._new_id('group'), 'name': group_name, 'collapsed': False, 'links': []})
        return {'ok': True, 'links': self._save_links()}

    def rename_link_group(self, group_id: str, name: str) -> dict[str, object]:
        group = self._get_link_group(group_id)
        if group is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        group_name = str(name).strip()
        if not group_name:
            return {'ok': False, 'message': 'Nom de dossier invalide.'}
        group['name'] = group_name
        return {'ok': True, 'links': self._save_links()}

    def delete_link_group(self, group_id: str) -> dict[str, object]:
        index = self._get_link_group_index(group_id)
        if index is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        self.config_data.link_groups.pop(index)
        return {'ok': True, 'links': self._save_links()}

    def save_link_group_order(self, group_ids: list[str]) -> dict[str, object]:
        if not group_ids:
            return {'ok': False, 'message': 'Ordre de dossiers invalide.'}
        current = list(self.config_data.link_groups)
        by_id = {str(group.get('id')): group for group in current}
        ordered = [by_id[group_id] for group_id in group_ids if group_id in by_id]
        if not ordered:
            return {'ok': False, 'message': 'Ordre de dossiers invalide.'}
        remaining = [group for group in current if str(group.get('id')) not in group_ids]
        self.config_data.link_groups = ordered + remaining
        return {'ok': True, 'links': self._save_links()}

    def move_link_group(self, group_id: str, direction: int) -> dict[str, object]:
        index = self._get_link_group_index(group_id)
        if index is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        target = max(0, min(len(self.config_data.link_groups) - 1, index + direction))
        if target == index:
            return {'ok': True, 'links': self._serialize_links()}
        group = self.config_data.link_groups.pop(index)
        self.config_data.link_groups.insert(target, group)
        return {'ok': True, 'links': self._save_links()}

    def set_link_group_collapsed(self, group_id: str, collapsed: bool) -> dict[str, object]:
        group = self._get_link_group(group_id)
        if group is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        group['collapsed'] = bool(collapsed)
        return {'ok': True, 'links': self._save_links()}

    def add_link(self, group_id: str, label: str, url: str) -> dict[str, object]:
        group = self._get_link_group(group_id)
        if group is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        link_label = str(label).strip()
        link_url = str(url).strip()
        if not link_label or not link_url:
            return {'ok': False, 'message': 'Lien invalide.'}
        group['links'].append({'id': self._new_id('link'), 'label': link_label, 'url': link_url})
        return {'ok': True, 'links': self._save_links()}

    def update_link(self, group_id: str, link_id: str, label: str, url: str) -> dict[str, object]:
        link = self._get_link(group_id, link_id)
        if link is None:
            return {'ok': False, 'message': 'Lien introuvable.'}
        link_label = str(label).strip()
        link_url = str(url).strip()
        if not link_label or not link_url:
            return {'ok': False, 'message': 'Lien invalide.'}
        link['label'] = link_label
        link['url'] = link_url
        return {'ok': True, 'links': self._save_links()}

    def delete_link(self, group_id: str, link_id: str) -> dict[str, object]:
        group = self._get_link_group(group_id)
        if group is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        links = group['links']
        index = next((i for i, item in enumerate(links) if item.get('id') == link_id), None)
        if index is None:
            return {'ok': False, 'message': 'Lien introuvable.'}
        links.pop(index)
        return {'ok': True, 'links': self._save_links()}

    def save_link_order(self, group_id: str, link_ids: list[str]) -> dict[str, object]:
        group = self._get_link_group(group_id)
        if group is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        links = list(group['links'])
        by_id = {str(item.get('id')): item for item in links}
        ordered = [by_id[link_id] for link_id in link_ids if link_id in by_id]
        if not ordered and links:
            return {'ok': False, 'message': 'Ordre de liens invalide.'}
        remaining = [item for item in links if str(item.get('id')) not in link_ids]
        group['links'] = ordered + remaining
        return {'ok': True, 'links': self._save_links()}

    def move_link(self, group_id: str, link_id: str, direction: int) -> dict[str, object]:
        group = self._get_link_group(group_id)
        if group is None:
            return {'ok': False, 'message': 'Dossier introuvable.'}
        links = group['links']
        index = next((i for i, item in enumerate(links) if item.get('id') == link_id), None)
        if index is None:
            return {'ok': False, 'message': 'Lien introuvable.'}
        target = max(0, min(len(links) - 1, index + direction))
        if target == index:
            return {'ok': True, 'links': self._serialize_links()}
        link = links.pop(index)
        links.insert(target, link)
        return {'ok': True, 'links': self._save_links()}

    def open_link(self, url: str) -> dict[str, object]:
        webbrowser.open(url)
        return {'ok': True}

    def search_craft_items(self, query: str, limit: int = 20, source_filter: str = 'all') -> dict[str, object]:
        if not self.craft_catalog.available:
            return {'ok': False, 'message': self.craft_catalog.load_error or 'Catalogue craft indisponible.', 'items': []}
        safe_limit = max(1, min(25, int(limit)))
        return {'ok': True, 'items': self.craft_catalog.search(query, safe_limit, source_filter)}

    def add_craft(self, name: str, sell_price: float, target_quantity: int, item_key: str | None = None) -> dict[str, object]:
        catalog_item = self._get_catalog_item(item_key)
        if item_key and catalog_item is None:
            return {'ok': False, 'message': 'Item introuvable dans la base de craft.'}
        craft_name = catalog_item.name if catalog_item is not None else str(name).strip()
        if not craft_name:
            return {'ok': False, 'message': 'Nom de craft invalide.'}

        craft = {
            'id': self._new_id('craft'),
            'name': craft_name,
            'sell_price': max(0.0, float(sell_price)),
            'target_quantity': max(1, int(target_quantity)),
            'collapsed': False,
            'resources': self.craft_catalog.build_resources(catalog_item, id_factory=self._new_id) if catalog_item is not None else [],
        }
        self._apply_catalog_metadata(craft, catalog_item)
        self.config_data.crafts.append(craft)
        return {'ok': True, 'crafts': self._save_crafts()}

    def update_craft(self, craft_id: str, name: str, sell_price: float, target_quantity: int, item_key: str | None = None) -> dict[str, object]:
        craft = self._get_craft(craft_id)
        if craft is None:
            return {'ok': False, 'message': 'Craft introuvable.'}

        catalog_item = self._get_catalog_item(item_key)
        if item_key and catalog_item is None:
            return {'ok': False, 'message': 'Item introuvable dans la base de craft.'}

        craft_name = catalog_item.name if catalog_item is not None else str(name).strip()
        if not craft_name:
            return {'ok': False, 'message': 'Nom de craft invalide.'}

        previous_item_key = str(craft.get('item_key') or '').strip() or None
        craft['name'] = craft_name
        craft['sell_price'] = max(0.0, float(sell_price))
        craft['target_quantity'] = max(1, int(target_quantity))

        if catalog_item is not None:
            self._apply_catalog_metadata(craft, catalog_item)
            if previous_item_key != catalog_item.key or not craft.get('resources'):
                craft['resources'] = self.craft_catalog.build_resources(catalog_item, craft.get('resources'), id_factory=self._new_id)
        else:
            self._clear_catalog_metadata(craft)

        return {'ok': True, 'crafts': self._save_crafts()}

    def set_craft_target_quantity(self, craft_id: str, target_quantity: int) -> dict[str, object]:
        craft = self._get_craft(craft_id)
        if craft is None:
            return {'ok': False, 'message': 'Craft introuvable.'}
        craft['target_quantity'] = max(1, int(target_quantity))
        return {'ok': True, 'crafts': self._save_crafts()}

    def set_craft_collapsed(self, craft_id: str, collapsed: bool) -> dict[str, object]:
        craft = self._get_craft(craft_id)
        if craft is None:
            return {'ok': False, 'message': 'Craft introuvable.'}
        craft['collapsed'] = bool(collapsed)
        return {'ok': True, 'crafts': self._save_crafts()}

    def set_all_crafts_collapsed(self, collapsed: bool) -> dict[str, object]:
        for craft in self.config_data.crafts:
            craft['collapsed'] = bool(collapsed)
        return {'ok': True, 'crafts': self._save_crafts()}

    def save_craft_order(self, craft_ids: list[str]) -> dict[str, object]:
        if not craft_ids:
            return {'ok': False, 'message': 'Ordre de crafts invalide.'}
        current = list(self.config_data.crafts)
        by_id = {str(craft.get('id')): craft for craft in current}
        ordered = [by_id[craft_id] for craft_id in craft_ids if craft_id in by_id]
        if not ordered:
            return {'ok': False, 'message': 'Ordre de crafts invalide.'}
        remaining = [craft for craft in current if str(craft.get('id')) not in craft_ids]
        self.config_data.crafts = ordered + remaining
        return {'ok': True, 'crafts': self._save_crafts()}

    def delete_craft(self, craft_id: str) -> dict[str, object]:
        index = self._get_craft_index(craft_id)
        if index is None:
            return {'ok': False, 'message': 'Craft introuvable.'}
        self.config_data.crafts.pop(index)
        return {'ok': True, 'crafts': self._save_crafts()}

    def add_craft_resource(self, craft_id: str, name: str, unit_price: float, quantity: int, owned_quantity: int, included: bool) -> dict[str, object]:
        craft = self._get_craft(craft_id)
        if craft is None:
            return {'ok': False, 'message': 'Craft introuvable.'}
        craft['resources'].append(
            {
                'id': self._new_id('resource'),
                'name': str(name or '').strip(),
                'unit_price': max(0.0, float(unit_price)),
                'quantity': max(1, int(quantity)),
                'owned_quantity': max(0, int(owned_quantity)),
                'included': bool(included),
            }
        )
        return {'ok': True, 'crafts': self._save_crafts()}

    def update_craft_resource(self, craft_id: str, resource_id: str, name: str, unit_price: float, quantity: int, owned_quantity: int, included: bool) -> dict[str, object]:
        resource = self._get_craft_resource(craft_id, resource_id)
        if resource is None:
            return {'ok': False, 'message': 'Ressource introuvable.'}
        resource['name'] = str(name or '').strip()
        resource['unit_price'] = max(0.0, float(unit_price))
        resource['quantity'] = max(1, int(quantity))
        resource['owned_quantity'] = max(0, int(owned_quantity))
        resource['included'] = bool(included)
        return {'ok': True, 'crafts': self._save_crafts()}

    def delete_craft_resource(self, craft_id: str, resource_id: str) -> dict[str, object]:
        craft = self._get_craft(craft_id)
        if craft is None:
            return {'ok': False, 'message': 'Craft introuvable.'}
        resources = craft['resources']
        index = next((i for i, item in enumerate(resources) if item.get('id') == resource_id), None)
        if index is None:
            return {'ok': False, 'message': 'Ressource introuvable.'}
        resources.pop(index)
        return {'ok': True, 'crafts': self._save_crafts()}

    def _focus_next(self) -> None:
        self.window_service.cycle(+1, self._managed_characters())

    def _focus_prev(self) -> None:
        self.window_service.cycle(-1, self._managed_characters())

    def _focus_last(self) -> None:
        self.window_service.focus_last(self._managed_characters())

    def _refresh_windows_hotkey(self) -> None:
        threading.Thread(target=self._refresh_windows_hotkey_worker, daemon=True).start()

    def _refresh_windows_hotkey_worker(self) -> None:
        try:
            windows = self.refresh_windows()
            self._queue_windows_update(windows)
        except Exception as exc:
            with self._lock:
                self._shortcut_status = {'text': f'actualiser: {exc}', 'tone': 'danger'}

    def _apply_shortcuts(self, silent: bool = False) -> None:
        self.config_data.shortcut_next = normalize_shortcut(self.config_data.shortcut_next)
        self.config_data.shortcut_prev = normalize_shortcut(self.config_data.shortcut_prev)
        self.config_data.shortcut_last = normalize_shortcut(self.config_data.shortcut_last)
        self.config_data.shortcut_refresh = normalize_shortcut(self.config_data.shortcut_refresh)
        self.hotkey_service.clear_all()

        active: list[str] = []
        errors: list[str] = []
        shortcuts = {
            'next': self.config_data.shortcut_next,
            'prev': self.config_data.shortcut_prev,
            'last': self.config_data.shortcut_last,
            'refresh': self.config_data.shortcut_refresh,
        }
        callbacks = {
            'next': self._focus_next,
            'prev': self._focus_prev,
            'last': self._focus_last,
            'refresh': self._refresh_windows_hotkey,
        }

        for action, shortcut in shortcuts.items():
            if shortcut is None:
                continue
            try:
                self.hotkey_service.register_shortcut(shortcut, callbacks[action])
            except Exception as exc:
                errors.append(f'{action}: {exc}')
                continue
            label = {'next': 'suivant', 'prev': 'precedent', 'last': 'dernier focus', 'refresh': 'actualiser'}[action]
            active.append(f'[{shortcut}] {label}')

        save_config(self.config_data)
        with self._lock:
            if errors:
                self._shortcut_status = {'text': ' ; '.join(errors), 'tone': 'danger'}
            elif not silent and not active:
                self._shortcut_status = {'text': 'Aucun raccourci actif.', 'tone': 'muted'}
            else:
                self._shortcut_status = {'text': '', 'tone': 'muted'}

    def _shortcut_debug_event(self, shortcut: str, recognized: bool) -> None:
        with self._lock:
            self._shortcut_debug_seq += 1
            self._shortcut_debug_events.append(
                {
                    'id': self._shortcut_debug_seq,
                    'timestamp': datetime.now().strftime('%H:%M:%S'),
                    'shortcut': shortcut,
                    'recognized': recognized,
                }
            )

    def _ensure_characters(self) -> None:
        if not self._char_order:
            self.refresh_windows()

    def _managed_characters(self) -> list[GameWindow]:
        self._ensure_characters()
        return [window for window in self._char_order if self._is_character_in_rotation(window.pseudo)]

    def _get_filters(self) -> tuple[bool, bool]:
        return self.config_data.enable_retro, self.config_data.enable_unity

    def _is_character_in_rotation(self, pseudo: str) -> bool:
        rule = self.config_data.ensure_autofocus_rule(pseudo)
        return rule.get('rotation', True)

    def _is_character_autofocus_enabled(self, pseudo: str, notif_type: str) -> bool:
        rule = self.config_data.ensure_autofocus_rule(pseudo)
        return rule.get('rotation', True) and rule.get(notif_type, True)

    def _any_autofocus_type_enabled(self) -> bool:
        return any(self.autofocus_service.is_type_enabled(key) for key in AUTOFOCUS_TYPES)

    def _serialize_config(self) -> dict[str, object]:
        return {
            'enableRetro': self.config_data.enable_retro,
            'enableUnity': self.config_data.enable_unity,
            'copyMpSender': self.config_data.copy_mp_sender,
            'shortcuts': {
                'next': self.config_data.shortcut_next,
                'prev': self.config_data.shortcut_prev,
                'last': self.config_data.shortcut_last,
                'refresh': self.config_data.shortcut_refresh,
            },
            'autofocusRules': self.config_data.autofocus_rules,
        }

    def _serialize_links(self) -> list[dict[str, object]]:
        return deepcopy(self.config_data.link_groups)

    def _save_links(self) -> list[dict[str, object]]:
        save_config(self.config_data)
        return self._serialize_links()

    def _serialize_craft_catalog_state(self) -> dict[str, object]:
        return {
            'available': self.craft_catalog.available,
            'message': '' if self.craft_catalog.available else (self.craft_catalog.load_error or 'Catalogue craft indisponible.'),
        }

    def _serialize_crafts(self) -> list[dict[str, object]]:
        return deepcopy(self.config_data.crafts)

    def _save_crafts(self) -> list[dict[str, object]]:
        save_config(self.config_data)
        return self._serialize_crafts()

    def _get_catalog_item(self, item_key: str | None) -> CraftCatalogItem | None:
        normalized_key = str(item_key or '').strip() or None
        if normalized_key is None:
            return None
        return self.craft_catalog.get_item(normalized_key)

    def _apply_catalog_metadata(self, craft: dict[str, object], item: CraftCatalogItem | None) -> None:
        if item is None:
            self._clear_catalog_metadata(craft)
            return
        craft['item_key'] = item.key
        craft['item_category'] = item.category
        craft['item_source'] = item.source
        craft['item_level'] = item.level
        craft['item_url'] = item.url
        craft['item_panoplie'] = item.panoplie
        craft['item_panoplie_url'] = item.panoplie_url

    def _clear_catalog_metadata(self, craft: dict[str, object]) -> None:
        craft['item_key'] = None
        craft['item_category'] = None
        craft['item_source'] = None
        craft['item_level'] = 0
        craft['item_url'] = None
        craft['item_panoplie'] = None
        craft['item_panoplie_url'] = None

    def _get_craft_index(self, craft_id: str) -> int | None:
        return next((i for i, craft in enumerate(self.config_data.crafts) if craft.get('id') == craft_id), None)

    def _get_craft(self, craft_id: str) -> dict[str, object] | None:
        index = self._get_craft_index(craft_id)
        if index is None:
            return None
        return self.config_data.crafts[index]

    def _get_craft_resource(self, craft_id: str, resource_id: str) -> dict[str, object] | None:
        craft = self._get_craft(craft_id)
        if craft is None:
            return None
        return next((item for item in craft['resources'] if item.get('id') == resource_id), None)

    def _get_link_group_index(self, group_id: str) -> int | None:
        return next((i for i, group in enumerate(self.config_data.link_groups) if group.get('id') == group_id), None)

    def _get_link_group(self, group_id: str) -> dict[str, object] | None:
        index = self._get_link_group_index(group_id)
        if index is None:
            return None
        return self.config_data.link_groups[index]

    def _get_link(self, group_id: str, link_id: str) -> dict[str, str] | None:
        group = self._get_link_group(group_id)
        if group is None:
            return None
        return next((item for item in group['links'] if item.get('id') == link_id), None)

    def _serialize_shortcuts_state(self) -> dict[str, object]:
        with self._lock:
            return self._serialize_shortcuts_state_locked()

    def _serialize_shortcuts_state_locked(self) -> dict[str, object]:
        return {
            'values': {
                'next': self.config_data.shortcut_next,
                'prev': self.config_data.shortcut_prev,
                'last': self.config_data.shortcut_last,
                'refresh': self.config_data.shortcut_refresh,
            },
            'status': dict(self._shortcut_status),
            'debugEnabled': self._shortcut_debug_enabled,
            'keyboardAvailable': KEYBOARD_OK,
            'mouseAvailable': MOUSE_OK,
        }

    def _serialize_autofocus_state(self, include_logs: bool) -> dict[str, object]:
        with self._lock:
            return self._serialize_autofocus_state_locked(include_logs)

    def _serialize_autofocus_state_locked(self, include_logs: bool) -> dict[str, object]:
        payload = {
            'available': self.autofocus_service.available,
            'running': self.autofocus_service.running,
            'debugEnabled': self._autofocus_debug_enabled,
            'enabledTypes': {key: self.autofocus_service.is_type_enabled(key) for key in AUTOFOCUS_TYPES},
            'stats': dict(self._autofocus_stats),
        }
        if include_logs:
            payload['logs'] = list(self._autofocus_logs)
        return payload

    def _serialize_windows(self, windows: list[GameWindow]) -> list[dict[str, object]]:
        result: list[dict[str, object]] = []
        for index, window in enumerate(windows, start=1):
            result.append(
                {
                    'index': index,
                    'hwnd': window.hwnd,
                    'title': window.title,
                    'pseudo': window.pseudo,
                    'gameType': window.game_type,
                    'classe': window.classe,
                    'version': window.version,
                    'rule': self.config_data.ensure_autofocus_rule(window.pseudo),
                    'rotationEnabled': self._is_character_in_rotation(window.pseudo),
                }
            )
        return result

    def _log_dependency_warnings(self) -> None:
        if not WIN32_OK:
            self._append_autofocus_log('pywin32 manquant -> pip install pywin32', 'error')
        if not WINSDK_OK:
            self._append_autofocus_log('winsdk manquant -> pip install winsdk', 'warn')
        if not KEYBOARD_OK:
            self._append_autofocus_log('keyboard non charge -> pip install keyboard', 'warn')
        if not MOUSE_OK:
            self._append_autofocus_log('mouse non charge -> pip install mouse', 'warn')

    def _append_autofocus_log(self, message: str, tag: str) -> None:
        with self._lock:
            self._autofocus_log_seq += 1
            self._autofocus_logs.append(
                {
                    'id': self._autofocus_log_seq,
                    'timestamp': datetime.now().strftime('%H:%M:%S'),
                    'message': message,
                    'tag': tag,
                }
            )

    def _log_from_service(self, message: str, tag: str) -> None:
        self._append_autofocus_log(message, tag)

    def _stats_from_service(self, stats: dict[str, str]) -> None:
        with self._lock:
            self._autofocus_stats = dict(stats)

    def _queue_windows_update(self, windows: list[GameWindow]) -> None:
        with self._lock:
            self._pending_windows = self._serialize_windows(windows)

    @staticmethod
    def _new_id(prefix: str) -> str:
        return f'{prefix}-{uuid4().hex[:8]}'

    @staticmethod
    def _load_assets() -> dict[str, object]:
        assets: dict[str, object] = {
            'logo': as_data_url(LOGO_PATH),
            'autofocus': {},
        }
        for notif_type in AUTOFOCUS_TYPES:
            off_path = ASSETS_DIR / f'{notif_type}.png'
            on_path = ASSETS_DIR / f'{notif_type}_actif.png'
            assets['autofocus'][notif_type] = {
                'off': as_data_url(off_path),
                'on': as_data_url(on_path),
            }
        return assets






