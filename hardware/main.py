import subprocess
import threading
import vl53l1x
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
# The VL53L1X is sampled in the background: the ranging transaction blocks
# for a few hundred milliseconds and must not stall the main loop.
HEIGHT_POLL_INTERVAL = 0.5
# A height that is older than this is dropped, so a sensor that stopped
# answering cannot keep publishing a stale measurement.
HEIGHT_STALE_AFTER = 3.0

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
_height_thread = None
_height_stop = threading.Event()
_height_lock = threading.Lock()
_height_value = None
_height_at = 0.0


def publish_calibration_progress(sensor, message):
    mqtt_client.publish(f"risecare/calibration/progress/{sensor}", {
        "sensor": sensor,
        "message": message,
        "sessionId": current_session_id,
        "timestamp": time.time()
    })


def _start_height_worker():
    """Sample the VL53L1X in the background.

    The ToF ranging blocks while it waits for the measurement, so it runs on
    its own thread: the main loop keeps publishing the other sensors on time.
    """
    global _height_thread
    if _height_thread is not None and _height_thread.is_alive():
        return
    _height_stop.clear()

    def _run():
        global _height_value, _height_at
        last_error = None
        while not _height_stop.is_set():
            if measure_busy:
                # A calibration or test command owns the sensor right now.
                _height_stop.wait(0.1)
                continue
            try:
                value = vl53l1x.get_height()
                last_error = None
            except Exception as e:
                error_message = f"{type(e).__name__}: {e}"
                if error_message != last_error:
                    print(f"⚠️ VL53L1X read failed: {error_message}")
                    last_error = error_message
                value = None
            with _height_lock:
                _height_value = value
                _height_at = time.time()
            _height_stop.wait(HEIGHT_POLL_INTERVAL)

    _height_thread = threading.Thread(target=_run, name="height-sampler", daemon=True)
    _height_thread.start()


def _stop_height_worker():
    """Stop the background sampler and forget the last height."""
    global _height_thread, _height_value, _height_at
    _height_stop.set()
    thread = _height_thread
    _height_thread = None
    if thread is not None and thread.is_alive():
        thread.join(timeout=2.0)
    with _height_lock:
        _height_value = None
        _height_at = 0.0


def _latest_height():
    """Return the newest height of the sampler, or None when it is stale."""
    with _height_lock:
        if _height_value is None:
            return None
        if time.time() - _height_at > HEIGHT_STALE_AFTER:
            return None
        return _height_value


def _probe_i2c():
    """Re-check the two I2C chips. Cheap (sub-ms), safe to run inline."""
    global hr_device, hr_sensor, temp_sensor, hr_enabled, spo2_enabled, temp_enabled

    if hr_device is None:
        try:
            hr_device = MAX30102(i2c_bus=i2c_bus.get_bus())
        except Exception as e:
            print(f"⚠️ MAX30102 reconnect failed: {e}")
        else:
            hr_sensor = hr_device
            print("✅ Heart rate sensor reconnected")

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
    """Printer USB scan plus the blocking I2C probes (VL53L1X, HX711)."""
    global _last_printer_status
    _last_printer_status = printer.printer_status()
    if not measure_busy:
        vl53l1x.sensor_available = vl53l1x.probe()
        loadcell.sensor_available = loadcell.probe()


def _availability_snapshot():
    return {
        "max30102": hr_sensor is not None and hr_sensor.handle is not None,
        "height": vl53l1x.sensor_available,
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


def read_hr_sensor(timeout=8.0, require_spo2=False):
    """Poll the MAX30102 until the requested measurement is valid or time expires."""
    if hr_sensor is None:
        return 0, False, 0, False

    deadline = time.monotonic() + timeout
    next_diagnostic_at = time.monotonic() + 1.0
    latest = (0, False, 0, False)
    latest_valid = None
    while time.monotonic() < deadline:
        result = hr_sensor.get_reading()
        reading = (
            result["pulse_rate"],
            result["pulse_rate_valid"],
            result["spo2"],
            result["spo2_valid"],
        )
        now = time.monotonic()
        if now >= next_diagnostic_at:
            print(
                "MAX30102 test signal: "
                f"samples={result['samples']}, "
                f"new={result.get('new_samples', 0)}, "
                f"quality={result['quality']:.2f}, "
                f"FIFO available={result.get('fifo_available', 0)}, "
                f"overflow={result.get('fifo_overflow', 0)}, "
                f"valid HR={reading[1]}, valid SpO2={reading[3]}",
                flush=True,
            )
            next_diagnostic_at = now + 1.0

        if reading[1] or reading[3]:
            latest_valid = reading
            requested_measurement_valid = reading[3] if require_spo2 else reading[1]
            if requested_measurement_valid:
                return reading
        elif latest_valid is None:
            latest = reading
        time.sleep(HR_POLL_INTERVAL)
    return latest_valid if latest_valid is not None else latest


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
        if sensor == "bp":
            if measure_busy:
                mqtt_client.publish("risecare/sensors/bp", {
                    "status": "failed", "error": "Another sensor operation is in progress",
                    "sessionId": current_session_id, "timestamp": time.time()
                })
                return

            def _measure_bp(bp_session_id):
                global measure_busy
                measure_busy = True
                result = None
                error = None
                try:
                    from bptest import BloodPressureTest
                    result = BloodPressureTest().run(
                        progress_callback=lambda stage, percent, pressure: mqtt_client.publish(
                            "risecare/sensors/bp", {
                                "status": "running", "stage": stage,
                                "progress": percent, "pressure": round(pressure, 1),
                                "sessionId": bp_session_id, "timestamp": time.time()
                            }
                        )
                    )
                    if result is None:
                        error = "No valid pressure result was produced"
                except Exception as exc:
                    error = f"{type(exc).__name__}: {exc}"
                    print(f"BP measurement failed: {error}")
                finally:
                    measure_busy = False
                message = {
                    "status": "success" if result else "failed",
                    "sessionId": bp_session_id,
                    "timestamp": time.time(),
                }
                if result:
                    message.update(result)
                else:
                    message["error"] = error or "Measurement failed"
                mqtt_client.publish("risecare/sensors/bp", message)

            threading.Thread(target=_measure_bp, args=(current_session_id,),
                             name="bp-measurement", daemon=True).start()
        elif sensor == "heartrate":
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
            _start_height_worker()
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
                # The calibration owns the sensor: the background sampler
                # would steal the ranging transactions.
                _stop_height_worker()
                try:
                    total_height = vl53l1x.calibrate_height(
                        progress_callback=lambda message: publish_calibration_progress("height", message)
                    )
                except Exception as e:
                    print(f"⚠️ Height calibration failed: {e}")
                    total_height = None
                finally:
                    if height_enabled:
                        _start_height_worker()
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
        elif sensor == "height":
            # The kiosk confirms the height calibration with its "Done" button:
            # the calibration itself already ran, so the stored value is sent
            # back to close the flow.
            total_height = vl53l1x.TOTAL_HEIGHT
            mqtt_client.publish("risecare/calibration/height", {
                "status": "ok" if total_height is not None else "failed",
                "totalHeight": total_height,
                "sessionId": current_session_id,
                "timestamp": time.time()
            })

    elif value == 3:
        print(f"🧪 Testing {sensor}...")
        measure_busy = True
        try:
            success = False
            result = {}
            if sensor == "height":
                # The test owns the sensor: pause the background sampler so
                # the ranging transactions are not shared.
                _stop_height_worker()
                try:
                    dist = vl53l1x.measure_distance()
                    print(f"VL53L1X distance: {dist} cm")
                    height = vl53l1x.get_height()
                except Exception as e:
                    print(f"⚠️ VL53L1X test failed: {e}")
                    dist = None
                    height = None
                finally:
                    if height_enabled:
                        _start_height_worker()
                if height is not None:
                    print(f"Height: {height} cm")
                    result = {"cm": height, "distanceCm": dist}
                    success = True
                elif dist is not None:
                    # The sensor answers, but nobody is standing under it, so
                    # there is no height to report.
                    print("Height: unavailable (no one under the sensor)")
                    result = {"distanceCm": dist}
                    success = True
                else:
                    print("Height: no reading")
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
                    hr, hr_valid, spo2, spo2_valid = read_hr_sensor(timeout=8.0)
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
                    hr, hr_valid, spo2, spo2_valid = read_hr_sensor(
                        timeout=8.0,
                        require_spo2=True,
                    )
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
            vl53l1x.reset_calibration()
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
            _stop_height_worker()
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
        vl53l1x.load_calibration()
    except Exception as e:
        print(f"⚠️ VL53L1X calibration load failed: {e}")
    try:
        loadcell.load_calibration()
    except Exception as e:
        print(f"⚠️ LoadCell calibration load failed: {e}")

    print("\nInitializing shared I2C bus...")
    i2c_bus.init_bus(1)
    shared_bus = i2c_bus.get_bus()

    print("\nInitializing sensors...")
    global hr_sensor, temp_sensor, hr_device, temp_device

    try:
        hr_device = MAX30102(i2c_bus=shared_bus)
        hr_sensor = hr_device
        try:
            hr_sensor.shutdown()
        except Exception:
            pass
        print("✅ Heart rate sensor ready")
    except Exception as e:
        hr_device = None
        hr_sensor = None
        print(f"⚠️ Heart rate sensor not available — will keep re-probing: {e}")

    temp_device = MLX90614(i2c_bus=shared_bus)
    if temp_device.handle is not None:
        temp_sensor = temp_device
        print("✅ Temperature sensor ready")
    else:
        print("⚠️ Temperature sensor not available — will keep re-probing")

    try:
        if vl53l1x.setup():
            print("✅ VL53L1X sensor ready")
    except Exception as e:
        vl53l1x.sensor_available = False
        print(f"⚠️ VL53L1X sensor not available: {e}")

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
    # Finger state of the MAX30102, published so the kiosk can ask the
    # patient to insert a finger instead of waiting on a silent sensor.
    finger_detected = False
    hr_quality = 0.0

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

                hr = None
                hr_valid = False
                spo2 = None
                spo2_valid = False
                if (hr_enabled or spo2_enabled) and hr_sensor is not None and now - hr_last_read >= HR_POLL_INTERVAL:
                    try:
                        result = hr_sensor.get_reading()
                        finger_detected = bool(
                            result.get("finger_present", result.get("hand_present", False))
                        )
                        hr_quality = float(result.get("quality", 0.0))
                        sample = (
                            result["pulse_rate"],
                            result["pulse_rate_valid"],
                            result["spo2"],
                            result["spo2_valid"],
                        )
                        if sample[1] or sample[3]:
                            latest_hr_reading = sample
                            latest_hr_reading_at = time.time()
                        elif not finger_detected:
                            # The finger left the sensor: drop the last
                            # measurement so the kiosk stops showing a number
                            # the chip can no longer confirm.
                            latest_hr_reading = None
                            latest_hr_reading_at = 0.0
                        hr_last_read = time.time()
                        last_hr_error = None
                    except Exception as e:
                        error_message = f"{type(e).__name__}: {e}"
                        if error_message != last_hr_error:
                            print(f"MAX30102 read failed: {error_message}")
                            last_hr_error = error_message

                if latest_hr_reading is not None and time.time() - latest_hr_reading_at <= 2.0:
                    hr, hr_valid, spo2, spo2_valid = latest_hr_reading

                # The height comes from the background sampler, so the ToF
                # ranging never blocks the loop. Only a fresh, valid height
                # is published: a stale or missing one would be stored as a
                # measurement by the API server.
                height = None
                if height_enabled and now - height_last_read >= READ_INTERVAL:
                    height_last_read = now
                    height = _latest_height()

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
                    if hr_valid and hr is not None:
                        payload["bpm"] = hr
                    if spo2_valid and spo2 is not None:
                        payload["spo2"] = spo2
                    # The validity flags and the finger state are published on
                    # every tick, even without a measurement, so the kiosk can
                    # distinguish "no finger yet" from "reading not settled".
                    payload["hrValid"] = bool(hr_valid and hr is not None)
                    payload["spo2Valid"] = bool(spo2_valid and spo2 is not None)
                    payload["fingerDetected"] = bool(finger_detected)
                    payload["quality"] = round(hr_quality, 3)
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
        _stop_height_worker()
        mqtt_client.disconnect()
        i2c_bus.close_bus()
        vl53l1x.close()


if __name__ == "__main__":
    main()
