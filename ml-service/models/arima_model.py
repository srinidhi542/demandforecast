from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller
import numpy as np
import warnings
warnings.filterwarnings('ignore')

def train_arima(y_train, order=(5, 1, 0), period=7):
    """
    Train ARIMA model for time series forecasting with seasonal decomposition
    """
    try:
        if len(y_train) < period * 2:
            period = 1
            trend = y_train
            seasonal = np.zeros(len(y_train))
        else:
            decomposition = seasonal_decompose(y_train, model='additive', period=period, extrapolate_trend='freq')
            trend = decomposition.trend
            seasonal = decomposition.seasonal
        
        # Fit ARIMA model on trend
        model = ARIMA(trend, order=order)
        fitted_model = model.fit()
        
        return {
            'model': fitted_model,
            'seasonal': seasonal,
            'period': period
        }
    except Exception as e:
        # Fallback to simpler model
        print(f"ARIMA training error: {e}, using simpler order")
        model = ARIMA(y_train, order=(0, 1, 0))
        fitted_model = model.fit()
        return {
            'model': fitted_model,
            'seasonal': np.zeros(len(y_train)),
            'period': 1
        }

def predict_arima(model_dict, steps):
    """
    Make predictions using hybrid ARIMA model
    """
    fitted_model = model_dict['model']
    seasonal = model_dict['seasonal']
    period = model_dict['period']
    
    forecast = fitted_model.forecast(steps=steps)
    trend_forecast = np.array(forecast)
    
    if period > 1 and len(seasonal) >= period:
        last_season = seasonal[-period:]
        repeats = int(np.ceil(steps / period))
        future_season = np.tile(last_season, repeats)[:steps]
    else:
        future_season = np.zeros(steps)
        
    final_forecast = trend_forecast + future_season
    return final_forecast
