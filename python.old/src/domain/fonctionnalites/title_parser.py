import re

from src.domain.models import GameWindow

RETRO_TITLE_PATTERN = re.compile(
    r"^(?P<pseudo>.+?)\s*-\s*Dofus\s+Retro\s+v(?P<version>\d+(?:\.\d+)+)\s*$",
    re.IGNORECASE,
)
UNITY_VERSION_PATTERN = re.compile(r"^\d+(?:\.\d+)+$")
UNITY_RELEASE_LABEL = "release"


def parse_window_title(hwnd: int, title: str) -> GameWindow | None:
    normalized_title = title.strip()
    if not normalized_title:
        return None

    retro_window = _parse_retro_title(hwnd, normalized_title)
    if retro_window is not None:
        return retro_window

    return _parse_unity_title(hwnd, normalized_title)


def extract_pseudo_from_title(title: str) -> str | None:
    window = parse_window_title(0, title)
    return None if window is None else window.pseudo


def is_supported_dofus_title(title: str) -> bool:
    return parse_window_title(0, title) is not None


def _parse_retro_title(hwnd: int, title: str) -> GameWindow | None:
    match = RETRO_TITLE_PATTERN.fullmatch(title)
    if match is None:
        return None

    pseudo = match.group("pseudo").strip()
    version = match.group("version")
    if not pseudo:
        return None

    return GameWindow(
        hwnd=hwnd,
        title=title,
        pseudo=pseudo,
        game_type="retro",
        version=version,
    )


def _parse_unity_title(hwnd: int, title: str) -> GameWindow | None:
    parts = [part.strip() for part in title.split(" - ")]
    if len(parts) < 4:
        return None
    if parts[-1].casefold() != UNITY_RELEASE_LABEL:
        return None

    pseudo = " - ".join(parts[:-3]).strip()
    classe = parts[-3]
    version = parts[-2]
    if not pseudo or not classe or not UNITY_VERSION_PATTERN.fullmatch(version):
        return None

    return GameWindow(
        hwnd=hwnd,
        title=title,
        pseudo=pseudo,
        game_type="unity",
        classe=classe,
        version=version,
    )
