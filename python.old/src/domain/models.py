import json
from dataclasses import dataclass, field
from typing import Literal, Mapping
from uuid import uuid4

from src.domain.constants import (
    AUTOFOCUS_TYPES,
    DEFAULT_COPY_MP_SENDER,
    DEFAULT_ENABLE_RETRO,
    DEFAULT_ENABLE_UNITY,
    DEFAULT_SHORTCUT_LAST,
    DEFAULT_SHORTCUT_NEXT,
    DEFAULT_SHORTCUT_PREV,
    DEFAULT_SHORTCUT_REFRESH,
    default_link_groups,
)

GameType = Literal["retro", "unity"]


def _parse_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    raw = str(value).strip().casefold()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_optional_shortcut(value: object, default: str | None) -> str | None:
    if value is None:
        return default
    raw = str(value).strip()
    return raw or None


def _parse_optional_string(value: object) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    return raw or None


def _parse_float(value: object, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return default
    raw = str(value).strip().replace(",", ".")
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _parse_positive_int(value: object, default: int = 1) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return max(1, value)
    if isinstance(value, float):
        return max(1, int(value))
    if value is None:
        return default
    raw = str(value).strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def _parse_non_negative_int(value: object, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if value is None:
        return default
    raw = str(value).strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default

def _normalized_craft_resource(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    resource_id = str(value.get("id") or _make_id("resource")).strip() or _make_id("resource")
    return {
        "id": resource_id,
        "name": str(value.get("name") or "").strip(),
        "unit_price": _parse_float(value.get("unit_price"), 0.0),
        "quantity": _parse_positive_int(value.get("quantity"), 1),
        "owned_quantity": _parse_non_negative_int(value.get("owned_quantity"), 0),
        "included": _parse_bool(value.get("included"), True),
    }


def _parse_crafts(value: object) -> list[dict[str, object]]:
    if value in {None, ""}:
        return []

    raw_crafts = value
    if isinstance(value, str):
        try:
            raw_crafts = json.loads(value)
        except json.JSONDecodeError:
            return []

    if not isinstance(raw_crafts, list):
        return []

    crafts: list[dict[str, object]] = []
    for item in raw_crafts:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        craft_id = str(item.get("id") or _make_id("craft")).strip() or _make_id("craft")
        resources: list[dict[str, object]] = []
        raw_resources = item.get("resources", [])
        if isinstance(raw_resources, list):
            for resource in raw_resources:
                normalized_resource = _normalized_craft_resource(resource)
                if normalized_resource is not None:
                    resources.append(normalized_resource)
        crafts.append(
            {
                "id": craft_id,
                "name": name,
                "sell_price": _parse_float(item.get("sell_price"), 0.0),
                "target_quantity": _parse_positive_int(item.get("target_quantity"), 1),
                "collapsed": _parse_bool(item.get("collapsed"), False),
                "item_key": _parse_optional_string(item.get("item_key")),
                "item_category": _parse_optional_string(item.get("item_category")),
                "item_source": _parse_optional_string(item.get("item_source")),
                "item_level": _parse_non_negative_int(item.get("item_level"), 0),
                "item_url": _parse_optional_string(item.get("item_url")),
                "item_panoplie": _parse_optional_string(item.get("item_panoplie")),
                "item_panoplie_url": _parse_optional_string(item.get("item_panoplie_url") or item.get("item_panoplieUrl")),
                "resources": resources,
            }
        )
    return crafts


def _default_autofocus_rule() -> dict[str, bool]:
    rule = {notif_type: True for notif_type in AUTOFOCUS_TYPES}
    rule["rotation"] = True
    return rule


def _make_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def _normalized_link_item(value: object) -> dict[str, str] | None:
    if isinstance(value, dict):
        label = str(value.get("label") or "").strip()
        url = str(value.get("url") or "").strip()
        if not label or not url:
            return None
        link_id = str(value.get("id") or _make_id("link")).strip() or _make_id("link")
        return {"id": link_id, "label": label, "url": url}

    if isinstance(value, (list, tuple)) and len(value) >= 2:
        label = str(value[0]).strip()
        url = str(value[1]).strip()
        if not label or not url:
            return None
        return {"id": _make_id("link"), "label": label, "url": url}

    return None


def _parse_link_groups(value: object) -> list[dict[str, object]]:
    if value in {None, ""}:
        return default_link_groups()

    raw_groups = value
    if isinstance(value, str):
        try:
            raw_groups = json.loads(value)
        except json.JSONDecodeError:
            return default_link_groups()

    normalized: list[dict[str, object]] = []

    if isinstance(raw_groups, dict):
        for group_name, items in raw_groups.items():
            if not isinstance(group_name, str):
                continue
            links = []
            if isinstance(items, list):
                for item in items:
                    normalized_item = _normalized_link_item(item)
                    if normalized_item is not None:
                        links.append(normalized_item)
            normalized.append({"id": _make_id("group"), "name": group_name.strip() or "Dossier", "collapsed": False, "links": links})
        return normalized or default_link_groups()

    if not isinstance(raw_groups, list):
        return default_link_groups()

    for group in raw_groups:
        if not isinstance(group, dict):
            continue
        name = str(group.get("name") or "").strip()
        if not name:
            continue
        group_id = str(group.get("id") or _make_id("group")).strip() or _make_id("group")
        collapsed = _parse_bool(group.get("collapsed"), False)
        links: list[dict[str, str]] = []
        raw_links = group.get("links", [])
        if isinstance(raw_links, list):
            for item in raw_links:
                normalized_item = _normalized_link_item(item)
                if normalized_item is not None:
                    links.append(normalized_item)
        normalized.append({"id": group_id, "name": name, "collapsed": collapsed, "links": links})

    return normalized or default_link_groups()


def _parse_autofocus_rules(value: object) -> dict[str, dict[str, bool]]:
    if value in {None, ""}:
        return {}
    raw_rules = value
    if isinstance(value, str):
        try:
            raw_rules = json.loads(value)
        except json.JSONDecodeError:
            return {}
    if not isinstance(raw_rules, dict):
        return {}

    normalized: dict[str, dict[str, bool]] = {}
    for pseudo, settings in raw_rules.items():
        if not isinstance(pseudo, str):
            continue
        base = _default_autofocus_rule()
        if isinstance(settings, dict):
            for notif_type in AUTOFOCUS_TYPES:
                base[notif_type] = _parse_bool(settings.get(notif_type), True)
            base["rotation"] = _parse_bool(settings.get("rotation"), True)
        normalized[pseudo] = base
    return normalized


@dataclass(slots=True)
class GameWindow:
    hwnd: int
    title: str
    pseudo: str
    game_type: GameType
    classe: str | None = None
    version: str | None = None


@dataclass(slots=True)
class AppConfig:
    shortcut_next: str | None = DEFAULT_SHORTCUT_NEXT
    shortcut_prev: str | None = DEFAULT_SHORTCUT_PREV
    shortcut_last: str | None = DEFAULT_SHORTCUT_LAST
    shortcut_refresh: str | None = DEFAULT_SHORTCUT_REFRESH
    enable_retro: bool = DEFAULT_ENABLE_RETRO
    enable_unity: bool = DEFAULT_ENABLE_UNITY
    copy_mp_sender: bool = DEFAULT_COPY_MP_SENDER
    autofocus_rules: dict[str, dict[str, bool]] = field(default_factory=dict)
    link_groups: list[dict[str, object]] = field(default_factory=default_link_groups)
    crafts: list[dict[str, object]] = field(default_factory=list)

    @classmethod
    def from_mapping(cls, data: Mapping[str, object]) -> "AppConfig":
        return cls(
            shortcut_next=_parse_optional_shortcut(
                data.get("shortcut_next"),
                DEFAULT_SHORTCUT_NEXT,
            ),
            shortcut_prev=_parse_optional_shortcut(
                data.get("shortcut_prev"),
                DEFAULT_SHORTCUT_PREV,
            ),
            shortcut_last=_parse_optional_shortcut(
                data.get("shortcut_last"),
                DEFAULT_SHORTCUT_LAST,
            ),
            shortcut_refresh=_parse_optional_shortcut(
                data.get("shortcut_refresh"),
                DEFAULT_SHORTCUT_REFRESH,
            ),
            enable_retro=_parse_bool(data.get("enable_retro"), DEFAULT_ENABLE_RETRO),
            enable_unity=_parse_bool(data.get("enable_unity"), DEFAULT_ENABLE_UNITY),
            copy_mp_sender=_parse_bool(data.get("copy_mp_sender"), DEFAULT_COPY_MP_SENDER),
            autofocus_rules=_parse_autofocus_rules(data.get("autofocus_rules")),
            link_groups=_parse_link_groups(data.get("link_groups")),
            crafts=_parse_crafts(data.get("crafts")),
        )

    def to_registry_mapping(self) -> dict[str, str]:
        return {
            "shortcut_next": "" if self.shortcut_next is None else self.shortcut_next,
            "shortcut_prev": "" if self.shortcut_prev is None else self.shortcut_prev,
            "shortcut_last": "" if self.shortcut_last is None else self.shortcut_last,
            "shortcut_refresh": "" if self.shortcut_refresh is None else self.shortcut_refresh,
            "enable_retro": "true" if self.enable_retro else "false",
            "enable_unity": "true" if self.enable_unity else "false",
            "copy_mp_sender": "true" if self.copy_mp_sender else "false",
            "autofocus_rules": json.dumps(self.autofocus_rules, ensure_ascii=True),
            "link_groups": json.dumps(self.link_groups, ensure_ascii=True),
            "crafts": json.dumps(self.crafts, ensure_ascii=True),
        }

    def ensure_autofocus_rule(self, pseudo: str) -> dict[str, bool]:
        rule = self.autofocus_rules.get(pseudo)
        if rule is None:
            rule = _default_autofocus_rule()
            self.autofocus_rules[pseudo] = rule
            return rule
        for notif_type in AUTOFOCUS_TYPES:
            rule.setdefault(notif_type, True)
        rule.setdefault("rotation", True)
        return rule


