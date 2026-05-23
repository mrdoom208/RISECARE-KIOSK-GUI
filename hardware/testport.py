import time
import serial

print("Starting Loopback Test on GPIO 14 <-> GPIO 15...")

try:
    # Initialize serial port
    ser = serial.Serial(
        port='/dev/serial0',
        baudrate=9600,
        timeout=1
    )
    
    # Clear any old data out of the buffers
    ser.reset_input_buffer()
    ser.reset_output_buffer()
    time.sleep(0.5)

    while True:
        # 1. Send data out of TX (GPIO 14)
        test_message = "PING\n"
        ser.write(test_message.encode('utf-8'))
        print(f"Sent: {test_message.strip()}")
        
        # Give the hardware a tiny split second to process the bytes
        time.sleep(0.1)
        
        # 2. Check if the data arrived at RX (GPIO 15)
        if ser.in_waiting > 0:
            incoming = ser.readline().decode('utf-8', errors='ignore')
            print(f"Success! Received: {incoming.strip()}")
        else:
            print("Failed: No data came back.")
            
        print("-" * 30)
        time.sleep(2) # Wait 2 seconds before trying again

except serial.SerialException as e:
    print(f"\nSerial Error: {e}")
    print("This usually means /dev/serial0 is disabled or busy.")
    print("Fix: Run 'sudo raspi-config', enable Serial Port, disable Serial Console, and reboot.")

except KeyboardInterrupt:
    print("\nStopping test.")
finally:
    if 'ser' in locals() and ser.is_open:
        ser.close()