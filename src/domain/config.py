import winreg

from src.domain.constants import REG_PATH
from src.domain.models import AppConfig


def load_config() -> AppConfig:
    data: dict[str, object] = {}
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH)
    except FileNotFoundError:
        return AppConfig()

    with key:
        index = 0
        while True:
            try:
                name, value, _ = winreg.EnumValue(key, index)
            except OSError:
                break
            data[name] = value if value != "" else None
            index += 1

    return AppConfig.from_mapping(data)


def save_config(config: AppConfig) -> None:
    try:
        key = winreg.CreateKeyEx(
            winreg.HKEY_CURRENT_USER,
            REG_PATH,
            access=winreg.KEY_WRITE,
        )
    except OSError:
        return

    with key:
        for name, value in config.to_registry_mapping().items():
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
