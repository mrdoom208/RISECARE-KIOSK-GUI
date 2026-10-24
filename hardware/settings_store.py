"""Persistent, merged settings stored beside the hardware drivers."""
import json
import os
import tempfile

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")
SENSOR_IDS = {"bp", "heartrate", "spo2", "height", "weight", "temperature", "printer"}


def save_enabled_sensors(enabled_sensors):
    if not isinstance(enabled_sensors, dict) or any(
        key not in SENSOR_IDS or not isinstance(value, bool)
        for key, value in enabled_sensors.items()
    ):
        raise ValueError("Invalid enabled sensor settings")

    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as settings_file:
            settings = json.load(settings_file)
    except FileNotFoundError:
        settings = {}

    existing = settings.get("enabled_sensors", {})
    if not isinstance(existing, dict):
        existing = {}
    settings["enabled_sensors"] = {**existing, **enabled_sensors}

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
