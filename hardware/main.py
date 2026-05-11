import ultrasonic
from max30102 import MAX30102
from mlx90614 import MLX90614
import i2c_bus
import loadcell
import time
import mqtt_client
import printer

hr_sensor = None
temp_sensor = None
running = False
mode = 1
current_session_id = None
hr_enabled = False
spo2_enabled = False
height_enabled = False
weight_enabled = False
temp_enabled = False
temp_last_read = 0
TEMP_READ_INTERVAL = 1.0
weight_calibrating = False


def publish_calibration_progress(sensor, message):
    mqtt_client.publish(f"risecare/calibration/progress/{sensor}", {
        "sensor": sensor,
        "message": message,
        "sessionId": current_session_id,
        "timestamp": time.time()
    })


def handle_command(sensor, session_id, value, payload):
    global mode, running, current_session_id, hr_enabled, spo2_enabled, height_enabled, weight_enabled, temp_enabled, weight_calibrating

    if session_id:
        current_session_id = session_id

    if value == 1:
        mode = 1
        running = True
        if sensor == "heartrate":
            hr_enabled = True
            spo2_enabled = True
            hr_sensor.clear_buffer()
            hr_sensor.setup()
        elif sensor == "spo2":
            spo2_enabled = True
            hr_sensor.clear_buffer()
            hr_sensor.setup()
        elif sensor == "height":
            height_enabled = True
        elif sensor == "weight":
            weight_enabled = True
        elif sensor == "temperature":
            temp_enabled = True
        elif sensor == "printer":
            vitals = payload.get("vitals", {})
            patient_name = payload.get("patientName", "Patient")
            recommendation = payload.get("recommendation", "")
            printer.print_receipt({
                "patientName": patient_name,
                "vitals": vitals,
                "recommendation": recommendation
            })

    elif value == 2:
        print(f"⚙️ Calibrating {sensor}...")
        if sensor == "height":
            total_height = ultrasonic.calibrate_height(
                progress_callback=lambda message: publish_calibration_progress("height", message)
            )
            mqtt_client.publish("risecare/calibration/height", {
                "status": "ok" if total_height is not None else "failed",
                "totalHeight": total_height,
                "sessionId": current_session_id,
                "timestamp": time.time()
            })
        elif sensor == "weight":
            known_weight = payload.get("knownWeightGrams", 1000)
            publish_calibration_progress("weight", "Step 1: Clear the scale. Taring...")
            success = loadcell.calibrate_tare(
                progress_callback=lambda message: publish_calibration_progress("weight", message)
            )
            if success:
                publish_calibration_progress("weight", "Step 2: Place your 1 kg weight on the scale now.")
                weight_calibrating = True
            else:
                mqtt_client.publish("risecare/calibration/weight", {
                    "status": "failed",
                    "sessionId": current_session_id,
                    "timestamp": time.time()
                })
                mode = 1
                running = True
        elif sensor == "heartrate" or sensor == "spo2":
            print("⚠️ Calibration not implemented for heartrate/spo2")
        else:
            print(f"⚠️ Unknown sensor for calibration: {sensor}")
        mode = 1
        running = True

    elif value == 12:
        if sensor == "weight":
            if not weight_calibrating:
                print("⚠️ No weight calibration in progress")
                return
            weight_calibrating = False
            known_weight = payload.get("knownWeightGrams", 1000)
            publish_calibration_progress("weight", "Finalizing calibration...")
            factor = loadcell.calibrate_finalize(
                known_weight_grams=known_weight,
                progress_callback=lambda message: publish_calibration_progress("weight", message)
            )
            mqtt_client.publish("risecare/calibration/weight", {
                "status": "ok" if factor is not None else "failed",
                "factor": factor,
                "knownWeightGrams": known_weight,
                "sessionId": current_session_id,
                "timestamp": time.time()
            })
        else:
            print(f"⚠️ Unknown sensor for calibrate finalize: {sensor}")

    elif value == 3:
        print(f"🧪 Testing {sensor}...")
        success = False
        result = {}
        if sensor == "height":
            dist = ultrasonic.measure_distance()
            print(f"Ultrasonic distance: {dist} cm")
            height = ultrasonic.get_height()
            if height:
                print(f"Height: {height} cm")
                result = {"cm": height}
                success = True
        elif sensor == "weight":
            weight = loadcell.get_weight()
            if weight:
                print(f"LoadCell weight: {weight} kg")
                result = {"kg": weight}
                success = True
        elif sensor == "heartrate":
            hr, hr_valid, spo2, spo2_valid = hr_sensor.get_reading()
            if hr_valid:
                print(f"HeartRate: {hr:.2f} bpm")
                result = {"bpm": hr}
                success = True
            else:
                print("HeartRate: Invalid reading")
        elif sensor == "spo2":
            hr, hr_valid, spo2, spo2_valid = hr_sensor.get_reading()
            if spo2_valid:
                print(f"SpO2: {spo2:.2f}%")
                result = {"value": spo2}
                success = True
            else:
                print("SpO2: Invalid reading")
        elif sensor == "temperature":
            celsius = temp_sensor.get_temperature()
            if celsius is not None:
                print(f"Temperature: {celsius:.2f} C")
                result = {"celsius": celsius}
                success = True
            else:
                print("Temperature: Invalid reading")
        elif sensor == "printer":
            success = printer.test_print()
            result = {"status": "success" if success else "failed"}
        else:
            print(f"⚠️ Unknown sensor for test: {sensor}")
        payload = {
            "sensor": sensor,
            "sessionId": current_session_id,
            "timestamp": time.time(),
            "status": "success" if success else "failed",
            **result
        }
        mqtt_client.publish(f"risecare/test/{sensor}", payload)
        print(f"   Test {'successful' if success else 'failed'}: {payload}")
        mode = 1
        running = True

    elif value == 0:
        if sensor == "heartrate":
            hr_enabled = False
            spo2_enabled = False
            hr_sensor.shutdown()
            hr_sensor.clear_buffer()
        elif sensor == "spo2":
            spo2_enabled = False
            hr_sensor.shutdown()
            hr_sensor.clear_buffer()
        elif sensor == "height":
            height_enabled = False
        elif sensor == "weight":
            weight_enabled = False
        elif sensor == "temperature":
            temp_enabled = False
        if not hr_enabled and not spo2_enabled and not height_enabled and not weight_enabled and not temp_enabled:
            running = False
            mode = 0

    else:
        print(f"⚠️ Unknown command: sensor={sensor}, value={value}")


def main():
    global running, mode, temp_last_read

    print("Starting RiseCare Health Kiosk...")

    print("\nLoading calibration data...")
    ultrasonic.load_calibration()
    loadcell.load_calibration()

    print("\nInitializing shared I2C bus...")
    i2c_bus.init_bus(1)
    shared_bus = i2c_bus.get_bus()

    print("\nInitializing sensors...")
    global hr_sensor, temp_sensor
    hr_sensor = MAX30102(i2c_bus=shared_bus)
    hr_sensor.shutdown()
    temp_sensor = MLX90614(i2c_bus=shared_bus)
    ultrasonic.setup()
    loadcell.setup()

    print("\nConnecting to MQTT...")
    mqtt_client.set_command_callback(handle_command)
    mqtt_client.connect()

    if mqtt_client.wait_for_connection():
        print("✅ MQTT connected, advertising sensors...")
        mqtt_client.publish("risecare/sensors/availability", {
            "heartrate": hr_sensor is not None and hr_sensor.handle is not None,
            "spo2": hr_sensor is not None and hr_sensor.handle is not None,
            "height": True,
            "weight": loadcell.sensor_available,
            "temperature": temp_sensor is not None and temp_sensor.handle is not None
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
                        hr, hr_valid, spo2, spo2_valid = hr_sensor.get_reading()
                    except Exception:
                        pass

                height = None
                if height_enabled:
                    try:
                        height = ultrasonic.get_height()
                    except Exception:
                        pass

                weight = None
                if weight_enabled:
                    try:
                        weight = loadcell.get_weight()
                    except Exception:
                        pass
                elif weight_calibrating:
                    try:
                        cal_weight = loadcell.get_weight()
                        if cal_weight is not None:
                            publish_calibration_progress("weight", f"Reading: {cal_weight:.2f} kg")
                            mqtt_client.publish("risecare/sensors/weight",
                                {"kg": cal_weight, "sessionId": current_session_id, "timestamp": now, "_calibrating": True})
                    except Exception:
                        pass

                temperature = None
                if temp_enabled and time.time() - temp_last_read >= TEMP_READ_INTERVAL:
                    try:
                        temperature = temp_sensor.get_temperature()
                        temp_last_read = time.time()
                    except Exception:
                        pass

                now = time.time()
                published = False

                payload = {"sessionId": current_session_id, "timestamp": now}
                if hr_enabled or spo2_enabled:
                    if hr_valid:
                        payload["bpm"] = hr
                    if spo2_valid:
                        payload["spo2"] = spo2
                    if hr_valid or spo2_valid:
                        mqtt_client.publish("risecare/sensors/vitals", payload)
                        published = True

                if height_enabled and height is not None:
                    mqtt_client.publish("risecare/sensors/height",
                        {"cm": height, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if weight_enabled and weight is not None:
                    mqtt_client.publish("risecare/sensors/weight",
                        {"kg": weight, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if temp_enabled and temperature is not None:
                    mqtt_client.publish("risecare/sensors/temperature",
                        {"celsius": temperature, "sessionId": current_session_id, "timestamp": now})
                    published = True

                if published and tick % 5 == 0:
                    if hr_enabled or spo2_enabled:
                        print(f"HR: {f'{hr:.2f}' if hr_valid else 'N/A'} bpm | SpO2: {f'{spo2:.2f}' if spo2_valid else 'N/A'}%")
                    if height_enabled and height is not None:
                        print(f"Height: {height} cm")
                    if weight_enabled and weight is not None:
                        print(f"Weight: {weight} g")
                    if temp_enabled and temperature is not None:
                        print(f"Temperature: {temperature} C")

                if weight_calibrating:
                    time.sleep(0.3)
                if not hr_enabled and not spo2_enabled and not height_enabled and not weight_enabled and not temp_enabled:
                    time.sleep(1)
            elif mode == 0:
                time.sleep(1)
            else:
                time.sleep(0.1)

    except KeyboardInterrupt:
        print("\nShutting down...")
        mqtt_client.disconnect()
        i2c_bus.close_bus()
        ultrasonic.GPIO.cleanup()


if __name__ == "__main__":
    main()
