from __future__ import annotations

import sys
from pathlib import Path

CONTROLLER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import webview

from src.ui.controller.api import WebviewApi
from src.ui.controller.runtime import runtime_static_dir


class AppWindow:
    def __init__(self) -> None:
        self.api = WebviewApi()
        self.window = None

    def run(self) -> None:
        index_file = runtime_static_dir() / 'index.html'
        self.window = webview.create_window(
            'Dofus Helper',
            index_file.as_uri(),
            js_api=self.api,
            width=1280,
            height=860,
            min_size=(980, 640),
            text_select=False,
        )
        webview.start(private_mode=False)
        self.api.shutdown()


def main() -> None:
    AppWindow().run()


if __name__ == '__main__':
    main()
