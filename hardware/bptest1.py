import serial
import time

# Primary hardware UART on Raspberry Pi 4
SERIAL_PORT = "/dev/ttyS0" 
BAUD_RATE = 9600

try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    print(f"Listening on {SERIAL_PORT} at {BAUD_RATE} baud...")
    print("Press START on the Indoplas monitor to begin a reading...\n")

    while True:
        if ser.in_waiting > 0:
            # Read incoming byte sequence
            raw_data = ser.read(ser.in_waiting)
            
            # Print raw byte stream in HEX format
            hex_str = " ".join([f"{b:02X}" for b in raw_data])
            print(f"[HEX DATA]: {hex_str}")
            
            # Print ASCII attempt in case it's plain text
            ascii_str = raw_data.decode('ascii', errors='ignore').strip()
            if ascii_str:
                print(f"[ASCII TEXT]: {ascii_str}")
                
        time.sleep(0.05)

except serial.SerialException as e:
    print(f"Error opening port: {e}")
except KeyboardInterrupt:
    print("\nListener stopped.")