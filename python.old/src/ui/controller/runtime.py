from __future__ import annotations

import base64
import sys
from pathlib import Path


CONTROLLER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

STATIC_DIR = CONTROLLER_DIR.parent / 'view' / 'static'


def runtime_root() -> Path:
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        return Path(sys._MEIPASS)
    return PROJECT_ROOT


def runtime_static_dir() -> Path:
    root = runtime_root()
    packaged = root / 'src' / 'ui' / 'view' / 'static'
    if packaged.exists():
        return packaged
    return STATIC_DIR


def as_data_url(path: Path) -> str:
    suffix = path.suffix.lower()
    mime = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.ico': 'image/x-icon',
    }.get(suffix, 'application/octet-stream')
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{encoded}'
