import time

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

        if not smbus_available:
            print("❌ smbus2 not available")
            return

        try:
            self.bus = i2c_bus if i2c_bus is not None else SMBus(bus)
            self.handle = bus
            time.sleep(0.5)
            self._read_with_retry(RAM_TA, retries=3)
        except Exception as e:
            self.close()
            print(f"⚠️ MLX90614 not detected on I2C bus {bus} at 0x{address:02X}: {e}")
            print("   Run 'i2cdetect -y 1' to check connected devices.")
            print("   Temperature sensor will be unavailable — system continues.")
            return

    def _read_with_retry(self, reg, retries=2):
        for attempt in range(retries + 1):
            try:
                data = self.bus.read_i2c_block_data(self.address, reg, 3)
                raw = (data[1] << 8) | data[0]
                return raw
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
            return self.read_object()
        except Exception:
            return None

    def close(self):
        self.handle = None
        if self.bus is not None:
            try:
                self.bus.close()
            except Exception:
                pass
            self.bus = None
