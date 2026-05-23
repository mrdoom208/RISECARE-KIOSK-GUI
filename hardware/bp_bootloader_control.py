import serial
import time
import sys
import RPi.GPIO as GPIO

SERIAL_PORT = '/dev/serial0'
BOOT_PIN = 17
BAUD_RATES = [9600, 4800, 2400, 115200, 19200, 38400, 57600]
BAUD_SWITCH_TIMEOUT = 8

BOOT_HIGH = False

if len(sys.argv) > 1 and sys.argv[1] == "--boot-high":
    BOOT_HIGH = True

def setup_hardware():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BOOT_PIN, GPIO.OUT)
    state = GPIO.HIGH if BOOT_HIGH else GPIO.LOW
    GPIO.output(BOOT_PIN, state)
    print(f"BOOT pin 17 set {'HIGH' if BOOT_HIGH else 'LOW'}"
          f" ({'bootloader' if BOOT_HIGH else 'normal'} mode)")
    return None

def try_baud_rate(baud):
    try:
        ser = serial.Serial(SERIAL_PORT, baudrate=baud, timeout=0.5)
        print(f"Opened {SERIAL_PORT} @ {baud} baud")
        return ser
    except Exception as e:
        print(f"  {baud} baud failed: {e}")
        return None

def parse_blood_pressure(buffer):
    byte_list = list(buffer)

    if len(byte_list) < 6:
        return False

    print(f"\n[BUFFER] ({len(byte_list)} bytes) {buffer.hex().upper()}")
    print(f"         DEC: {list(buffer)}")

    for i in range(len(byte_list) - 2):
        val1 = byte_list[i]
        val2 = byte_list[i+1]
        val3 = byte_list[i+2]

        if (90 <= val1 <= 190) and (50 <= val2 <= 115) and (45 <= val3 <= 160):
            print()
            print("=" * 42)
            print("       >>> INDO-PLAS READING DETECTED <<<")
            print("=" * 42)
            print(f"   SYSTOLIC  (High):     {val1} mmHg")
            print(f"   DIASTOLIC (Low):      {val2} mmHg")
            print(f"   PULSE     (Heart):    {val3} bpm")
            print("=" * 42)
            print()
            return True

    return False

def print_debug_help():
    print()
    print("=" * 50)
    print("  NO DATA RECEIVED — DEBUG CHECKLIST")
    print("=" * 50)
    print("  1. Verify Pi UART is enabled:")
    print("     sudo raspi-config -> Interface Options -> Serial Port")
    print("     -> 'login shell over serial'  = NO")
    print("     -> 'serial port hardware'     = YES")
    print("     Then reboot.")
    print()
    print("  2. Check your wiring:")
    print("     Pi GPIO 14 (TXD)  -->  EBP 305 MRX")
    print("     Pi GPIO 15 (RXD)  -->  EBP 305 MTX")
    print("     Pi GND            -->  EBP 305 GND")
    print("     Pi GPIO 17        -->  EBP 305 BOOT")
    print()
    print("  3. Try BOOT pin HIGH instead of LOW:")
    print("     python bp_bootloader_control.py --boot-high")
    print()
    print("  4. Power the EBP 305 with its own batteries/USB.")
    print()
    print("  5. Start a measurement AFTER the script is running.")
    print("     Data only appears after the cuff finishes.")
    print()
    print("  6. Quick UART loopback test (on Pi):")
    print("     Connect GPIO 14 to GPIO 15 with a jumper")
    print("     then run: python -c \"")
    print("       import serial; s=serial.Serial('/dev/serial0',9600,timeout=2)")
    print("       s.write(b'HELLO'); print(repr(s.read(5)))\"")
    print("     Should print: b'HELLO'")
    print("=" * 50)
    print()

def main():
    setup_hardware()

    ser = None
    current_baud_idx = 0

    while ser is None:
        if current_baud_idx >= len(BAUD_RATES):
            print("All baud rates exhausted. Exiting.")
            GPIO.cleanup()
            sys.exit(1)
        ser = try_baud_rate(BAUD_RATES[current_baud_idx])
        if ser is None:
            current_baud_idx += 1

    print()
    print("Listening for EBP 305 data.")
    print("Put the cuff on, start a BP measurement now.")
    print("Press Ctrl+C to stop.\n")

    buffer = bytearray()
    last_data_time = time.time()
    idle_print = True
    debug_printed = False

    try:
        while True:
            now = time.time()

            if ser.in_waiting > 0:
                new_bytes = ser.read(ser.in_waiting)
                buffer.extend(new_bytes)
                last_data_time = now
                idle_print = True
                debug_printed = False

                parse_blood_pressure(buffer)

                if len(buffer) > 200:
                    buffer = buffer[-200:]
            else:
                if (now - last_data_time > BAUD_SWITCH_TIMEOUT
                        and current_baud_idx + 1 < len(BAUD_RATES)):
                    print(f"\nNo data for {BAUD_SWITCH_TIMEOUT}s on {BAUD_RATES[current_baud_idx]} baud.")
                    ser.close()
                    current_baud_idx += 1
                    ser = try_baud_rate(BAUD_RATES[current_baud_idx])
                    if ser is None:
                        print("Failed to switch baud rate. Exiting.")
                        break
                    last_data_time = now
                    buffer.clear()
                    idle_print = True

                if idle_print and now - last_data_time > 3:
                    baud = BAUD_RATES[current_baud_idx]
                    print(f"Waiting for data... (baud: {baud})")
                    idle_print = False

                if not debug_printed and now - last_data_time > BAUD_SWITCH_TIMEOUT * 3:
                    print_debug_help()
                    debug_printed = True

            time.sleep(0.05)

    except KeyboardInterrupt:
        print("\nStopped by user.")
    finally:
        if ser:
            ser.close()
        GPIO.cleanup()
        print("GPIO cleaned up.")

if __name__ == "__main__":
    main()