import subprocess
import threading
import ultrasonic
from max30102 import MAX30102
from mlx90614 import MLX90614
import i2c_bus
import loadcell
import time
import mqtt_client
import printer

READ_INTERVAL = 1.0
HR_POLL_INTERVAL = 0.1
HR_PUBLISH_INTERVAL = 1.0
TEMP_READ_INTERVAL = 1.0
AVAIL_INTERVAL = 10.0

hr_sensor = None
temp_sensor = None
# Long-lived handles kept even when the chip is missing at boot, so a later
# probe can bring the sensor back without a restart. hr_sensor/temp_sensor
# stay the "usable right now" pointers the rest of the code checks.
hr_device = None
temp_device = None
running = False
mode = 1
current_session_id = None
hr_enabled = False
spo2_enabled = False
height_enabled = False
weight_enabled = False
temp_enabled = False
hr_last_read = 0.0
height_last_read = 0.0
weight_last_read = 0.0
temp_last_read = 0.0
measure_busy = False
_last_printer_status = {"connected": False, "paper": False, "paperStatus": "unknown"}
_probe_thread = None
_probe_busy = False


def publish_calibration_progress(sensor, message):
    mqtt_client.publish(f"risecare/calibration/progress/{sensor}", {
        "sensor": sensor,
        "message": message,
        "sessionId": current_session_id,
        "timestamp": time.time()
    })


def _probe_i2c():
    """Re-check the two I2C chips. Cheap (sub-ms), safe to run inline."""
    global hr_sensor, temp_sensor, hr_enabled, spo2_enabled, temp_enabled

    if hr_device is not None:
        was = hr_sensor is not None
        now = hr_device.probe()
        if now and not was:
            hr_sensor = hr_device
            print("✅ Heart rate sensor reconnected")
            if hr_enabled or spo2_enabled:
                try:
                    hr_sensor.reset()
                    hr_sensor.setup()
                    hr_sensor.clear_buffer()
                except Exception as e:
                    print(f"⚠️ MAX30102 re-init failed: {e}")
        elif was and not now:
            hr_sensor = None
            hr_enabled = False
            spo2_enabled = False
            print("⚠️ Heart rate sensor disconnected")

    if temp_device is not None:
        was = temp_sensor is not None
        now = temp_device.probe()
        if now and not was:
            temp_sensor = temp_device
            print("✅ Temperature sensor reconnected")
        elif was and not now:
            temp_sensor = None
            temp_enabled = False
            print("⚠️ Temperature sensor disconnected")


def _probe_slow():
    """Printer USB scan plus the blocking GPIO probes (ultrasonic, HX711)."""
    global _last_printer_status
    _last_printer_status = printer.printer_status()
    if not measure_busy:
        ultrasonic.sensor_available = ultrasonic.probe()
        loadcell.sensor_available = loadcell.probe()


def _availability_snapshot():
    return {
        "max30102": hr_sensor is not None and hr_sensor.handle is not None,
        "height": ultrasonic.sensor_available,
        "weight": loadcell.sensor_available,
        "temperature": temp_sensor is not None and temp_sensor.handle is not None,
        "printer": _last_printer_status
    }


def advertise_sensors():
    """Publish a fast snapshot now, then re-publish once the slow probes land."""
    mqtt_client.publish("risecare/sensors/availability", _availability_snapshot())
    _kick_probe_worker()


def _kick_probe_worker():
    """Run the slow probes on a daemon thread; never overlap two runs."""
    global _probe_thread, _probe_busy
    if _probe_busy:
        return
    _probe_busy = True

    def _run():
        global _probe_busy
        try:
            _probe_slow()
            mqtt_client.publish("risecare/sensors/availability", _availability_snapshot())
        except Exception as e:
            print(f"⚠️ Sensor probe failed: {e}")
        finally:
            _probe_busy = False

    _probe_thread = threading.Thread(target=_run, name="sensor-probe", daemon=True)
    _probe_thread.start()


def read_hr_sensor(timeout=3.0):
    """Poll the MAX30102 until it has enough fresh samples for an estimate."""
    if hr_sensor is None:
        return 0, False, 0, False

    deadline = time.monotonic() + timeout
    latest = (0, False, 0, False)
    while time.monotonic() < deadline:
        latest = hr_sensor.get_reading()
        if latest[1] or latest[3]:
            return latest
        time.sleep(HR_POLL_INTERVAL)
    return latest


def handle_command(sensor, session_id, value, payload):
    global mode, running, current_session_id, hr_enabled, spo2_enabled, height_enabled, weight_enabled, temp_enabled, hr_last_read, height_last_read, weight_last_read, temp_last_read, measure_busy

    if sensor == "shutdown":
        print("Shutdown command received.")
        mqtt_client.disconnect()
        subprocess.run(["sudo", "shutdown", "-h", "now"])
        return

    if sensor == "restart":
        print("Restart command received.")
        mqtt_client.disconnect()
        subprocess.run(["sudo", "shutdown", "-r", "now"])
        return

    if sensor == "lock":
        print("Lock command received.")
        subprocess.run(["loginctl", "lock-session"])
        return

    if sensor == "status":
        print("Status requested — re-probing sensors...")
        _probe_i2c()
        advertise_sensors()
        return

    if session_id:
        current_session_id = session_id

    if value == 1:
        mode = 1
        running = True
        if sensor == "heartrate":
            if hr_sensor is not None:
                hr_enabled = True
                spo2_enabled = True
                hr_sensor.clear_buffer()
                hr_sensor.setup()
            else:
                print("⚠️ Heart rate sensor not available")
        elif sensor == "spo2":
            if hr_sensor is not None:
                spo2_enabled = True
                hr_sensor.clear_buffer()
                hr_sensor.setup()
            else:
                print("⚠️ SpO2 sensor not available")
        elif sensor == "height":
            height_enabled = True
        elif sensor == "weight":
            weight_enabled = True
        elif sensor == "temperature":
            temp_enabled = True
        elif sensor == "printer":
            printer.print_receipt(payload)

    elif value == 2:
        print(f"⚙️ Calibrating {sensor}...")
        measure_busy = True
        try:
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
                tare_ok = loadcell.calibrate_tare()
                if tare_ok is not None:
                    publish_calibration_progress("weight", f"Tare done. Place {known_weight}g weight and click Done.")
                else:
                    mqtt_client.publish("risecare/calibration/weight", {
                        "status": "failed",
                        "sessionId": current_session_id,
                        "timestamp": time.time()
                    })
            elif sensor == "heartrate" or sensor == "spo2":
                print("⚠️ Calibration not implemented for heartrate/spo2")
            else:
                print(f"⚠️ Unknown sensor for calibration: {sensor}")
        finally:
            measure_busy = False
        mode = 1
        running = True

    elif value == 12:
        if sensor == "weight":
            measure_busy = True
            try:
                known_weight = payload.get("knownWeightGrams", 1000)
                factor = loadcell.calibrate_finalize(known_weight_grams=known_weight)
                mqtt_client.publish("risecare/calibration/weight", {
                    "status": "ok" if factor is not None else "failed",
                    "factor": factor,
                    "knownWeightGrams": known_weight,
                    "sessionId": current_session_id,
                    "timestamp": time.time()
                })
            finally:
                measure_busy = False

    elif value == 3:
        print(f"🧪 Testing {sensor}...")
        measure_busy = True
        try:
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
                weight = loadcell.get_stable_weight()
                if weight:
                    print(f"LoadCell weight: {weight} kg")
                    result = {"kg": weight}
                    success = True
            elif sensor == "heartrate":
                if hr_sensor is not None:
                    # The sensor is shut down after startup and when dashboard
                    # readings stop. A test command does not pass through the
                    # normal start-reading (value=1) path, so wake/configure it
                    # before attempting to read the FIFO.
                    hr_sensor.setup()
                    hr_sensor.clear_buffer()
                    hr, hr_valid, spo2, spo2_valid = read_hr_sensor()
                    if hr_valid:
                        print(f"HeartRate: {hr:.2f} bpm")
                        result = {"bpm": hr}
                        success = True
                    else:
                        print("HeartRate: Invalid reading")
                else:
                    print("⚠️ Heart rate sensor not available")
            elif sensor == "spo2":
                if hr_sensor is not None:
                    hr_sensor.setup()
                    hr_sensor.clear_buffer()
                    hr, hr_valid, spo2, spo2_valid = read_hr_sensor()
                    if spo2_valid:
                        print(f"SpO2: {spo2:.2f}%")
                        result = {"value": spo2}
                        success = True
                    else:
                        print("SpO2: Invalid reading")
                else:
                    print("⚠️ SpO2 sensor not available")
            elif sensor == "temperature":
                if temp_sensor is not None:
                    celsius = temp_sensor.get_temperature()
                    if celsius is not None:
                        print(f"Temperature: {celsius:.2f} C")
                        result = {"celsius": celsius}
                        success = True
                    else:
                        print("Temperature: Invalid reading")
                else:
                    print("⚠️ Temperature sensor not available")
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
        finally:
            measure_busy = False
        mode = 1
        running = True

    elif value == 99:
        if sensor == "calibration":
            print("Resetting all calibration...")
            loadcell.reset_calibration()
            ultrasonic.reset_calibration()
            mqtt_client.publish("risecare/calibration/reset", {
                "status": "ok",
                "sessionId": current_session_id,
                "timestamp": time.time()
            })

    elif value == 0:
        if sensor == "heartrate":
            hr_enabled = False
            spo2_enabled = False
            if hr_sensor is not None:
                hr_sensor.shutdown()
                hr_sensor.clear_buffer()
        elif sensor == "spo2":
            spo2_enabled = False
            if hr_sensor is not None:
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
    global running, mode, hr_last_read, height_last_read, weight_last_read, temp_last_read

    print("Starting RiseCare Health Kiosk...")

    print("\nLoading calibration data...")
    try:
        ultrasonic.load_calibration()
    except Exception as e:
        print(f"⚠️ Ultrasonic calibration load failed: {e}")
    try:
        loadcell.load_calibration()
    except Exception as e:
        print(f"⚠️ LoadCell calibration load failed: {e}")

    print("\nInitializing shared I2C bus...")
    i2c_bus.init_bus(1)
    shared_bus = i2c_bus.get_bus()

    print("\nInitializing sensors...")
    global hr_sensor, temp_sensor, hr_device, temp_device

    hr_device = MAX30102(i2c_bus=shared_bus)
    if hr_device.handle is not None:
        hr_sensor = hr_device
        try:
            hr_sensor.shutdown()
        except Exception:
            pass
        print("✅ Heart rate sensor ready")
    else:
        print("⚠️ Heart rate sensor not available — will keep re-probing")

    temp_device = MLX90614(i2c_bus=shared_bus)
    if temp_device.handle is not None:
        temp_sensor = temp_device
        print("✅ Temperature sensor ready")
    else:
        print("⚠️ Temperature sensor not available — will keep re-probing")

    try:
        if ultrasonic.setup():
            print("✅ Ultrasonic sensor ready")
    except Exception as e:
        ultrasonic.sensor_available = False
        print(f"⚠️ Ultrasonic sensor not available: {e}")

    try:
        if loadcell.setup():
            print("✅ LoadCell sensor ready")
    except Exception as e:
        loadcell.sensor_available = False
        print(f"⚠️ LoadCell sensor not available: {e}")

    print("\nConnecting to MQTT...")
    mqtt_client.set_command_callback(handle_command)
    mqtt_client.connect()

    if mqtt_client.wait_for_connection():
        print("✅ MQTT connected, advertising sensors...")
    else:
        print("⚠️ MQTT not connected — sensors will be advertised once the broker comes back")

    # Probe once on the calling thread so the boot snapshot is truthful, and
    # publish directly — advertise_sensors() would kick a second probe pass.
    _probe_i2c()
    _probe_slow()
    mqtt_client.publish("risecare/sensors/availability", _availability_snapshot())

    running = True
    mode = 1
    tick = 0
    # Boot already probed, so hold off the first periodic probe for a full
    # AVAIL_INTERVAL instead of re-probing immediately on the first loop pass.
    last_avail = time.time()
    hr_last_publish = 0.0
    latest_hr_reading = None
    latest_hr_reading_at = 0.0
    last_hr_error = None

    try:
        while True:
            # Runs in every mode, so availability keeps updating even after all
            # sensors are stopped (mode == 0) instead of freezing forever.
            if time.time() - last_avail >= AVAIL_INTERVAL:
                last_avail = time.time()
                _probe_i2c()
                advertise_sensors()

            if mode == 1 and running:
                tick += 1
                now = time.time()

                hr = hr_valid = spo2 = spo2_valid = None
                if (hr_enabled or spo2_enabled) and hr_sensor is not None and now - hr_last_read >= HR_POLL_INTERVAL:
                    try:
                        sample = hr_sensor.get_reading()
                        if sample[1] or sample[3]:
                            latest_hr_reading = sample
                            latest_hr_reading_at = time.time()
                        hr_last_read = time.time()
                        last_hr_error = None
                    except Exception as e:
                        error_message = f"{type(e).__name__}: {e}"
                        if error_message != last_hr_error:
                            print(f"MAX30102 read failed: {error_message}")
                            last_hr_error = error_message

                if latest_hr_reading is not None and time.time() - latest_hr_reading_at <= 2.0:
                    hr, hr_valid, spo2, spo2_valid = latest_hr_reading

                height = None
                if height_enabled and now - height_last_read >= READ_INTERVAL:
                    try:
                        height = ultrasonic.get_height()
                        height_last_read = time.time()
                    except Exception:
                        pass

                weight = None
                if weight_enabled and now - weight_last_read >= READ_INTERVAL:
                    try:
                        weight = loadcell.get_weight()
                        weight_last_read = time.time()
                    except Exception:
                        pass

                temperature = None
                if temp_enabled and temp_sensor is not None and now - temp_last_read >= TEMP_READ_INTERVAL:
                    try:
                        temperature = temp_sensor.get_temperature()
                        temp_last_read = time.time()
                    except Exception:
                        pass

                published = False

                payload = {"sessionId": current_session_id, "timestamp": now}
                if (hr_enabled or spo2_enabled) and now - hr_last_publish >= HR_PUBLISH_INTERVAL:
                    if hr_valid:
                        payload["bpm"] = hr
                    if spo2_valid:
                        payload["spo2"] = spo2
                    if hr_valid or spo2_valid:
                        mqtt_client.publish("risecare/sensors/vitals", payload)
                        published = True
                        hr_last_publish = now

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

                time.sleep(0.1)
            elif mode == 0:
                time.sleep(1)
            else:
                time.sleep(0.1)

    except KeyboardInterrupt:
        print("\nShutting down...")
        mqtt_client.disconnect()
        i2c_bus.close_bus()
        try:
            if ultrasonic.gpio_available:
                ultrasonic.GPIO.cleanup()
        except Exception:
            pass


if __name__ == "__main__":
    main()
