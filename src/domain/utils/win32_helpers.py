import ctypes
import ctypes.wintypes as wt

try:
    import win32api
    import win32con
    import win32gui

    WIN32_OK = True
except Exception:
    win32api = None
    win32con = None
    win32gui = None
    WIN32_OK = False

try:
    import winsdk.windows.ui.notifications as winnot
    import winsdk.windows.ui.notifications.management as winman

    WINSDK_OK = True
except Exception:
    winman = None
    winnot = None
    WINSDK_OK = False


class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class _PROPERTYKEY(ctypes.Structure):
    _fields_ = [("fmtid", _GUID), ("pid", ctypes.c_ulong)]


class _PROPVARIANT(ctypes.Structure):
    _fields_ = [
        ("vt", ctypes.c_ushort),
        ("pad1", ctypes.c_ushort),
        ("pad2", ctypes.c_ushort),
        ("pad3", ctypes.c_ushort),
        ("ptr", ctypes.c_void_p),
    ]


VT_LPWSTR = 31
VT_EMPTY = 0
SWP_FLAGS = 0x0010 | 0x0002 | 0x0001

_PKEY_AUMI = _PROPERTYKEY()
_PKEY_AUMI.fmtid.Data1 = 0x9F4C2855
_PKEY_AUMI.fmtid.Data2 = 0x9F79
_PKEY_AUMI.fmtid.Data3 = 0x4B39
for _index, _byte in enumerate([0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3]):
    _PKEY_AUMI.fmtid.Data4[_index] = _byte
_PKEY_AUMI.pid = 5

_IID_PS = _GUID()
_IID_PS.Data1 = 0x886D8EEB
_IID_PS.Data2 = 0x8CF2
_IID_PS.Data3 = 0x4446
for _index, _byte in enumerate([0x8D, 0x02, 0xCD, 0xBA, 0x1D, 0xBD, 0xCF, 0x99]):
    _IID_PS.Data4[_index] = _byte

try:
    _shell32 = ctypes.windll.shell32
    _shell32.SHGetPropertyStoreForWindow.restype = ctypes.HRESULT
    _shell32.SHGetPropertyStoreForWindow.argtypes = [
        wt.HWND,
        ctypes.POINTER(_GUID),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    UNGROUP_OK = True
except Exception:
    _shell32 = None
    UNGROUP_OK = False

try:
    _user32 = ctypes.windll.user32
except Exception:
    _user32 = None

try:
    _kernel32 = ctypes.windll.kernel32
except Exception:
    _kernel32 = None

CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002

if _user32 is not None:
    _user32.OpenClipboard.argtypes = [wt.HWND]
    _user32.OpenClipboard.restype = wt.BOOL
    _user32.EmptyClipboard.argtypes = []
    _user32.EmptyClipboard.restype = wt.BOOL
    _user32.SetClipboardData.argtypes = [wt.UINT, ctypes.c_void_p]
    _user32.SetClipboardData.restype = ctypes.c_void_p
    _user32.CloseClipboard.argtypes = []
    _user32.CloseClipboard.restype = wt.BOOL

if _kernel32 is not None:
    _kernel32.GlobalAlloc.argtypes = [wt.UINT, ctypes.c_size_t]
    _kernel32.GlobalAlloc.restype = ctypes.c_void_p
    _kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
    _kernel32.GlobalLock.restype = ctypes.c_void_p
    _kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    _kernel32.GlobalUnlock.restype = wt.BOOL
    _kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
    _kernel32.GlobalFree.restype = ctypes.c_void_p


def enum_windows(callback) -> None:
    if not WIN32_OK:
        return
    win32gui.EnumWindows(callback, None)


def is_window_visible(hwnd: int) -> bool:
    return bool(WIN32_OK and win32gui.IsWindowVisible(hwnd))


def get_window_text(hwnd: int) -> str:
    if not WIN32_OK:
        return ""
    try:
        return win32gui.GetWindowText(hwnd)
    except Exception:
        return ""


def is_iconic(hwnd: int) -> bool:
    return bool(WIN32_OK and win32gui.IsIconic(hwnd))


def show_window(hwnd: int, command: int) -> None:
    if WIN32_OK:
        win32gui.ShowWindow(hwnd, command)


def get_foreground_window() -> int | None:
    if not WIN32_OK:
        return None
    try:
        return win32gui.GetForegroundWindow()
    except Exception:
        return None


def focus_window(hwnd: int) -> tuple[bool, str]:
    if not WIN32_OK:
        return False, "pywin32 indisponible"
    try:
        title = get_window_text(hwnd)
        if is_iconic(hwnd):
            show_window(hwnd, win32con.SW_RESTORE)
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        win32gui.SetForegroundWindow(hwnd)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
        return True, title
    except Exception as exc:
        return False, str(exc)


def set_window_z_order(hwnd: int, insert_after: int) -> bool:
    if _user32 is None:
        return False
    try:
        return bool(_user32.SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, SWP_FLAGS))
    except Exception:
        return False


def set_window_app_id(hwnd: int, app_id: str | None) -> bool:
    if not UNGROUP_OK:
        return False

    pstore = ctypes.c_void_p()
    try:
        hr = _shell32.SHGetPropertyStoreForWindow(
            hwnd,
            ctypes.byref(_IID_PS),
            ctypes.byref(pstore),
        )
        if hr != 0 or not pstore.value:
            return False

        vtbl = ctypes.cast(
            ctypes.cast(pstore.value, ctypes.POINTER(ctypes.c_void_p))[0],
            ctypes.POINTER(ctypes.c_void_p),
        )
        release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtbl[2])
        set_value = ctypes.WINFUNCTYPE(
            ctypes.HRESULT,
            ctypes.c_void_p,
            ctypes.POINTER(_PROPERTYKEY),
            ctypes.POINTER(_PROPVARIANT),
        )(vtbl[6])
        commit = ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p)(vtbl[7])

        prop = _PROPVARIANT()
        if app_id:
            buffer = ctypes.create_unicode_buffer(app_id)
            prop.vt = VT_LPWSTR
            prop.ptr = ctypes.cast(buffer, ctypes.c_void_p).value
        else:
            prop.vt = VT_EMPTY

        hr = set_value(pstore.value, ctypes.byref(_PKEY_AUMI), ctypes.byref(prop))
        if hr == 0:
            commit(pstore.value)
        release(pstore.value)
        return hr == 0
    except Exception:
        return False

def copy_text_to_clipboard(value: str) -> bool:
    if _user32 is None or _kernel32 is None:
        return False

    text = str(value)
    if not text:
        return False

    data = ctypes.create_unicode_buffer(text)
    size = ctypes.sizeof(data)
    handle = _kernel32.GlobalAlloc(GMEM_MOVEABLE, size)
    if not handle:
        return False

    locked = _kernel32.GlobalLock(handle)
    if not locked:
        _kernel32.GlobalFree(handle)
        return False

    try:
        ctypes.memmove(locked, ctypes.addressof(data), size)
    finally:
        _kernel32.GlobalUnlock(handle)

    if not _user32.OpenClipboard(None):
        _kernel32.GlobalFree(handle)
        return False

    try:
        _user32.EmptyClipboard()
        if not _user32.SetClipboardData(CF_UNICODETEXT, handle):
            _kernel32.GlobalFree(handle)
            return False
        handle = None
        return True
    finally:
        _user32.CloseClipboard()
        if handle:
            _kernel32.GlobalFree(handle)
