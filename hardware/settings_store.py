"""Persistent, merged settings stored beside the hardware drivers."""
import json
import os
import tempfile
import threading

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")
SENSOR_IDS = {"bp", "heartrate", "spo2", "height", "weight", "temperature", "printer"}
BP_RATIO_DEFAULTS = {"systolic": 0.45, "diastolic": 0.85}
# Fixed offset added to the MLX90614 object temperature to estimate body
# temperature. Adjustable from the kiosk sensor settings.
TEMPERATURE_OFFSET_DEFAULT = 3.4
TEMPERATURE_OFFSET_MIN = -20.0
TEMPERATURE_OFFSET_MAX = 20.0
_lock = threading.RLock()


def load_settings():
    """Read the shared settings document, returning an empty object if absent."""
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as settings_file:
            settings = json.load(settings_file)
    except FileNotFoundError:
        return {}
    if not isinstance(settings, dict):
        raise ValueError("Settings file must contain a JSON object")
    return settings


def save_settings(settings):
    """Atomically replace the shared settings document."""
    if not isinstance(settings, dict):
        raise ValueError("Settings must be a JSON object")

    directory = os.path.dirname(SETTINGS_FILE)
    fd, temporary_path = tempfile.mkstemp(prefix="settings-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as settings_file:
            json.dump(settings, settings_file, indent=2)
            settings_file.write("\n")
        os.replace(temporary_path, SETTINGS_FILE)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def update_section(section, value):
    """Merge one driver's settings section without replacing other settings."""
    with _lock:
        settings = load_settings()
        settings[section] = value
        save_settings(settings)


def remove_section(section):
    """Remove one driver's settings section without replacing other settings."""
    with _lock:
        settings = load_settings()
        if section not in settings:
            return False
        del settings[section]
        save_settings(settings)
        return True


def save_enabled_sensors(enabled_sensors):
    if not isinstance(enabled_sensors, dict) or any(
        key not in SENSOR_IDS or not isinstance(value, bool)
        for key, value in enabled_sensors.items()
    ):
        raise ValueError("Invalid enabled sensor settings")

    with _lock:
        settings = load_settings()
        existing = settings.get("enabled_sensors", {})
        if not isinstance(existing, dict):
            existing = {}
        settings["enabled_sensors"] = {**existing, **enabled_sensors}
        save_settings(settings)


def normalize_bp_ratios(value):
    """Validate the experimental oscillometric SYS/DIA envelope ratios."""
    if not isinstance(value, dict):
        return dict(BP_RATIO_DEFAULTS)
    systolic = value.get("systolic")
    diastolic = value.get("diastolic")
    if (isinstance(systolic, bool) or not isinstance(systolic, (int, float))
            or isinstance(diastolic, bool) or not isinstance(diastolic, (int, float))):
        return dict(BP_RATIO_DEFAULTS)
    systolic = float(systolic)
    diastolic = float(diastolic)
    if not (0.2 <= systolic <= 0.7 and 0.6 <= diastolic <= 1.0
            and systolic < diastolic):
        return dict(BP_RATIO_DEFAULTS)
    return {"systolic": systolic, "diastolic": diastolic}


def load_bp_ratios():
    try:
        return normalize_bp_ratios(load_settings().get("bp_ratios"))
    except (OSError, ValueError, TypeError):
        return dict(BP_RATIO_DEFAULTS)


def save_bp_ratios(value):
    ratios = normalize_bp_ratios(value)
    if ratios != value and not (
        isinstance(value, dict)
        and value.get("systolic") == ratios["systolic"]
        and value.get("diastolic") == ratios["diastolic"]
    ):
        raise ValueError("Invalid SYS/DIA ratios")
    update_section("bp_ratios", ratios)
    return ratios


def normalize_temperature_offset(value):
    """Validate the fixed offset added to the MLX90614 temperature reading."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return TEMPERATURE_OFFSET_DEFAULT
    offset = float(value)
    if not (TEMPERATURE_OFFSET_MIN <= offset <= TEMPERATURE_OFFSET_MAX):
        return TEMPERATURE_OFFSET_DEFAULT
    return round(offset, 2)


def load_temperature_offset():
    try:
        return normalize_temperature_offset(
            load_settings().get("temperature_offset", TEMPERATURE_OFFSET_DEFAULT)
        )
    except (OSError, ValueError, TypeError):
        return TEMPERATURE_OFFSET_DEFAULT


def save_temperature_offset(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid temperature offset")
    offset = float(value)
    if not (TEMPERATURE_OFFSET_MIN <= offset <= TEMPERATURE_OFFSET_MAX):
        raise ValueError("Invalid temperature offset")
    offset = round(offset, 2)
    update_section("temperature_offset", offset)
    return offset


# Fine offset (cm) added to every measured height; set from the kiosk advanced
# calibration. Stored top-level (not in the vl53l1x section) so a height
# calibration cannot wipe it.
HEIGHT_OFFSET_DEFAULT = 0.0
HEIGHT_OFFSET_MIN = -50.0
HEIGHT_OFFSET_MAX = 50.0


def normalize_height_offset(value):
    """Validate the fixed offset added to the VL53L1X height reading."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return HEIGHT_OFFSET_DEFAULT
    offset = float(value)
    if not (HEIGHT_OFFSET_MIN <= offset <= HEIGHT_OFFSET_MAX):
        return HEIGHT_OFFSET_DEFAULT
    return round(offset, 2)


def load_height_offset():
    try:
        return normalize_height_offset(
            load_settings().get("height_offset", HEIGHT_OFFSET_DEFAULT)
        )
    except (OSError, ValueError, TypeError):
        return HEIGHT_OFFSET_DEFAULT


def save_height_offset(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid height offset")
    offset = float(value)
    if not (HEIGHT_OFFSET_MIN <= offset <= HEIGHT_OFFSET_MAX):
        raise ValueError("Invalid height offset")
    offset = round(offset, 2)
    update_section("height_offset", offset)
    return offset
