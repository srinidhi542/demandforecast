import numpy as np
from scipy import signal
from statsmodels.tsa.seasonal import seasonal_decompose
import pandas as pd

def detect_seasonality(data, period=7):
    """
    Detect seasonality in time series data
    """
    try:
        if len(data) < period * 2:
            return {
                'has_seasonality': False,
                'strength': 0,
                'period': period
            }
        
        # Create a pandas Series with a date index
        dates = pd.date_range(start='2020-01-01', periods=len(data), freq='D')
        ts = pd.Series(data, index=dates)
        
        # Perform seasonal decomposition
        decomposition = seasonal_decompose(ts, model='additive', period=period, extrapolate_trend='freq')
        
        # Calculate seasonal strength
        seasonal_var = np.var(decomposition.seasonal)
        residual_var = np.var(decomposition.resid.dropna())
        
        if residual_var > 0:
            seasonal_strength = seasonal_var / (seasonal_var + residual_var)
        else:
            seasonal_strength = 0
        
        has_seasonality = seasonal_strength > 0.3
        
        return {
            'has_seasonality': bool(has_seasonality),
            'strength': float(seasonal_strength),
            'period': period
        }
    except Exception as e:
        print(f"Seasonality detection error: {e}")
        return {
            'has_seasonality': False,
            'strength': 0,
            'period': period
        }
