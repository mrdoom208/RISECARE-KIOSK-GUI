
import numpy as np


def calc_hr_and_spo2(ir_data, red_data):
    """
    Basic MAX30102 pulse-rate and SpO2 estimation.
    Returns: hr, hr_valid, spo2, spo2_valid
    """

    ir = np.asarray(ir_data, dtype=float)
    red = np.asarray(red_data, dtype=float)

    if len(ir) < 50 or len(red) != len(ir):
        return -999, False, -999, False

    # Remove DC component
    ir_ac = ir - np.mean(ir)
    red_ac = red - np.mean(red)

    # Reject weak or absent signals
    if np.mean(ir) <= 0 or np.std(ir_ac) < 5:
        return -999, False, -999, False

    # Estimate heart rate from IR signal peaks
    threshold = np.mean(ir_ac) + 0.5 * np.std(ir_ac)
    peaks = []

    for i in range(1, len(ir_ac) - 1):
        if (
            ir_ac[i] > ir_ac[i - 1]
            and ir_ac[i] >= ir_ac[i + 1]
            and ir_ac[i] > threshold
        ):
            if not peaks or i - peaks[-1] >= 10:
                peaks.append(i)

    # Assumes 100 samples per second.
    # Change this if your sensor sample rate is different.
    sample_rate = 100

    if len(peaks) >= 2:
        intervals = np.diff(peaks) / sample_rate
        intervals = intervals[
            (intervals >= 60 / 220) &
            (intervals <= 60 / 30)
        ]

        if len(intervals):
            hr = 60 / np.median(intervals)
            hr_valid = 30 <= hr <= 220
        else:
            hr, hr_valid = -999, False
    else:
        hr, hr_valid = -999, False

    # Ratio-of-ratios approximation for SpO2
    red_ac_rms = np.sqrt(np.mean(red_ac ** 2))
    ir_ac_rms = np.sqrt(np.mean(ir_ac ** 2))

    red_dc = np.mean(red)
    ir_dc = np.mean(ir)

    ratio = (red_ac_rms / red_dc) / (ir_ac_rms / ir_dc)

    spo2 = 110 - 25 * ratio
    spo2_valid = (
        np.isfinite(spo2)
        and 70 <= spo2 <= 100
        and ratio > 0
    )

    if not spo2_valid:
        spo2 = -999

    return hr, hr_valid, spo2, spo2_valid
