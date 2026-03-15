from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path


CATALOG_DIRECTORIES = (
    Path("bdd_items"),
    Path("bdd"),
)
CATALOG_GLOB = "dofus*_items.json"
CATALOG_FALLBACK = "dofus_retro_items.json"
KNOWN_SOURCES = {"all", "retro", "unity"}
_TRIGRAM_SIZE = 3


@dataclass(frozen=True)
class CraftCatalogResource:
    name: str
    quantity: int


@dataclass(frozen=True)
class CraftCatalogItem:
    key: str
    name: str
    normalized_name: str
    category: str
    source: str
    level: int
    url: str
    panoplie: str
    panoplie_url: str
    recipe: tuple[CraftCatalogResource, ...]

    @property
    def recipe_count(self) -> int:
        return len(self.recipe)

    @property
    def source_label(self) -> str:
        return _source_label(self.source)

    def as_summary(self) -> dict[str, object]:
        return {
            "key": self.key,
            "name": self.name,
            "category": self.category,
            "source": self.source,
            "sourceLabel": self.source_label,
            "level": self.level,
            "url": self.url,
            "panoplie": self.panoplie,
            "panoplieUrl": self.panoplie_url,
            "recipeCount": self.recipe_count,
        }


class CraftCatalog:
    def __init__(self) -> None:
        self._items: list[CraftCatalogItem] = []
        self._items_by_key: dict[str, CraftCatalogItem] = {}
        self._trigram_index: dict[str, list[int]] = {}
        self._load_error: str | None = None
        self._catalog_paths: tuple[Path, ...] = ()
        self._load()

    @property
    def available(self) -> bool:
        return self._load_error is None and bool(self._items)

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def catalog_paths(self) -> tuple[Path, ...]:
        return self._catalog_paths

    def search(self, query: str, limit: int = 20, source_filter: str = "all") -> list[dict[str, object]]:
        normalized_query = _normalize_search(query)
        if len(normalized_query) < _TRIGRAM_SIZE:
            return []
        safe_source_filter = _normalize_source_filter(source_filter)
        candidates = self._candidate_indices(normalized_query)
        scored: list[tuple[int, int, str, int]] = []
        for index in candidates:
            item = self._items[index]
            if safe_source_filter != "all" and item.source != safe_source_filter:
                continue
            if normalized_query not in item.normalized_name:
                continue
            score = _match_score(item.normalized_name, normalized_query)
            scored.append((score, item.level, item.name.casefold(), index))
        scored.sort()
        return [self._items[index].as_summary() for _, _, _, index in scored[: max(1, int(limit))]]

    def get_item(self, key: str | None) -> CraftCatalogItem | None:
        if key is None:
            return None
        return self._items_by_key.get(str(key).strip())

    def build_resources(
        self,
        item: CraftCatalogItem,
        existing_resources: list[dict[str, object]] | None = None,
        *,
        id_factory,
    ) -> list[dict[str, object]]:
        existing_by_name: dict[str, dict[str, object]] = {}
        for resource in existing_resources or []:
            normalized_name = _normalize_search(resource.get("name"))
            if normalized_name and normalized_name not in existing_by_name:
                existing_by_name[normalized_name] = resource

        resources: list[dict[str, object]] = []
        for recipe_resource in item.recipe:
            previous = existing_by_name.get(_normalize_search(recipe_resource.name))
            resources.append(
                {
                    "id": str(previous.get("id")) if previous and previous.get("id") else id_factory("resource"),
                    "name": recipe_resource.name,
                    "unit_price": _parse_float(previous.get("unit_price") if previous else 0.0),
                    "quantity": max(1, recipe_resource.quantity),
                    "owned_quantity": _parse_non_negative_int(previous.get("owned_quantity") if previous else 0),
                    "included": _parse_bool(previous.get("included") if previous else True, True),
                }
            )
        return resources

    def _load(self) -> None:
        try:
            catalog_files = _iter_catalog_files()
        except Exception as exc:
            self._load_error = str(exc)
            return

        items: list[CraftCatalogItem] = []
        trigram_index: dict[str, set[int]] = {}
        seen_keys: set[str] = set()
        loaded_paths: list[Path] = []

        for source, catalog_path in catalog_files:
            raw_catalog = _parse_catalog_text(catalog_path.read_text(encoding="utf-8"))
            loaded_paths.append(catalog_path)
            for category, raw_items in raw_catalog.items():
                if not isinstance(raw_items, list):
                    continue
                for raw_item in raw_items:
                    item = _normalize_item(source, category, raw_item, seen_keys)
                    if item is None:
                        continue
                    index = len(items)
                    items.append(item)
                    for trigram in _iter_trigrams(item.normalized_name):
                        trigram_index.setdefault(trigram, set()).add(index)

        self._items = items
        self._items_by_key = {item.key: item for item in items}
        self._trigram_index = {key: sorted(indexes) for key, indexes in trigram_index.items()}
        self._catalog_paths = tuple(loaded_paths)
        if not items:
            self._load_error = "Aucun item exploitable trouve dans les catalogues craft."

    def _candidate_indices(self, normalized_query: str) -> list[int]:
        query_trigrams = list(dict.fromkeys(_iter_trigrams(normalized_query)))
        if not query_trigrams:
            return list(range(len(self._items)))

        candidate_sets: list[set[int]] = []
        for trigram in query_trigrams:
            indexes = self._trigram_index.get(trigram)
            if not indexes:
                return []
            candidate_sets.append(set(indexes))

        candidate_sets.sort(key=len)
        candidates = candidate_sets[0]
        for subset in candidate_sets[1:]:
            candidates &= subset
            if not candidates:
                return []
        return sorted(candidates)


def _runtime_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parents[2]


def _iter_catalog_files() -> list[tuple[str, Path]]:
    root = _runtime_root()
    discovered: list[Path] = []
    for directory in CATALOG_DIRECTORIES:
        base_dir = root / directory
        if not base_dir.exists():
            continue
        discovered.extend(sorted(path for path in base_dir.glob(CATALOG_GLOB) if path.is_file()))

    if not discovered:
        fallback = root / CATALOG_DIRECTORIES[0] / CATALOG_FALLBACK
        raise FileNotFoundError(f"Fichier de catalogue introuvable ({fallback}).")

    unique_paths: list[Path] = []
    seen_paths: set[str] = set()
    for path in discovered:
        key = str(path.resolve()).casefold()
        if key in seen_paths:
            continue
        seen_paths.add(key)
        unique_paths.append(path)
    return [(_source_from_path(path), path) for path in unique_paths]


def _source_from_path(path: Path) -> str:
    lower_name = path.name.casefold()
    if "retro" in lower_name:
        return "retro"
    if "unity" in lower_name:
        return "unity"
    return "unknown"


def _source_label(source: str) -> str:
    labels = {
        "retro": "Retro",
        "unity": "Unity",
        "unknown": "Autre",
    }
    return labels.get(source, source.capitalize() or "Autre")


def _normalize_source_filter(source_filter: str | None) -> str:
    normalized = str(source_filter or "all").strip().casefold()
    if normalized in KNOWN_SOURCES:
        return normalized
    return "all"


def _parse_catalog_text(raw_text: str) -> dict[str, object]:
    patched = _escape_embedded_quotes_in_json_lines(raw_text)
    patched = patched.replace('"panoplieurl"', '"panoplieUrl"')
    patched = re.sub(
        r'"recette"\s*:\s*\[\s*"panoplie"\s*:\s*"([^"]*)"\s*"panoplieUrl"\s*:\s*"([^"]*)"\s*,',
        r'"panoplie": "\1", "panoplieUrl": "\2", "recette": [',
        patched,
        flags=re.IGNORECASE | re.DOTALL,
    )
    patched = re.sub(
        r'"recette"\s*:\s*\[\s*"panoplie"\s*:\s*"([^"]*)"\s*"panoplieUrl"\s*:\s*"([^"]*)"\s*(\{)',
        r'"panoplie": "\1", "panoplieUrl": "\2", "recette": [\3',
        patched,
        flags=re.IGNORECASE | re.DOTALL,
    )
    patched = re.sub(r",(\s*[\]}])", r"\1", patched)
    parsed = json.loads(patched)
    if not isinstance(parsed, dict):
        raise ValueError("Le catalogue d'items doit etre un objet JSON par categorie.")
    return parsed


def _escape_embedded_quotes_in_json_lines(raw_text: str) -> str:
    escaped_lines: list[str] = []
    pattern = re.compile(r'^(\s*"[^\"]+"\s*:\s*")(.*)("\s*,?\s*)$')
    for line in raw_text.splitlines():
        match = pattern.match(line)
        if not match:
            escaped_lines.append(line)
            continue
        prefix, value, suffix = match.groups()
        value = re.sub(r'(?<!\\)"', r'\\"', value)
        escaped_lines.append(f'{prefix}{value}{suffix}')
    return "\n".join(escaped_lines)


def _normalize_item(source: str, category: str, value: object, seen_keys: set[str]) -> CraftCatalogItem | None:
    if not isinstance(value, dict):
        return None
    name = str(value.get("nom") or value.get("name") or "").strip()
    if not name:
        return None
    normalized_name = _normalize_search(name)
    if len(normalized_name) < _TRIGRAM_SIZE:
        return None

    level = _parse_non_negative_int(value.get("niveau") or value.get("level"), 0)
    url = str(value.get("url") or "").strip()
    panoplie = str(value.get("panoplie") or "").strip()
    panoplie_url = str(value.get("panoplieUrl") or value.get("panoplieurl") or "").strip()

    recipe: list[CraftCatalogResource] = []
    raw_recipe = value.get("recette")
    if isinstance(raw_recipe, list):
        for raw_resource in raw_recipe:
            resource = _normalize_recipe_resource(raw_resource)
            if resource is not None:
                recipe.append(resource)

    key = _build_item_key(source, category, name, level, url, seen_keys)
    return CraftCatalogItem(
        key=key,
        name=name,
        normalized_name=normalized_name,
        category=str(category).strip(),
        source=source,
        level=level,
        url=url,
        panoplie=panoplie,
        panoplie_url=panoplie_url,
        recipe=tuple(recipe),
    )


def _normalize_recipe_resource(value: object) -> CraftCatalogResource | None:
    if not isinstance(value, dict):
        return None
    name = str(value.get("nom") or value.get("name") or "").strip()
    if not name:
        return None
    quantity = _parse_positive_int(value.get("quantite") or value.get("quantity"), 1)
    return CraftCatalogResource(name=name, quantity=quantity)


def _build_item_key(source: str, category: str, name: str, level: int, url: str, seen_keys: set[str]) -> str:
    base_key = _normalize_search(f"{source} {url or f'{category} {name} {level}'}").replace(" ", "-")
    if not base_key:
        base_key = f"{_normalize_search(source)}-{_normalize_search(category)}-{level}"
    candidate = base_key
    suffix = 2
    while candidate in seen_keys:
        candidate = f"{base_key}-{suffix}"
        suffix += 1
    seen_keys.add(candidate)
    return candidate


def _iter_trigrams(value: str) -> set[str]:
    compact = value.replace(" ", "")
    if len(compact) < _TRIGRAM_SIZE:
        return {compact} if compact else set()
    return {compact[index : index + _TRIGRAM_SIZE] for index in range(len(compact) - _TRIGRAM_SIZE + 1)}


def _match_score(normalized_name: str, normalized_query: str) -> int:
    if normalized_name.startswith(normalized_query):
        return 0
    if any(part.startswith(normalized_query) for part in normalized_name.split()):
        return 1
    return 2


def _normalize_search(value: object) -> str:
    raw = str(value or "").strip().casefold()
    if not raw:
        return ""
    normalized = unicodedata.normalize("NFKD", raw)
    without_accents = "".join(character for character in normalized if not unicodedata.combining(character))
    cleaned = re.sub(r"[^a-z0-9]+", " ", without_accents)
    return re.sub(r"\s+", " ", cleaned).strip()


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
    digits = re.findall(r"\d+", str(value))
    if not digits:
        return default
    try:
        return max(1, int(digits[0]))
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
    digits = re.findall(r"-?\d+", str(value))
    if not digits:
        return default
    try:
        return max(0, int(digits[0]))
    except ValueError:
        return default


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
