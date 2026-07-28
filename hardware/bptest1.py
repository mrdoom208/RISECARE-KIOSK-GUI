import serial
import time

# Primary Raspberry Pi hardware serial port
PORT = '/dev/ttyS0' # Use '/dev/serial0' or '/dev/ttyAMA0' if ttyS0 doesn't open
BAUD = 9600         # If garbage data appears, try 115200 or 19200

try:
    ser = serial.Serial(PORT, BAUD, timeout=0.5)
    print(f"Listening on {PORT} at {BAUD} baud...")
    print("Press START on the monitor and wait for the reading to complete...\n")
    
    while True:
        if ser.in_waiting > 0:
            raw_data = ser.read(ser.in_waiting)
            print(f"RAW HEX: {raw_data.hex(' ')}")
            try:
                print(f"ASCII:   {raw_data.decode('utf-8', errors='ignore')}")
            except Exception:
                pass
        time.sleep(0.05)

except KeyboardInterrupt:
    print("\nStopped monitoring.")
finally:
    if 'ser' in locals() and ser.is_open:
        ser.close()