import time
from collections.abc import Callable

from src.domain.utils.win32_helpers import set_window_app_id, set_window_z_order

DOFUS_GROUP_ID = "DofusRetro.SharedGroup"


def reorder_with_ungroup_regroup(
    hwnds: list[int],
    log_fn: Callable[[str, str], None] | None = None,
) -> None:
    if not hwnds:
        return

    for hwnd in hwnds:
        ok = set_window_app_id(hwnd, f"DofusRetro.Char.{hwnd}")
        if log_fn is not None:
            log_fn(f"  Ungroup hwnd={hwnd} -> {'OK' if ok else 'ECHEC'}", "debug")

    time.sleep(0.3)

    for index in range(len(hwnds) - 1):
        set_window_z_order(hwnds[index], hwnds[index + 1])
        time.sleep(0.05)

    time.sleep(0.2)

    for hwnd in hwnds:
        ok = set_window_app_id(hwnd, DOFUS_GROUP_ID)
        if log_fn is not None:
            log_fn(f"  Regroup hwnd={hwnd} -> {'OK' if ok else 'ECHEC'}", "debug")

    if log_fn is not None:
        log_fn("  Reorganisation terminee.", "ok")
