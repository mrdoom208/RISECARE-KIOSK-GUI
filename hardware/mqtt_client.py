import json
import os

try:
    import paho.mqtt.client as mqtt
    mqtt_available = True
except ImportError:
    print("Warning: paho-mqtt not installed. Install with: pip install paho-mqtt")
    mqtt_available = False

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_COMMAND_TOPIC = "risecare/command/+"

client = None
command_callback = None


def on_connect(mqtt_client, userdata, flags, rc):
    if rc == 0:
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

    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
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


def publish(topic, payload):
    if client and client.is_connected():
        message = json.dumps(payload)
        client.publish(topic, message)
        return True
    return False


def set_command_callback(callback):
    global command_callback
    command_callback = callback


def is_connected():
    return client and client.is_connected()
