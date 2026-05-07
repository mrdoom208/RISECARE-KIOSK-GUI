import smbus2
import time

class MAX30102:
    REG_INTR_STATUS_1 = 0x00
    REG_FIFO_WR_PTR = 0x04
    REG_FIFO_RD_PTR = 0x06
    REG_FIFO_DATA = 0x07
    REG_MODE_CONFIG = 0x09
    REG_SPO2_CONFIG = 0x0A
    REG_LED1_PA = 0x0C # Red LED
    REG_LED2_PA = 0x0D # IR LED

    def __init__(self, bus=1, address=0x57):
        self.address = address
        self.bus = smbus2.SMBus(bus)
        self.reset()
        self.setup()

    def write_reg(self, reg, value):
        self.bus.write_byte_data(self.address, reg, value)

    def read_reg(self, reg):
        return self.bus.read_byte_data(self.address, reg)

    def reset(self):
        """Soft reset the sensor."""
        self.write_reg(self.REG_MODE_CONFIG, 0x40)
        time.sleep(0.1)

    def setup(self):
        """Initialize sensor with standard SpO2 settings."""
        # Mode Config: Heart Rate + SpO2 mode
        self.write_reg(self.REG_MODE_CONFIG, 0x03)
        # SpO2 Config: 411us pulse width, 100 samples/sec, 18-bit ADC
        self.write_reg(self.REG_SPO2_CONFIG, 0x27)
        # LED Pulse Amplitude (approx 7.2mA)
        self.write_reg(self.REG_LED1_PA, 0x24)
        self.write_reg(self.REG_LED2_PA, 0x24)
        # Clear FIFO pointers
        self.write_reg(self.REG_FIFO_WR_PTR, 0x00)
        self.write_reg(self.REG_FIFO_RD_PTR, 0x00)

    def shutdown(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x00)
        time.sleep(0.01)

    def read_fifo(self):
        """Read Red and IR samples from the FIFO buffer."""
        # Read 6 bytes (3 for Red, 3 for IR)
        data = self.bus.read_i2c_block_data(self.address, self.REG_FIFO_DATA, 6)
        red = (data[0] << 16 | data[1] << 8 | data[2]) & 0x3FFFF
        ir = (data[3] << 16 | data[4] << 8 | data[5]) & 0x3FFFF
        return red, ir

    def read_sequential(self, samples=50, delay=0.01):
        red_samples = []
        ir_samples = []

        for _ in range(samples):
            red, ir = self.read_fifo()
            red_samples.append(red)
            ir_samples.append(ir)
            time.sleep(delay)

        return red_samples, ir_samples