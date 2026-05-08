import time

try:
    import pigpio
    pigpio_available = True
except ImportError:
    print("Warning: pigpio not installed. Install with: sudo apt install pigpio python3-pigpio")
    pigpio_available = False


class MAX30102:
    REG_INTR_STATUS_1 = 0x00
    REG_FIFO_WR_PTR = 0x04
    REG_FIFO_RD_PTR = 0x06
    REG_FIFO_DATA = 0x07
    REG_MODE_CONFIG = 0x09
    REG_SPO2_CONFIG = 0x0A
    REG_LED1_PA = 0x0C
    REG_LED2_PA = 0x0D

    def __init__(self, sda=17, scl=27, address=0x57, baud=100000):
        self.address = address
        self.handle = None
        self.pi = None

        if not pigpio_available:
            print("❌ pigpio not available")
            return

        pi = pigpio.pi()
        if not pi.connected:
            pi.stop()
            print("❌ pigpio daemon not running (start with: sudo pigpiod)")
            return

        handle = pi.bb_i2c_open(sda, scl, baud)
        if handle < 0:
            pi.stop()
            print(f"❌ Failed to open bit-bang I2C on SDA={sda}, SCL={scl}")
            return

        self.pi = pi
        self.handle = handle
        self.reset()
        self.setup()

    def _write(self, reg, data):
        chain = [self.address << 1, reg, data, 0]
        self.pi.bb_i2c_zip(self.handle, chain)

    def _read(self, reg, count=1):
        chain = [self.address << 1, reg, self.address << 1 | 1, count, 0]
        _, data = self.pi.bb_i2c_zip(self.handle, chain)
        return data

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
        if self.handle is not None:
            try:
                self.pi.bb_i2c_close(self.handle)
            except Exception:
                pass
            self.handle = None
        if self.pi is not None:
            try:
                self.pi.stop()
            except Exception:
                pass
            self.pi = None
