"""
Demand Explainability Engine
Generates human-readable explanations for forecast predictions by analyzing:
- Recent sales trend (last 7-14 days slope)
- Seasonal demand multiplier
- Detected anomalies
- Inventory pressure (if supplied)
"""

import numpy as np


def analyze_trend(quantities, window=14):
    """
    Compute linear slope over the most recent `window` data points.
    Returns: direction ('increasing'|'decreasing'|'stable'), slope value.
    """
    recent = quantities[-window:] if len(quantities) >= window else quantities
    if len(recent) < 2:
        return 'stable', 0.0
    x = np.arange(len(recent), dtype=float)
    slope = np.polyfit(x, recent, 1)[0]
    if slope > 0.5:
        return 'increasing', float(slope)
    elif slope < -0.5:
        return 'decreasing', float(slope)
    else:
        return 'stable', float(slope)


def compute_mean_std(quantities):
    arr = np.array(quantities, dtype=float)
    if len(arr) == 0:
        return 0.0, 0.0
    return float(arr.mean()), float(arr.std())


def generate_explanation(
    quantities,
    seasonal_multiplier=1.0,
    season_name='Normal Season',
    has_anomaly=False,
    anomaly_type=None,       # 'demand_spike' | 'demand_drop' | None
    inventory_low=False,     # True when stock is critically low
    inventory_high=False,    # True when stock is critically high
    forecast_value=None,
):
    """
    Build a plain-English explanation string plus a list of key factor tags.

    Returns:
        explanation (str)   : human-readable sentence
        key_factors (list)  : list of factor tag strings
        direction (str)     : 'increase' | 'decrease' | 'stable'
    """
    trend_dir, trend_slope = analyze_trend(quantities, window=14)
    mean, std = compute_mean_std(quantities)

    key_factors = []
    positive_signals = 0
    negative_signals = 0

    # ---- Trend signal ----
    if trend_dir == 'increasing':
        key_factors.append('Rising Sales Trend')
        positive_signals += 1
    elif trend_dir == 'decreasing':
        key_factors.append('Declining Sales Trend')
        negative_signals += 1
    else:
        key_factors.append('Stable Sales Trend')

    # ---- Seasonal signal ----
    if seasonal_multiplier > 1.15:
        key_factors.append(f'Peak Season ({season_name})')
        positive_signals += 2           # strong seasonal pull
    elif seasonal_multiplier > 1.0:
        key_factors.append(f'Seasonal Uplift ({season_name})')
        positive_signals += 1
    elif seasonal_multiplier < 0.85:
        key_factors.append(f'Off-Season ({season_name})')
        negative_signals += 2
    elif seasonal_multiplier < 1.0:
        key_factors.append(f'Mild Off-Season ({season_name})')
        negative_signals += 1
    else:
        key_factors.append('Normal Season')

    # ---- Anomaly signal ----
    if has_anomaly:
        if anomaly_type == 'demand_spike':
            key_factors.append('Detected Demand Spike')
            positive_signals += 1
        elif anomaly_type == 'demand_drop':
            key_factors.append('Detected Demand Drop')
            negative_signals += 1

    # ---- Inventory signal ----
    if inventory_low:
        key_factors.append('Low Inventory Alert')
        # Low inventory may suppress future sales; flag as a constraint
        negative_signals += 1
    elif inventory_high:
        key_factors.append('High Inventory')

    # ---- Derive direction from net signals ----
    if positive_signals > negative_signals:
        direction = 'increase'
    elif negative_signals > positive_signals:
        direction = 'decrease'
    else:
        direction = 'stable'

    # ---- Build narrative sentence ----
    factor_str = ', '.join(key_factors)

    if direction == 'increase':
        if seasonal_multiplier > 1.15 and trend_dir == 'increasing':
            explanation = (
                f"Demand is forecast to increase driven by {season_name} "
                f"and a strong rising sales trend over recent weeks."
            )
        elif seasonal_multiplier > 1.15:
            explanation = (
                f"Demand is expected to rise primarily due to peak seasonal activity ({season_name})."
            )
        elif trend_dir == 'increasing':
            explanation = (
                f"Demand is expected to increase based on a consistently rising sales trend "
                f"observed over the past 14 days."
            )
        elif has_anomaly and anomaly_type == 'demand_spike':
            explanation = (
                "Demand is forecast to be elevated following a recent sales spike. "
                "Monitor closely for supply adequacy."
            )
        else:
            explanation = (
                f"Demand is expected to increase. Key contributing factors: {factor_str}."
            )

    elif direction == 'decrease':
        if seasonal_multiplier < 0.85 and trend_dir == 'decreasing':
            explanation = (
                f"Demand is forecast to decline due to off-season conditions ({season_name}) "
                f"combined with a declining sales trend."
            )
        elif seasonal_multiplier < 0.85:
            explanation = (
                f"Demand is expected to decrease primarily because of low-demand seasonal period ({season_name})."
            )
        elif trend_dir == 'decreasing':
            explanation = (
                "Demand is expected to decrease based on a declining sales trend "
                "observed over the past two weeks."
            )
        elif has_anomaly and anomaly_type == 'demand_drop':
            explanation = (
                "Demand may remain suppressed following a recent sharp demand drop. "
                "Investigate potential supply or market issues."
            )
        else:
            explanation = (
                f"Demand is expected to decrease. Key contributing factors: {factor_str}."
            )

    else:  # stable
        explanation = (
            f"Demand is forecast to remain stable with no significant upward or downward pressure. "
            f"Current season: {season_name}."
        )

    return explanation, key_factors, direction
