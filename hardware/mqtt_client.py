import json
import os

try:
    import paho.mqtt.client as mqtt
    mqtt_available = True
except ImportError:
    print("Warning: paho-mqtt not installed. Install with: pip install paho-mqtt")
    mqtt_available = False

# MQTT settings
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_COMMAND_TOPIC = "risecare/command/+"
MQTT_SENSOR_TOPIC = "risecare/sensors"

client = None
command_callback = None


def on_connect(mqtt_client, userdata, flags, rc):
    if rc == 0:
        print("✅ MQTT connected")
        mqtt_client.subscribe(MQTT_COMMAND_TOPIC)
        print(f"📡 Subscribed to: {MQTT_COMMAND_TOPIC}")
    else:
        print(f"❌ MQTT connection failed with code {rc}")


def on_message(mqtt_client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        topic = msg.topic
        sensor = topic.split("/")[-1]
        session_id = payload.get("sessionId")
        value = payload.get("value")
        
        print(f"📥 MQTT command received: sensor={sensor}, sessionId={session_id}, value={value}")
        
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
        print("MQTT disconnected")


def publish(topic, payload):
    if client and client.is_connected():
        message = json.dumps(payload)
        client.publish(topic, message, qos=1)
        print(f"📤 MQTT published [{topic}]: {payload}")
        return True
    return False


def publish_sensor_data(hr, spo2, height, weight, session_id=None):
    """Publish sensor data to individual topics matching Node.js expectations"""
    import time
    timestamp = time.time()
    
    # Heart rate
    if hr is not None:
        payload = {"bpm": hr, "sessionId": session_id, "timestamp": timestamp}
        publish(f"{MQTT_SENSOR_TOPIC}/heartrate", payload)
    
    # SpO2
    if spo2 is not None:
        payload = {"value": spo2, "sessionId": session_id, "timestamp": timestamp}
        publish(f"{MQTT_SENSOR_TOPIC}/spo2", payload)
    
    # Height
    if height is not None:
        payload = {"cm": height, "sessionId": session_id, "timestamp": timestamp}
        publish(f"{MQTT_SENSOR_TOPIC}/height", payload)
    
    # Weight - convert grams to kg
    if weight is not None:
        payload = {"kg": weight / 1000, "sessionId": session_id, "timestamp": timestamp}
        publish(f"{MQTT_SENSOR_TOPIC}/weight", payload)


def set_command_callback(callback):
    global command_callback
    command_callback = callback


def is_connected():
    return client and client.is_connected()
