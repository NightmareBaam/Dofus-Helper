import json
from dataclasses import dataclass, field
from typing import Literal, Mapping
from uuid import uuid4

from src.domain.constants import (
    AUTOFOCUS_TYPES,
    DEFAULT_ENABLE_RETRO,
    DEFAULT_ENABLE_UNITY,
    DEFAULT_SHORTCUT_LAST,
    DEFAULT_SHORTCUT_NEXT,
    DEFAULT_SHORTCUT_PREV,
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


def _default_autofocus_rule() -> dict[str, bool]:
    return {notif_type: True for notif_type in AUTOFOCUS_TYPES}


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
    enable_retro: bool = DEFAULT_ENABLE_RETRO
    enable_unity: bool = DEFAULT_ENABLE_UNITY
    autofocus_rules: dict[str, dict[str, bool]] = field(default_factory=dict)
    link_groups: list[dict[str, object]] = field(default_factory=default_link_groups)

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
            enable_retro=_parse_bool(data.get("enable_retro"), DEFAULT_ENABLE_RETRO),
            enable_unity=_parse_bool(data.get("enable_unity"), DEFAULT_ENABLE_UNITY),
            autofocus_rules=_parse_autofocus_rules(data.get("autofocus_rules")),
            link_groups=_parse_link_groups(data.get("link_groups")),
        )

    def to_registry_mapping(self) -> dict[str, str]:
        return {
            "shortcut_next": "" if self.shortcut_next is None else self.shortcut_next,
            "shortcut_prev": "" if self.shortcut_prev is None else self.shortcut_prev,
            "shortcut_last": "" if self.shortcut_last is None else self.shortcut_last,
            "enable_retro": "true" if self.enable_retro else "false",
            "enable_unity": "true" if self.enable_unity else "false",
            "autofocus_rules": json.dumps(self.autofocus_rules, ensure_ascii=True),
            "link_groups": json.dumps(self.link_groups, ensure_ascii=True),
        }

    def ensure_autofocus_rule(self, pseudo: str) -> dict[str, bool]:
        rule = self.autofocus_rules.get(pseudo)
        if rule is None:
            rule = _default_autofocus_rule()
            self.autofocus_rules[pseudo] = rule
            return rule
        for notif_type in AUTOFOCUS_TYPES:
            rule.setdefault(notif_type, True)
        return rule
