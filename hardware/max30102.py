import time

try:
    from smbus2 import SMBus
    smbus_available = True
except ImportError:
    print("Warning: smbus2 not installed. Install with: python -m pip install smbus2")
    smbus_available = False


class MAX30102:
    REG_INTR_STATUS_1 = 0x00
    REG_FIFO_WR_PTR = 0x04
    REG_FIFO_RD_PTR = 0x06
    REG_FIFO_DATA = 0x07
    REG_MODE_CONFIG = 0x09
    REG_SPO2_CONFIG = 0x0A
    REG_LED1_PA = 0x0C
    REG_LED2_PA = 0x0D

    def __init__(self, bus=1, address=0x57):
        self.address = address
        self.handle = None
        self.bus = None

        if not smbus_available:
            print("❌ smbus2 not available")
            return

        try:
            self.bus = SMBus(bus)
            self.handle = bus
            self.read_reg(self.REG_INTR_STATUS_1)
        except Exception as e:
            self.close()
            print(f"❌ MAX30102 not reachable on I2C bus {bus} at 0x{address:02X}: {e}")
            return

        self.reset()
        self.setup()

    def _write(self, reg, data):
        self.bus.write_byte_data(self.address, reg, data)

    def _read(self, reg, count=1):
        return self.bus.read_i2c_block_data(self.address, reg, count)

    def write_reg(self, reg, value):
        if self.handle is None:
            return
        self._write(reg, value)

    def read_reg(self, reg):
        if self.handle is None:
            return 0
        data = self._read(reg, 1)
        return data[0] if data else 0

    def reset(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x40)
        time.sleep(0.1)

    def setup(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x03)
        self.write_reg(self.REG_SPO2_CONFIG, 0x27)
        self.write_reg(self.REG_LED1_PA, 0x24)
        self.write_reg(self.REG_LED2_PA, 0x24)
        self.write_reg(self.REG_FIFO_WR_PTR, 0x00)
        self.write_reg(self.REG_FIFO_RD_PTR, 0x00)

    def shutdown(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x00)
        time.sleep(0.01)

    def read_fifo(self):
        data = self._read(self.REG_FIFO_DATA, 6)
        if len(data) >= 6:
            red = (data[0] << 16 | data[1] << 8 | data[2]) & 0x3FFFF
            ir = (data[3] << 16 | data[4] << 8 | data[5]) & 0x3FFFF
            return red, ir
        return 0, 0

    def read_sequential(self, samples=50, delay=0.01):
        red_samples = []
        ir_samples = []

        for _ in range(samples):
            red, ir = self.read_fifo()
            red_samples.append(red)
            ir_samples.append(ir)
            time.sleep(delay)

        return red_samples, ir_samples

    def close(self):
        self.handle = None
        if self.bus is not None:
            try:
                self.bus.close()
            except Exception:
                pass
            self.bus = None
