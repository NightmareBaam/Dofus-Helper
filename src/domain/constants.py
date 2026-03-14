import sys
from copy import deepcopy
from pathlib import Path

APP_NAME = "Dofus Helper"
APP_VERSION = "1.0.0"
APP_GITHUB = "https://github.com/NightmareBaam/Dofus-Helper"
APP_TWITTER = "https://x.com/NightmareBaam"
APP_LEGAL = (
    "Dofus Retro est une marque deposee de Ankama et ce projet n'y est pas affilie. "
    "L'utilisation d'un logiciel tiers est toleree uniquement s'il ne modifie pas les "
    "fichiers du jeu et n'interagit pas directement avec celui-ci, comme un simple outil "
    "de gestion de fenetres. Ce logiciel est fourni a titre personnel, sans aucune garantie, "
    "et n'est pas officiellement pris en charge par Ankama. Par consequent, son utilisation "
    "se fait sous l'entiere responsabilite de l'utilisateur : Ankama ne peut garantir la "
    "securite de l'outil et toute violation eventuelle de donnees ou de logs reste a la "
    "charge du joueur. Enfin, il est important de noter que les outils de type macros ou "
    "automatisation restent strictement interdits.\n"
    "Ce projet est un fork de : https://github.com/Slyss42/Dracoon. "
    "Il consiste à ajouter le support Dofus Unity et la possibilité d'utiliser les boutons de la souris et autres fonctionnalités."
)


def _runtime_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parents[2]


ROOT_DIR = _runtime_root()
ICON_PATH = ROOT_DIR / "icon.ico"
ASSETS_DIR = ROOT_DIR / "assets"
LOGO_PATH = ASSETS_DIR / "logo.png"
AUTOFOCUS_TYPES = ("combat", "echange", "groupe", "mp")

REG_PATH = r"Software\DofusRetro"

DEFAULT_SHORTCUT_NEXT = "ctrl+right"
DEFAULT_SHORTCUT_PREV = "ctrl+left"
DEFAULT_SHORTCUT_LAST = "ctrl+down"
DEFAULT_ENABLE_RETRO = True
DEFAULT_ENABLE_UNITY = True

FOCUS_POLL_INTERVAL = 0.15
AUTOFOCUS_POLL_INTERVAL = 0.3

DEFAULT_LINK_GROUPS = [
    {
        "id": "unity",
        "name": "Dofus Unity",
        "collapsed": False,
        "links": [
            {"id": "unity-noobs", "label": "Dofus Pour Les Noobs", "url": "http://www.dofuspourlesnoobs.com/"},
            {"id": "unity-db", "label": "DofusDB", "url": "https://dofusdb.fr/fr/"},
            {"id": "unity-book", "label": "Dofusbook", "url": "https://www.dofusbook.net/fr/"},
            {"id": "unity-dofensive", "label": "Dofensive", "url": "http://dofensive.com/fr"},
            {"id": "unity-yelle", "label": "DofusYelle", "url": "https://dofusyelle.com"},
            {"id": "unity-huz", "label": "Huzounet", "url": "https://huzounet.fr/equipments"},
        ],
    },
    {
        "id": "retro",
        "name": "Dofus Retro",
        "collapsed": False,
        "links": [
            {"id": "retro-book", "label": "Retro Dofusbook", "url": "https://retro.dofusbook.net/fr/"},
            {"id": "retro-solomonk", "label": "Solomonk", "url": "https://solomonk.fr/fr/"},
        ],
    },
]


def default_link_groups() -> list[dict[str, object]]:
    return deepcopy(DEFAULT_LINK_GROUPS)
