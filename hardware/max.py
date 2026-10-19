
import time
import max30102
import hrcalc

# MAX30102 pulse oximeter test
SAMPLE_COUNT = 100
FINGER_THRESHOLD = 50000

def main():
    print("===================================")
    print("      MAX30102 SENSOR TEST")
    print("===================================")

    try:
        sensor = max30102.MAX30102()
        print("Sensor initialized.")
        print("Place your finger gently on the sensor.")
        print("Keep your finger still.")
        print("Press Ctrl+C to stop.\n")

        while True:
            # Read red and infrared samples
            red_data, ir_data = sensor.read_sequential()

            if len(red_data) < SAMPLE_COUNT or len(ir_data) < SAMPLE_COUNT:
                print("Waiting for enough samples...")
                continue

            red_avg = sum(red_data) / len(red_data)
            ir_avg = sum(ir_data) / len(ir_data)

            print(
                f"RED: {red_avg:.0f} | "
                f"IR: {ir_avg:.0f}",
                end=" | "
            )

            # Check for finger contact
            if ir_avg < FINGER_THRESHOLD or red_avg < FINGER_THRESHOLD:
                print("No finger detected or signal too weak")
                time.sleep(0.2)
                continue

            # Calculate pulse rate and SpO2
            hr, hr_valid, spo2, spo2_valid = (
                hrcalc.calc_hr_and_spo2(ir_data, red_data)
            )

            # Display valid results only
            if hr_valid and 30 <= hr <= 220:
                print(f"PR: {hr:.1f} BPM", end=" | ")
            else:
                print("PR: calculating", end=" | ")

            if spo2_valid and 70 <= spo2 <= 100:
                print(f"SpO2: {spo2:.1f}%")
            else:
                print("SpO2: calculating")

            time.sleep(0.2)

    except KeyboardInterrupt:
        print("\nTest stopped by user.")

    except Exception as error:
        print(f"\nSensor error: {error}")

    finally:
        if "sensor" in locals() and hasattr(sensor, "shutdown"):
            sensor.shutdown()
        print("MAX30102 test ended.")

if __name__ == "__main__":
    main()
