#!/usr/bin/env python3
"""Raw MAX30102 FIFO data test for Raspberry Pi.

Usage:
    python3 max30102_raw_test.py              stream raw RED/IR values
    python3 max30102_raw_test.py --fifo       show FIFO register status
    python3 max30102_raw_test.py --temp       read temperature
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from max30102 import MAX30102


def main():
    parser = argparse.ArgumentParser(description="Test MAX30102 raw FIFO data")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--fifo", action="store_true", help="show FIFO register status")
    mode.add_argument("--temp", action="store_true", help="read temperature")
    args = parser.parse_args()

    try:
        sensor = MAX30102(bus=1, address=0x57, led_current=0x1F)
        print("✅ MAX30102 initialized")
        print(f"   PART_ID: 0x{sensor.read_reg(sensor.REG_PART_ID):02X}")
        print(f"   REV_ID:  0x{sensor.read_reg(sensor.REG_REVISION_ID):02X}")
        print()

        if args.fifo:
            while True:
                wr = sensor.read_reg(sensor.REG_FIFO_WR_PTR)
                rd = sensor.read_reg(sensor.REG_FIFO_RD_PTR)
                ovf = sensor.read_reg(sensor.REG_FIFO_OVF)
                count = (wr - rd) & 0x1F
                intr1 = sensor.read_reg(sensor.REG_INTR_STATUS_1)
                intr2 = sensor.read_reg(sensor.REG_INTR_STATUS_2)
                print(f"WR={wr:2d} RD={rd:2d} OVF={ovf:2d} CNT={count:2d} INT1=0x{intr1:02X} INT2=0x{intr2:02X}", flush=True)
                time.sleep(0.1)
            return

        if args.temp:
            while True:
                try:
                    temp = sensor.read_temperature()
                    print(f"Temperature: {temp:.2f} °C", flush=True)
                except Exception as e:
                    print(f"Temp error: {e}", flush=True)
                time.sleep(1.0)
            return

        print("Streaming raw RED/IR samples... Ctrl+C to stop")
        print("Place finger on sensor for valid data")
        print()

        while True:
            samples = sensor.read_fifo(max_samples=32)
            if samples:
                for red, ir in samples:
                    print(f"RED={red:6d}  IR={ir:6d}  diff={red-ir:+6d}", flush=True)
            else:
                print(".", end="", flush=True)
            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\nTest stopped")
        return 0
    except Exception as exc:
        print(f"MAX30102 test failed: {exc}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        try:
            sensor.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())