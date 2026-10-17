#!/usr/bin/env python3
"""Standalone ultrasonic distance/height diagnostic for Raspberry Pi.

Usage:
    python3 ultrasonic_test.py                 stream raw distance readings
    python3 ultrasonic_test.py --height         stream calculated height
    python3 ultrasonic_test.py --calibrate      calibrate sensor-to-floor distance
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ultrasonic


def main():
    parser = argparse.ArgumentParser(description="Test the ultrasonic height sensor")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--distance", action="store_true", help="stream raw distance (default)")
    mode.add_argument("--height", action="store_true", help="stream calculated height")
    mode.add_argument("--calibrate", action="store_true", help="calibrate sensor-to-floor distance")
    args = parser.parse_args()

    try:
        if not ultrasonic.setup():
            print("FAIL: ultrasonic sensor did not return a valid echo")
            return 1

        if args.calibrate:
            total_height = ultrasonic.calibrate_height()
            return 0 if total_height is not None else 1

        if args.height:
            ultrasonic.load_calibration()
            if ultrasonic.TOTAL_HEIGHT is None:
                print("No valid calibration. Run with --calibrate first.")
                return 1
            print(f"Streaming height using {ultrasonic.TOTAL_HEIGHT:.2f} cm calibration. Ctrl+C to stop.")
        else:
            print("Streaming raw sensor distance in cm. Ctrl+C to stop.")

        while True:
            if args.height:
                value = ultrasonic.get_height()
                print(f"Height: {value:.2f} cm" if value is not None else "Height: unavailable", flush=True)
            else:
                value = ultrasonic.measure_distance()
                print(f"Distance: {value:.2f} cm" if value is not None else "Distance: no echo", flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nTest stopped")
        return 0
    except Exception as exc:
        print(f"Ultrasonic test failed: {exc}")
        return 1
    finally:
        if ultrasonic.gpio_available:
            ultrasonic.GPIO.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
