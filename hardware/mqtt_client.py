import json
import os
from pathlib import Path
from urllib.parse import urlparse

try:
    import paho.mqtt.client as mqtt
    mqtt_available = True
except ImportError:
    print("Warning: paho-mqtt not installed. Install with: pip install paho-mqtt")
    mqtt_available = False


def _read_project_env():
    """Read MQTT settings even when sudo strips the caller's environment."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    values = {}
    try:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            values[key.strip()] = value
    except OSError:
        pass
    return values


_project_env = _read_project_env()
_broker_setting = (
    os.getenv("MQTT_BROKER") or _project_env.get("MQTT_BROKER") or "127.0.0.1"
)
_port_setting = os.getenv("MQTT_PORT") or _project_env.get("MQTT_PORT") or "1883"
_broker_url = urlparse(
    _broker_setting if "://" in _broker_setting else f"mqtt://{_broker_setting}"
)
MQTT_BROKER = _broker_url.hostname or "127.0.0.1"
MQTT_PORT = _broker_url.port or int(_port_setting)
MQTT_USERNAME = (
    os.getenv("MQTT_USERNAME") or _project_env.get("MQTT_USERNAME") or _broker_url.username
)
MQTT_PASSWORD = (
    os.getenv("MQTT_PASSWORD") or _project_env.get("MQTT_PASSWORD") or _broker_url.password
)
MQTT_COMMAND_TOPIC = "risecare/command/+"

client = None
command_callback = None
_warned_not_connected = False


def on_connect(mqtt_client, userdata, flags, rc):
    global _warned_not_connected
    if rc == 0:
        _warned_not_connected = False
        print("✅ MQTT connected")
        mqtt_client.subscribe(MQTT_COMMAND_TOPIC)
    else:
        print(f"❌ MQTT connection failed with code {rc}")


def on_disconnect(mqtt_client, userdata, rc):
    if rc != 0:
        print("⚠️ MQTT disconnected, reconnecting...")


def on_message(mqtt_client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        topic = msg.topic
        print(f"📥 MQTT received [{topic}]: {payload}")
        sensor = topic.split("/")[-1]
        session_id = payload.get("sessionId")
        value = payload.get("value")

        if command_callback:
            command_callback(sensor, session_id, value, payload)
    except Exception as e:
        print(f"❌ Error processing message: {e}")


def connect():
    global client
    if not mqtt_available:
        return None

    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    try:
        print(f"Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}...")
        # Keep retrying if Mosquitto is starting or temporarily unavailable.
        client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
        client.loop_start()
        return client
    except Exception as e:
        print(f"❌ MQTT connection error: {e}")
        return None


def disconnect():
    global client
    if client:
        client.loop_stop()
        client.disconnect()


def publish(topic, payload, quiet=False):
    global _warned_not_connected
    if client and client.is_connected():
        _warned_not_connected = False
        message = json.dumps(payload)
        if not quiet:
            print(f"📤 MQTT published [{topic}]: {payload}")
        client.publish(topic, message)
        return True
    if not _warned_not_connected:
        print(f"⚠️ MQTT not connected, cannot publish [{topic}]")
        _warned_not_connected = True
    return False


def set_command_callback(callback):
    global command_callback
    command_callback = callback


def is_connected():
    return client and client.is_connected()


def wait_for_connection(timeout=10):
    import time
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_connected():
            return True
        time.sleep(0.2)
    return False
