import ultrasonic
import heartrateSpo2
import loadcell
import time
import mqtt_client

running = False
mode = 1
current_session_id = None
hr_enabled = False
spo2_enabled = False


def handle_command(sensor, session_id, value, payload):
    global mode, running, current_session_id

    if session_id:
        current_session_id = session_id

    if value == 1:
        mode = 1
        running = True
        if sensor == "heartrate":
            hr_enabled = True
            heartrateSpo2.enable()
        elif sensor == "spo2":
            spo2_enabled = True
            heartrateSpo2.enable()

    elif value == 2:
        print(f"⚙️ Calibrating {sensor}...")
        if sensor == "height":
            ultrasonic.calibrate_height()
            mqtt_client.publish("risecare/calibration/height", {
                "status": "ok",
                "totalHeight": ultrasonic.TOTAL_HEIGHT,
                "sessionId": current_session_id,
                "timestamp": time.time()
            })
        elif sensor == "weight":
            known_weight = payload.get("knownWeightGrams", 1000)
            factor = loadcell.calibrate_loadcell(known_weight_grams=known_weight)
            if factor:
                mqtt_client.publish("risecare/calibration/weight", {
                    "status": "ok",
                    "factor": factor,
                    "knownWeightGrams": known_weight,
                    "sessionId": current_session_id,
                    "timestamp": time.time()
                })
        elif sensor == "heartrate" or sensor == "spo2":
            print("⚠️ Calibration not implemented for heartrate/spo2")
        else:
            print(f"⚠️ Unknown sensor for calibration: {sensor}")
        mode = 1
        running = True

    elif value == 3:
        print(f"🧪 Testing {sensor}...")
        if sensor == "height":
            dist = ultrasonic.measure_distance()
            print(f"Ultrasonic distance: {dist} cm")
            height = ultrasonic.get_height()
            if height:
                print(f"Height: {height} cm")
        elif sensor == "weight":
            weight = loadcell.get_weight()
            if weight:
                print(f"LoadCell weight: {weight} g")
        elif sensor == "heartrate":
            hr, hr_valid, spo2, spo2_valid = heartrateSpo2.get_reading()
            if hr_valid:
                print(f"HeartRate: {hr:.2f} bpm")
            else:
                print("HeartRate: Invalid reading")
        elif sensor == "spo2":
            hr, hr_valid, spo2, spo2_valid = heartrateSpo2.get_reading()
            if spo2_valid:
                print(f"SpO2: {spo2:.2f}%")
            else:
                print("SpO2: Invalid reading")
        else:
            print(f"⚠️ Unknown sensor for test: {sensor}")
        mode = 1
        running = True

    elif value == 0:
        if sensor == "heartrate":
            hr_enabled = False
            heartrateSpo2.disable()
        elif sensor == "spo2":
            spo2_enabled = False
            heartrateSpo2.disable()
        if not hr_enabled and not spo2_enabled:
            running = False
            mode = 0

    else:
        print(f"⚠️ Unknown command: sensor={sensor}, value={value}")


def main():
    global running, mode

    print("Starting RiseCare Health Kiosk...")

    print("\nLoading calibration data...")
    ultrasonic.load_calibration()
    loadcell.load_calibration()

    print("\nInitializing sensors...")
    heartrateSpo2.setup()
    ultrasonic.setup()
    loadcell.setup()

    print("\nConnecting to MQTT...")
    mqtt_client.set_command_callback(handle_command)
    mqtt_client.connect()

    if mqtt_client.wait_for_connection():
        print("✅ MQTT connected, advertising sensors...")
        mqtt_client.publish("risecare/sensors/availability", {
            "heartrate": heartrateSpo2.sensor is not None,
            "spo2": heartrateSpo2.sensor is not None,
            "height": True,
            "weight": loadcell.sensor_available
        })
    else:
        print("⚠️ MQTT not connected — sensors will not be advertised")

    running = True
    mode = 1
    tick = 0

    try:
        while True:
            if mode == 1 and running:
                tick += 1

                hr = hr_valid = spo2 = spo2_valid = None
                if hr_enabled or spo2_enabled:
                    try:
                        hr, hr_valid, spo2, spo2_valid = heartrateSpo2.get_reading()
                    except Exception:
                        pass

                height = None
                try:
                    height = ultrasonic.get_height()
                except Exception:
                    pass

                weight = None
                try:
                    weight = loadcell.get_weight()
                except Exception:
                    pass

                now = time.time()
                published = False

                if hr_enabled and hr_valid:
                    mqtt_client.publish("risecare/sensors/heartrate",
                        {"bpm": hr, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if spo2_enabled and spo2_valid:
                    mqtt_client.publish("risecare/sensors/spo2",
                        {"value": spo2, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if height is not None:
                    mqtt_client.publish("risecare/sensors/height",
                        {"cm": height, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if weight is not None:
                    mqtt_client.publish("risecare/sensors/weight",
                        {"kg": weight / 1000, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if published and tick % 5 == 0:
                    print(f"HR: {f'{hr:.2f}' if hr_valid and hr_enabled else 'N/A'} | "
                          f"SpO2: {f'{spo2:.2f}' if spo2_valid and spo2_enabled else 'N/A'}% | "
                          f"H: {height} cm | W: {weight} g")

                time.sleep(1)
            elif mode == 0:
                time.sleep(1)
            else:
                time.sleep(0.1)

    except KeyboardInterrupt:
        print("\nShutting down...")
        mqtt_client.disconnect()
        ultrasonic.GPIO.cleanup()


if __name__ == "__main__":
    main()
