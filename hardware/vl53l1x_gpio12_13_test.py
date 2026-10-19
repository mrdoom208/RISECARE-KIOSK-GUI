#!/usr/bin/env python3
"""Standalone VL53L1X TOF distance/height diagnostic for Raspberry Pi on GPIO 12/13 (software I2C).

Usage:
    python3 vl53l1x_gpio12_13_test.py                 stream raw distance readings
    python3 vl53l1x_gpio12_13_test.py --height         stream calculated height
    python3 vl53l1x_gpio12_13_test.py --calibrate      calibrate sensor-to-floor distance
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vl53l1x


def main():
    parser = argparse.ArgumentParser(description="Test the VL53L1X TOF height sensor on GPIO 12/13")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--distance", action="store_true", help="stream raw distance (default)")
    mode.add_argument("--height", action="store_true", help="stream calculated height")
    mode.add_argument("--calibrate", action="store_true", help="calibrate sensor-to-floor distance")
    args = parser.parse_args()

    # Use actual bus number from i2cdetect -l (i2c-20 for GPIO 12/13)
    vl53l1x.set_bus_number(20)

    try:
        if not vl53l1x.setup():
            print("FAIL: VL53L1X sensor did not return a valid reading")
            return 1

        if args.calibrate:
            total_height = vl53l1x.calibrate_height()
            return 0 if total_height is not None else 1

        if args.height:
            vl53l1x.load_calibration()
            if vl53l1x.TOTAL_HEIGHT is None:
                print("No valid calibration. Run with --calibrate first.")
                return 1
            print(f"Streaming height using {vl53l1x.TOTAL_HEIGHT:.2f} cm calibration. Ctrl+C to stop.")
        else:
            print("Streaming raw sensor distance in cm. Ctrl+C to stop.")

        while True:
            if args.height:
                value = vl53l1x.get_height()
                if value is not None:
                    print(f"Height: {value:.2f} cm", flush=True)
                else:
                    print("Height: unavailable", flush=True)
            else:
                value = vl53l1x.measure_distance()
                if value is not None:
                    print(f"Distance: {value:.2f} cm", flush=True)
                else:
                    print("Distance: no reading", flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nTest stopped")
        return 0
    except Exception as exc:
        print(f"VL53L1X test failed: {exc}")
        return 1
    finally:
        vl53l1x.close()


if __name__ == "__main__":
    raise SystemExit(main())