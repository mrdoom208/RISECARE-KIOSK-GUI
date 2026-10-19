import time
import math
from collections import deque

import numpy as np

try:
    from smbus2 import SMBus, i2c_msg
    smbus_available = True
except ImportError:
    SMBus = None
    i2c_msg = None
    smbus_available = False

try:
    from scipy.signal import butter, filtfilt, find_peaks
except ImportError:
    butter = filtfilt = find_peaks = None


class MAX30102:
    """
    MAX30102 driver + basic pulse-rate/SpO2 estimator.

    IMPORTANT:
    - This is suitable for hobby/engineering use.
    - SpO2 is NOT medically validated.
    - Accurate SpO2 requires sensor/mechanical/calibration validation.
    """

    ADDRESS = 0x57
    PART_ID = 0x15

    # Registers
    REG_INTR_STATUS_1 = 0x00
    REG_INTR_STATUS_2 = 0x01
    REG_INTR_ENABLE_1 = 0x02
    REG_INTR_ENABLE_2 = 0x03

    REG_FIFO_WR_PTR = 0x04
    REG_FIFO_OVF = 0x05
    REG_FIFO_RD_PTR = 0x06
    REG_FIFO_DATA = 0x07
    REG_FIFO_CONFIG = 0x08

    REG_MODE_CONFIG = 0x09
    REG_SPO2_CONFIG = 0x0A

    REG_LED1_PA = 0x0C
    REG_LED2_PA = 0x0D

    REG_TEMP_INT = 0x1F
    REG_TEMP_FRAC = 0x20
    REG_TEMP_CONFIG = 0x21

    REG_REVISION_ID = 0xFE
    REG_PART_ID = 0xFF

    # Configuration
    SAMPLE_RATE = 100.0

    # 4-8 seconds gives enough cardiac cycles for stable estimation.
    WINDOW_SIZE = 400

    # Samples discarded right after a finger is detected while the
    # contact settles. Starting the window only once the signal is
    # steady is what keeps readings independent of when the finger
    # is placed.
    SETTLE_SAMPLES = 100

    # Minimum LED DC levels (ADC counts) that count as a hand being present.
    FINGER_MIN_RED = 60000
    FINGER_MIN_IR = 90000

    def __init__(
        self,
        bus=1,
        address=ADDRESS,
        i2c_bus=None,
        led_current=0x1F,
    ):
        if SMBus is None:
            raise RuntimeError(
                "smbus2 is not installed. "
                "Install with: python -m pip install smbus2"
            )

        self.address = address
        self._owns_bus = i2c_bus is None

        self.bus = i2c_bus if i2c_bus is not None else SMBus(bus)
        self.handle = self.bus

        self.red_buffer = deque(maxlen=self.WINDOW_SIZE)
        self.ir_buffer = deque(maxlen=self.WINDOW_SIZE)

        self._smoothed_pr = None
        self._smoothed_spo2 = None
        self._finger_present = False
        self._settle_remaining = 0

        try:
            self._check_device()
            self.reset()
            self.setup(led_current)
        except Exception:
            self.close()
            raise

    # ------------------------------------------------------------
    # LOW LEVEL I2C
    # ------------------------------------------------------------

    def _write(self, reg, data):
        # Use a single combined I2C transaction (i2c_rdwr) instead of
        # write_byte_data. Back-to-back smbus block calls frequently raise
        # [Errno 121] Remote I/O error on the Pi's i2c-bcm2835 driver.
        msg = i2c_msg.write(self.address, [reg, data])
        self._rdwr(msg)

    def _read(self, reg, count=1):
        write = i2c_msg.write(self.address, [reg])
        read = i2c_msg.read(self.address, count)
        self._rdwr(write, read)
        return list(read)

    def _rdwr(self, *msgs):
        last_error = None
        for attempt in range(3):
            try:
                self.bus.i2c_rdwr(*msgs)
                return
            except OSError as e:
                # errno 121 == EREMOTEIO; the bus is momentarily busy.
                last_error = e
                if getattr(e, "errno", None) != 121:
                    raise
                time.sleep(0.01 * (attempt + 1))
        raise last_error

    def read_reg(self, reg):
        return self._read(reg, 1)[0]

    def write_reg(self, reg, value):
        self._write(reg, value)

    # ------------------------------------------------------------
    # DEVICE INITIALIZATION
    # ------------------------------------------------------------

    def _check_device(self):
        part_id = self.read_reg(self.REG_PART_ID)

        if part_id != self.PART_ID:
            raise RuntimeError(
                f"Unexpected MAX30102 PART_ID: "
                f"0x{part_id:02X}, expected 0x{self.PART_ID:02X}"
            )

    def probe(self):
        try:
            self._check_device()
        except (OSError, RuntimeError):
            self.handle = None
            return False
        self.handle = self.bus
        return True

    def reset(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x40)

        # Wait for RESET bit to clear.
        deadline = time.monotonic() + 1.0

        while time.monotonic() < deadline:
            value = self.read_reg(self.REG_MODE_CONFIG)

            if not (value & 0x40):
                break

            time.sleep(0.01)
        else:
            raise TimeoutError("MAX30102 reset timed out")

        self.clear_fifo()

    def clear_fifo(self):
        self.write_reg(self.REG_FIFO_WR_PTR, 0x00)
        self.write_reg(self.REG_FIFO_OVF, 0x00)
        self.write_reg(self.REG_FIFO_RD_PTR, 0x00)

    def clear_buffer(self):
        self.red_buffer.clear()
        self.ir_buffer.clear()
        self._smoothed_pr = None
        self._smoothed_spo2 = None
        self._finger_present = False
        self._settle_remaining = 0
        self.clear_fifo()

    def setup(self, led_current=0x1F):
        """
        Configure:

        SpO2 mode
        100 samples/sec (effective FIFO rate)
        411 us pulse width
        18-bit ADC
        FIFO rollover enabled
        no on-chip sample averaging
        """

        # Disable interrupts while configuring.
        self.write_reg(self.REG_INTR_ENABLE_1, 0x00)
        self.write_reg(self.REG_INTR_ENABLE_2, 0x00)

        self.clear_fifo()

        # FIFO:
        #
        # SMP_AVE = 1 (no averaging)
        # FIFO_ROLLOVER_EN = 1
        #
        # 0x10 = 0001 0000
        #
        # On-chip averaging *decimates* the FIFO: SMP_AVE=4 would drop the
        # effective rate to 25 SPS even though SPO2_SR says 100, which
        # breaks every SAMPLE_RATE-based calculation below. Keep no
        # averaging so the FIFO really delivers SAMPLE_RATE samples/sec.
        self.write_reg(self.REG_FIFO_CONFIG, 0x10)

        # SPO2 CONFIG:
        #
        # ADC range = 4096 nA
        # sample rate = 100 SPS
        # pulse width = 411 us / 18-bit
        #
        # ADC range bits 6:5 = 01
        # sample rate bits 4:2 = 001
        # pulse width bits 1:0 = 11
        #
        # 01 001 11 = 0x27
        self.write_reg(self.REG_SPO2_CONFIG, 0x27)

        # Red LED
        self.write_reg(self.REG_LED1_PA, led_current)

        # IR LED
        self.write_reg(self.REG_LED2_PA, led_current)

        # SpO2 mode: Red + IR
        self.write_reg(self.REG_MODE_CONFIG, 0x03)

        self.clear_fifo()

    # ------------------------------------------------------------
    # FIFO
    # ------------------------------------------------------------

    def fifo_sample_count(self):
        """
        Number of unread samples currently in the FIFO.
        """

        wr = self.read_reg(self.REG_FIFO_WR_PTR)
        rd = self.read_reg(self.REG_FIFO_RD_PTR)

        return (wr - rd) & 0x1F

    def fifo_overflow_count(self):
        return self.read_reg(self.REG_FIFO_OVF)

    @staticmethod
    def _parse_sample(data):
        """
        Parse:

        RED: bytes 0-2
        IR:  bytes 3-5

        MAX30102 ADC is 18-bit.
        """

        if len(data) != 6:
            raise ValueError("Expected exactly 6 FIFO bytes")

        red = (
            (data[0] << 16)
            | (data[1] << 8)
            | data[2]
        ) & 0x3FFFF

        ir = (
            (data[3] << 16)
            | (data[4] << 8)
            | data[5]
        ) & 0x3FFFF

        return red, ir

    def read_one_sample(self):
        """
        Read one sample from FIFO.
        """

        data = self._read(self.REG_FIFO_DATA, 6)

        if len(data) != 6:
            raise IOError("Incomplete MAX30102 FIFO read")

        return self._parse_sample(data)

    def read_fifo(self, max_samples=32):
        """
        Read all currently available samples.

        Returns:
            list[(red, ir)]
        """

        samples = []

        available = self.fifo_sample_count()

        if available <= 0:
            return samples

        available = min(available, max_samples)

        for _ in range(available):
            samples.append(self.read_one_sample())

        return samples

    def update_buffer(self):
        """
        Pull all currently available samples from hardware
        into the rolling software buffer.

        Samples captured with no finger on the sensor are discarded and
        the buffer is reset, so readings taken before the finger is
        placed cannot skew the result. After a finger is detected the
        first SETTLE_SAMPLES are dropped so the window only ever holds
        settled signal -- this keeps SpO2/pulse-rate independent of when
        the finger was placed.
        """

        samples = self.read_fifo()

        if not samples:
            return 0

        red_dc = sum(red for red, _ in samples) / len(samples)
        ir_dc = sum(ir for _, ir in samples) / len(samples)
        finger_present = (
            red_dc >= self.FINGER_MIN_RED
            and ir_dc >= self.FINGER_MIN_IR
        )

        if not finger_present:
            # No finger: drop the batch and any stale window/smoothing.
            if self._finger_present or self.ir_buffer:
                self.clear_buffer()
            return 0

        if not self._finger_present:
            # Finger just placed: start from a clean, settled window.
            self.clear_buffer()
            self._finger_present = True
            self._settle_remaining = self.SETTLE_SAMPLES

        appended = 0

        for red, ir in samples:
            if self._settle_remaining > 0:
                self._settle_remaining -= 1
                continue

            self.red_buffer.append(red)
            self.ir_buffer.append(ir)
            appended += 1

        return appended

    # ------------------------------------------------------------
    # TEMPERATURE
    # ------------------------------------------------------------

    def read_temperature(self):
        """
        Read MAX30102 die temperature.

        Useful as a sensor-health diagnostic.
        """

        self.write_reg(self.REG_TEMP_CONFIG, 0x01)

        deadline = time.monotonic() + 1.0

        while time.monotonic() < deadline:

            # TEMP_RDY is INT_STATUS2 bit 1.
            status = self.read_reg(self.REG_INTR_STATUS_2)

            if status & 0x02:
                break

            time.sleep(0.01)
        else:
            raise TimeoutError("Temperature conversion timed out")

        integer = self.read_reg(self.REG_TEMP_INT)

        fraction = self.read_reg(self.REG_TEMP_FRAC)

        if integer & 0x80:
            integer -= 256

        return integer + fraction * 0.0625

    # ------------------------------------------------------------
    # SIGNAL PROCESSING
    # ------------------------------------------------------------

    @staticmethod
    def _bandpass(signal, fs):
        if butter is None or filtfilt is None:
            return signal - np.mean(signal)

        nyquist = fs / 2.0

        low = 0.7 / nyquist
        high = 4.0 / nyquist

        b, a = butter(
            3,
            [low, high],
            btype="band"
        )

        # filtfilt's default padding is far too short for this narrow
        # band and leaves large transients at the window edges. Pad more
        # aggressively so edge artifacts cannot inflate the AC amplitude
        # (which biases the ratio-of-ratios and drags SpO2 down).
        padlen = int(0.5 * fs)
        padlen = max(0, min(padlen, len(signal) - 1))

        return filtfilt(b, a, signal, padlen=padlen)

    @staticmethod
    def _lowpass(signal, fs, cutoff=0.5):
        """
        Very slow component / baseline.
        """

        if butter is None or filtfilt is None:
            return np.full_like(
                signal,
                np.mean(signal)
            )

        nyquist = fs / 2.0

        b, a = butter(
            2,
            cutoff / nyquist,
            btype="low"
        )

        return filtfilt(b, a, signal)

    def _ac_dc(self, signal):
        """
        Edge-safe AC (RMS) and DC level for one channel.

        The band-passed signal is measured away from the window edges so
        filter transients from a freshly filled window cannot inflate
        the AC amplitude used by the ratio-of-ratios.
        """
        signal = np.asarray(signal, dtype=float)

        trim = int(len(signal) * 0.10)
        core = signal[trim:len(signal) - trim] if trim else signal

        dc = float(np.mean(core))

        ac = self._bandpass(signal, self.SAMPLE_RATE)
        if trim:
            ac = ac[trim:len(ac) - trim]

        rms = float(np.sqrt(np.mean(ac ** 2)))

        return rms, dc

    def _signal_quality(self, ir, red):
        """
        Basic quality checks.

        Returns:
            quality_score, valid
        """
        if len(ir) < 150:
            return 0.0, False

        ir = np.asarray(ir, dtype=float)
        red = np.asarray(red, dtype=float)

        ir_mean = np.mean(ir)
        red_mean = np.mean(red)

        if ir_mean < 1000 or red_mean < 1000:
            return 0.0, False

        # Detect ADC saturation / clipping.
        if np.max(ir) >= 262000 or np.max(red) >= 262000:
            return 0.0, False

        ir_ac = self._bandpass(ir, self.SAMPLE_RATE)

        amplitude = np.std(ir_ac)

        if amplitude < 20:
            return 0.0, False

        # Signal amplitude relative to DC.
        perfusion = amplitude / max(abs(ir_mean), 1.0)

        # Very rough quality score.
        quality = min(
            1.0,
            perfusion / 0.01
        )

        return quality, quality >= 0.15

    # ------------------------------------------------------------
    # PULSE RATE
    # ------------------------------------------------------------

    def _calculate_pulse_rate(self, ir):
        ir = np.asarray(ir, dtype=float)

        filtered = self._bandpass(
            ir,
            self.SAMPLE_RATE
        )

        if find_peaks is None:
            return 0, False

        amplitude = np.std(filtered)

        if amplitude < 20:
            return 0, False

        # Minimum distance:
        #
        # 0.30 sec -> maximum 200 BPM
        #
        min_distance = int(
            self.SAMPLE_RATE * 0.30
        )

        # Prominence is more robust than a fixed threshold.
        prominence = max(
            amplitude * 0.35,
            10
        )

        peaks, properties = find_peaks(
            filtered,
            distance=min_distance,
            prominence=prominence
        )

        if len(peaks) < 3:
            return 0, False

        intervals = np.diff(peaks)

        # Convert to seconds.
        intervals_sec = (
            intervals / self.SAMPLE_RATE
        )

        # Remove physiologically implausible beats.
        valid = intervals_sec[
            (intervals_sec >= 0.30) &
            (intervals_sec <= 2.00)
        ]

        if len(valid) < 2:
            return 0, False

        median_interval = np.median(valid)

        # Reject intervals far from the dominant rhythm.
        valid = valid[
            (valid >= median_interval * 0.70) &
            (valid <= median_interval * 1.30)
        ]

        if len(valid) < 2:
            return 0, False

        median_period = np.median(valid)

        pulse_rate = 60.0 / median_period

        if not 30 <= pulse_rate <= 200:
            return 0, False

        # Beat-to-beat consistency.
        cv = np.std(valid) / np.mean(valid)

        if cv > 0.20:
            return int(round(pulse_rate)), False

        return int(round(pulse_rate)), True

    # ------------------------------------------------------------
    # SPO2
    # ------------------------------------------------------------

    def _calculate_spo2(self, red, ir):
        """
        Ratio-of-ratios SpO2 estimation.

        A value is only produced once a full, settled window is
        available, and the AC/DC levels are taken from the centre of the
        window. This makes the result independent of when the finger was
        placed on the sensor.

        This is NOT medically calibrated.
        """

        red = np.asarray(red, dtype=float)
        ir = np.asarray(ir, dtype=float)

        if len(red) < self.WINDOW_SIZE or len(ir) < self.WINDOW_SIZE:
            return 0, False

        red_rms, red_dc = self._ac_dc(red)
        ir_rms, ir_dc = self._ac_dc(ir)

        if red_dc <= 0 or ir_dc <= 0:
            return 0, False

        if red_rms <= 0 or ir_rms <= 0:
            return 0, False

        # Ratio-of-ratios.
        r = (
            (red_rms / red_dc)
            /
            (ir_rms / ir_dc)
        )

        if not np.isfinite(r):
            return 0, False

        # Reject obviously unreasonable ratios.
        if not 0.2 <= r <= 2.0:
            return 0, False

        # Common empirical quadratic calibration.
        spo2 = (
            -45.060 * r * r
            + 30.354 * r
            + 94.845
        )

        if not np.isfinite(spo2):
            return 0, False

        # Do not silently accept garbage.
        if not 70 <= spo2 <= 100:
            return int(round(np.clip(spo2, 0, 100))), False

        return int(round(spo2)), True

    # ------------------------------------------------------------
    # COMBINED ESTIMATION
    # ------------------------------------------------------------

    def calculate(self):
        """
        Calculate pulse rate + SpO2 from the current rolling buffer.

        A reading is only produced once the buffer holds a full, settled
        window (see ``update_buffer``); before that the result is empty.
        This makes the output independent of how long the finger had
        been placed when reading started.

        Returns:
            {
                "pulse_rate": int,
                "pulse_rate_valid": bool,
                "spo2": int,
                "spo2_valid": bool,
                "quality": float,
                "samples": int
            }
        """

        if len(self.ir_buffer) < self.WINDOW_SIZE or not self._finger_present:
            return {
                "pulse_rate": 0,
                "pulse_rate_valid": False,
                "spo2": 0,
                "spo2_valid": False,
                "quality": 0.0,
                "samples": len(self.ir_buffer),
            }

        ir = np.asarray(self.ir_buffer, dtype=float)
        red = np.asarray(self.red_buffer, dtype=float)

        quality, signal_ok = self._signal_quality(
            ir,
            red
        )

        if not signal_ok:
            return {
                "pulse_rate": 0,
                "pulse_rate_valid": False,
                "spo2": 0,
                "spo2_valid": False,
                "quality": quality,
                "samples": len(ir),
            }

        pulse_rate, pulse_rate_valid = self._calculate_pulse_rate(ir)

        spo2, spo2_valid = self._calculate_spo2(
            red,
            ir
        )

        # Temporal smoothing.
        if pulse_rate_valid:

            if self._smoothed_pr is None:
                self._smoothed_pr = float(pulse_rate)
            else:
                self._smoothed_pr = (
                    0.75 * self._smoothed_pr
                    + 0.25 * pulse_rate
                )

            pulse_rate = int(round(self._smoothed_pr))

        if spo2_valid:

            if self._smoothed_spo2 is None:
                self._smoothed_spo2 = float(spo2)
            else:
                self._smoothed_spo2 = (
                    0.85 * self._smoothed_spo2
                    + 0.15 * spo2
                )

            spo2 = int(round(self._smoothed_spo2))

        return {
            "pulse_rate": pulse_rate,
            "pulse_rate_valid": pulse_rate_valid,
            "spo2": spo2,
            "spo2_valid": spo2_valid,
            "quality": round(quality, 3),
            "samples": len(ir),
        }

    # ------------------------------------------------------------
    # PUBLIC READING API
    # ------------------------------------------------------------

    def get_reading(self):
        """
        Pull new FIFO data and calculate a reading.
        """

        try:
            new_samples = self.update_buffer()

            result = self.calculate()

            result["new_samples"] = new_samples
            result["fifo_available"] = self.fifo_sample_count()
            result["fifo_overflow"] = self.fifo_overflow_count()

            return result

        except OSError as e:
            return {
                "pulse_rate": 0,
                "pulse_rate_valid": False,
                "spo2": 0,
                "spo2_valid": False,
                "quality": 0.0,
                "samples": len(self.ir_buffer),
                "error": str(e),
            }

    # ------------------------------------------------------------
    # SHUTDOWN
    # ------------------------------------------------------------

    def shutdown(self):
        try:
            self.write_reg(
                self.REG_MODE_CONFIG,
                0x80
            )
        except Exception:
            pass

    def close(self):
        try:
            self.shutdown()
        except Exception:
            pass

        if self.bus is not None and self._owns_bus:
            try:
                self.bus.close()
            except Exception:
                pass

        self.bus = None
        self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


# ================================================================
# EXAMPLE
# ================================================================

if __name__ == "__main__":

    with MAX30102(
        bus=1,
        address=0x57,
        led_current=0x1F
    ) as sensor:

        print("MAX30102 running...")
        print("Place finger gently on sensor.")
        print()

        while True:

            # Poll FIFO frequently.
            #
            # Do NOT sleep 5 ms expecting this to equal one sample.
            # The MAX30102 itself determines sample timing.
            reading = sensor.get_reading()

            if "error" in reading:
                print("I2C ERROR:", reading["error"])
                time.sleep(0.1)
                continue

            hr = reading["pulse_rate"]
            hr_valid = reading["pulse_rate_valid"]

            spo2 = reading["spo2"]
            spo2_valid = reading["spo2_valid"]

            quality = reading["quality"]

            if hr_valid:
                hr_text = f"{hr} BPM"
            else:
                hr_text = "--"

            if spo2_valid:
                spo2_text = f"{spo2}%"
            else:
                spo2_text = "--"

            print(
                f"PR: {hr_text:>8} | "
                f"SpO2: {spo2_text:>4} | "
                f"quality={quality:.2f} | "
                f"new={reading.get('new_samples', 0):2d} | "
                f"overflow={reading.get('fifo_overflow', 0)}"
            )

            # Polling interval is deliberately much slower than
            # the sensor sample rate. The FIFO stores samples for us.
            time.sleep(0.05)
