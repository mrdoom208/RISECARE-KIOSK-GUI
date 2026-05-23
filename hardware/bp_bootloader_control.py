import serial
import time
import sys
import RPi.GPIO as GPIO

SERIAL_PORT = '/dev/serial0'
BOOT_PIN = 17
BAUD_RATES = [9600, 115200, 19200, 38400, 57600]
BAUD_SWITCH_TIMEOUT = 10  # seconds with no data before trying next baud

def setup_hardware():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BOOT_PIN, GPIO.OUT)
    GPIO.output(BOOT_PIN, GPIO.LOW)
    print("BOOT pin 17 set LOW (normal mode)")
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

    print("Listening for EBP 305 data. Put on the cuff and start a BP test.")
    print("Press Ctrl+C to stop.\n")

    buffer = bytearray()
    last_data_time = time.time()
    idle_print = True

    try:
        while True:
            now = time.time()

            if ser.in_waiting > 0:
                new_bytes = ser.read(ser.in_waiting)
                buffer.extend(new_bytes)
                last_data_time = now
                idle_print = True

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

                if idle_print and now - last_data_time > 2:
                    print(f"Waiting for data... (current baud: {BAUD_RATES[current_baud_idx]})")
                    idle_print = False

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