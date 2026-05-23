import time
import serial

# On modern Raspberry Pi OS, /dev/serial0 automatically maps to the correct 
# hardware UART on GPIO 14/15.
ser = serial.Serial(
    port='/dev/serial0',
    baudrate=9600,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    bytesize=serial.EIGHTBITS,
    timeout=1
)

try:
    print("Serial port initialized. Starting loop...")
    while True:
        # 1. Send data out on GPIO 14 (TX)
        message = "Hello from Pi!\n"
        ser.write(message.encode('utf-8'))
        print(f"Sent: {message.strip()}")
        
        # 2. Wait a moment and check for incoming data on GPIO 15 (RX)
        time.sleep(1)
        if ser.in_waiting > 0:
            incoming_data = ser.readline().decode('utf-8', errors='ignore')
            print(f"Received: {incoming_data.strip()}")

except KeyboardInterrupt:
    print("\nExiting program.")
finally:
    ser.close()  # Always clean up and close the port!