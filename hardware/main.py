import ultrasonic
import heartrateSpo2
import loadcell
import time
import mqtt_client

running = False
mode = 1  # 0=off, 1=normal, 2=calibrate, 3=test
current_session_id = None
hr_enabled = False
spo2_enabled = False


def handle_command(sensor, session_id, value, payload):
    global mode, running, current_session_id
    
    # Store session ID for publishing data
    if session_id:
        current_session_id = session_id
    
    # Start sensor reading
    if value == 1:
        mode = 1
        running = True
        if sensor == "heartrate":
            hr_enabled = True
            print(f"▶️ Heart Rate sensor ON (session: {session_id})")
        elif sensor == "spo2":
            spo2_enabled = True
            print(f"▶️ SpO2 sensor ON (session: {session_id})")
        else:
            print(f"▶️ {sensor} sensor ON (session: {session_id})")
    
    # Calibrate specific sensor
    elif value == 2:
        print(f"⚙️ Calibrating {sensor}...")
        if sensor == "height":
            ultrasonic.calibrate_height()
        elif sensor == "weight":
            loadcell.calibrate_loadcell()
        elif sensor == "heartrate" or sensor == "spo2":
            print("⚠️ Calibration not implemented for heartrate/spo2")
        else:
            print(f"⚠️ Unknown sensor for calibration: {sensor}")
        mode = 1  # Return to normal
        running = True
    
    # Test specific sensor
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
        mode = 1  # Return to normal
        running = True
    
    # Stop sensor
    elif value == 0:
        if sensor == "heartrate":
            hr_enabled = False
            print(f"🛑 Heart Rate sensor OFF")
        elif sensor == "spo2":
            spo2_enabled = False
            print(f"🛑 SpO2 sensor OFF")
        else:
            print(f"🛑 {sensor} sensor OFF")
        # Only set running=False if no sensors are enabled
        if not hr_enabled and not spo2_enabled:
            running = False
            mode = 0
    
    else:
        print(f"⚠️ Unknown command: sensor={sensor}, value={value}")


def test_sensors():
    print("\n--- Testing Sensors ---")
    
    # Test ultrasonic
    dist = ultrasonic.measure_distance()
    print(f"Ultrasonic distance: {dist} cm")
    
    # Test loadcell
    weight = loadcell.get_weight()
    if weight:
        print(f"LoadCell weight: {weight} g")
    
    # Test heartrate
    hr, hr_valid, spo2, spo2_valid = heartrateSpo2.get_reading()
    if hr_valid and spo2_valid:
        print(f"HeartRate: {hr:.2f} bpm, SpO2: {spo2:.2f}%")
    else:
        print("HeartRate: Invalid reading")
    
    print("--- Test Complete ---\n")


def main():
    global running, mode
    
    print("Starting RiseCare Health Kiosk...")
    
    # Load all calibration data
    print("\nLoading calibration data...")
    ultrasonic.load_calibration()
    loadcell.load_calibration()
    
    # Initialize sensors
    print("\nInitializing sensors...")
    heartrateSpo2.setup()
    ultrasonic.setup()
    loadcell.setup()
    print("✓ MAX30102 sensor ready")
    print("✓ Ultrasonic sensor ready")
    print("✓ LoadCell sensor ready")
    
    # Connect to MQTT
    print("\nConnecting to MQTT...")
    mqtt_client.set_command_callback(handle_command)
    mqtt_client.connect()
    
    print("\n✅ All systems ready!")
    print("Waiting for MQTT commands (0=off, 1=normal, 2=calibrate, 3=test)")
    
    running = True
    mode = 1
    
    try:
        while True:
            if mode == 1 and running:
                # Normal operation - read sensors
                hr, hr_valid, spo2, spo2_valid = heartrateSpo2.get_reading()
                
                height = ultrasonic.get_height()
                
                weight = loadcell.get_weight()
                
                # Publish heartrate only if HR sensor is enabled
                if hr_enabled and hr_valid:
                    mqtt_client.publish(f"risecare/sensors/heartrate", 
                        {"bpm": hr, "sessionId": current_session_id, "timestamp": time.time()})
                
                # Publish SpO2 only if SpO2 sensor is enabled
                if spo2_enabled and spo2_valid:
                    mqtt_client.publish(f"risecare/sensors/spo2", 
                        {"value": spo2, "sessionId": current_session_id, "timestamp": time.time()})
                
                # Publish height
                if height is not None:
                    mqtt_client.publish(f"risecare/sensors/height", 
                        {"cm": height, "sessionId": current_session_id, "timestamp": time.time()})
                
                # Publish weight (convert to kg)
                if weight is not None:
                    mqtt_client.publish(f"risecare/sensors/weight", 
                        {"kg": weight / 1000, "sessionId": current_session_id, "timestamp": time.time()})
                
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
