try:
    from smbus2 import SMBus
    smbus_available = True
except ImportError:
    print("Warning: smbus2 not installed. Install with: python -m pip install smbus2")
    smbus_available = False

_bus = None
_bus_number = None


def init_bus(bus=1):
    global _bus, _bus_number
    if not smbus_available:
        print("❌ smbus2 not available")
        return None
    if _bus is None:
        try:
            _bus = SMBus(bus)
            _bus_number = bus
            print(f"✅ I2C bus {bus} initialized (shared)")
        except Exception as e:
            print(f"❌ I2C bus {bus} init failed: {e}")
            _bus = None
    return _bus


def get_bus():
    return _bus


def close_bus():
    global _bus, _bus_number
    if _bus is not None:
        try:
            _bus.close()
        except Exception:
            pass
        _bus = None
        _bus_number = None
