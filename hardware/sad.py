
#!/usr/bin/env python3

import time
import sys

import board
import adafruit_vl53l1x


def main():
    sensor = None

    try:
        # Initialize I2C and the VL53L1X sensor
        i2c = board.I2C()
        sensor = adafruit_vl53l1x.VL53L1X(i2c)

        # Configure sensor
        sensor.distance_mode = 2  # 1 = short, 2 = long
        sensor.timing_budget = 100  # milliseconds

        print("VL53L1X Distance Sensor")
        print("-----------------------")
        print("Press Ctrl+C to stop\n")

        sensor.start_ranging()

        while True:
            if sensor.data_ready:
                distance_cm = sensor.distance

                if distance_cm is not None:
                    distance_mm = distance_cm * 10

                    print(
                        f"Distance: {distance_mm:7.1f} mm | "
                        f"{distance_cm:6.1f} cm"
                    )

                sensor.clear_interrupt()

            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\nMeasurement stopped.")

    except Exception as error:
        print(f"Sensor error: {error}", file=sys.stderr)
        sys.exit(1)

    finally:
        if sensor is not None:
            try:
                sensor.stop_ranging()
            except Exception:
                pass


if __name__ == "__main__":
    main()
