import asyncio
from bleak import BleakClient, BleakScanner

# Your Indoplas board's MAC address
DEVICE_MAC = "62:2A:F4:9E:B9:E8"

def on_notification(sender_handle, data: bytearray):
    print("\n--------------------------------------------------")
    print(f"RECEIVED DATA PACKET from handle [{sender_handle}]:")
    print(f"  HEX Format  : {data.hex(' ')}")
    print(f"  Raw Bytes   : {list(data)}")
    print(f"  ASCII Text  : {data.decode('utf-8', errors='ignore')}")
    print("--------------------------------------------------")

async def inspect_device():
    print(f"Looking for Indoplas monitor ({DEVICE_MAC})...")
    
    # Verify device is advertising
    device = await BleakScanner.find_device_by_address(DEVICE_MAC, timeout=10.0)
    if not device:
        print(f"Could not find {DEVICE_MAC}. Ensure the monitor is powered on!")
        return

    print(f"Connecting to {DEVICE_MAC}...")
    async with BleakClient(device) as client:
        print("Connected! Inspecting services and characteristics...\n")

        # Discover all GATT services provided by the board
        for service in client.services:
            print(f"[Service] {service.uuid} ({service.description})")
            for char in service.characteristics:
                props = ", ".join(char.properties)
                print(f"  └── [Char] {char.uuid} | Props: {props}")

                # Enable notifications on any characteristic that supports it
                if "notify" in char.properties or "indicate" in char.properties:
                    try:
                        await client.start_notify(char.uuid, on_notification)
                        print(f"      ---> Subscribed to notifications on {char.uuid}")
                    except Exception as e:
                        print(f"      ---> Failed to subscribe: {e}")

        print("\nReady! Put on the cuff, press START, and complete a reading.")
        print("Waiting for data (will listen for 90 seconds)...")
        await asyncio.sleep(90)

if __name__ == "__main__":
    asyncio.run(inspect_device())
    