import serial
import time

# Primary hardware UART
ser = serial.Serial('/dev/ttyS0', baudrate=9600, timeout=1)

print("Listening on MTX (GPIO 15)...")
print("Put on cuff and let the measurement finish completely!\n")

try:
    while True:
        if ser.in_waiting > 0:
            raw_data = ser.read(ser.in_waiting)
            print(f"--> RECEIVED DATA (HEX): {raw_data.hex(' ')}")
            print(f"--> RECEIVED DATA (ASCII): {raw_data.decode('ascii', errors='ignore')}")
        time.sleep(0.05)

except KeyboardInterrupt:
    print("\nStopped listener.")