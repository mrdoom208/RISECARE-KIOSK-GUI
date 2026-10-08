import time
import traceback

try:
    from smbus2 import SMBus
    smbus_available = True
except ImportError:
    print("Warning: smbus2 not installed. Install with: python -m pip install smbus2")
    smbus_available = False


MLX90614_I2C_ADDR = 0x5A
RAM_ACCESS = 0x00
RAM_TA = 0x06
RAM_TOBJ1 = 0x07


class MLX90614:
    def __init__(self, bus=1, address=MLX90614_I2C_ADDR, i2c_bus=None):
        self.address = address
        self.bus = None
        self.handle = None
        self._owns_bus = i2c_bus is None
        self._shared_bus = i2c_bus
        self._bus_number = bus

        if not smbus_available:
            print("❌ smbus2 not available")
            return

        try:
            self.bus = i2c_bus if i2c_bus is not None else SMBus(bus)
            time.sleep(0.5)
            self._read_with_retry(RAM_TA, retries=3)
            self.handle = bus
        except Exception as e:
            bus_type = (
                f"{type(self.bus).__module__}.{type(self.bus).__name__}"
                if self.bus is not None else "None"
            )
            bus_fd = getattr(self.bus, "fd", None)
            print(f"MLX90614 debug: bus object={bus_type}, fd={bus_fd!r}")
            traceback.print_exc()
            self.close()
            print(f"⚠️ MLX90614 not detected on I2C bus {bus} at 0x{address:02X}: {e}")
            print("   Run 'i2cdetect -y 1' to check connected devices.")
            print("   Temperature sensor will be unavailable — system continues.")
            return

    def _read_with_retry(self, reg, retries=2):
        for attempt in range(retries + 1):
            try:
                # MLX90614 RAM registers use SMBus Read Word transactions.
                # smbus2 returns the low/high data bytes as a little-endian word.
                return self.bus.read_word_data(self.address, reg)
            except Exception as e:
                if attempt < retries:
                    time.sleep(0.1)
                else:
                    raise e
        return None

    def read_reg(self, reg):
        if self.handle is None:
            return None
        try:
            return self._read_with_retry(reg)
        except Exception as e:
            print(f"⚠️ MLX90614 read error at reg 0x{reg:02X}: {e}")
            return None

    def probe(self):
        """Re-check that the sensor still answers on I2C.

        Safe to call after a failed __init__ or an unplug: reattaches the
        shared bus first, then clears self.handle when the sensor is gone.
        """
        if not smbus_available:
            self.handle = None
            return False
        if self.bus is None and self._shared_bus is not None:
            self.bus = self._shared_bus
        if self.bus is None:
            self.handle = None
            return False
        try:
            self._read_with_retry(RAM_TA, retries=1)
        except Exception:
            self.handle = None
            return False
        self.handle = self._bus_number
        return True

    def read_ambient(self):
        raw = self.read_reg(RAM_TA)
        if raw is None:
            return None
        return round(raw * 0.02 - 273.15, 2)

    def read_object(self):
        raw = self.read_reg(RAM_TOBJ1)
        if raw is None:
            return None
        return round(raw * 0.02 - 273.15, 2)

    def get_temperature(self):
        try:
            skin_temp = self.read_object()
            if skin_temp is None:
                return None
            room_temp = self.read_ambient()
            if room_temp is None:
                return skin_temp
            estimated = skin_temp + (0.15 * (37.0 - room_temp)) + 2.5
            return round(estimated, 2)
        except Exception:
            return None

    def close(self):
        self.handle = None
        if self.bus is not None and self._owns_bus:
            try:
                self.bus.close()
            except Exception:
                pass
        self.bus = None
