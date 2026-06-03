from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import traceback

from models.linear_regression import train_linear_regression, predict_linear_regression
from models.random_forest import train_random_forest, predict_random_forest
from models.arima_model import train_arima, predict_arima
from preprocessing.data_processor import preprocess_data, prepare_features
from utils.model_evaluator import evaluate_models, select_best_model
from utils.seasonal_detector import detect_seasonality
from utils.anomaly_detector import detect_anomalies
from utils.explainability import generate_explanation

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'OK', 'message': 'ML Service is running'})

@app.route('/api/ml/predict', methods=['POST'])
def predict():
    """
    Generate demand forecast using multiple models
    """
    try:
        data = request.json
        historical_data = data.get('historical_data', [])
        forecast_days = data.get('forecast_days', 30)
        model_type = data.get('model', 'auto')
        
        if len(historical_data) < 10:
            return jsonify({'error': 'Insufficient data. At least 10 records required'}), 400
        
        # Convert to DataFrame
        df = pd.DataFrame(historical_data)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        
        # Preprocess data
        df_processed, scaler = preprocess_data(df)
        
        # Prepare features
        X, y = prepare_features(df_processed)
        
        if len(X) < 5:
            return jsonify({'error': 'Insufficient data after preprocessing'}), 400
        
        # Train-test split (80-20)
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]
        
        models = {}
        predictions_dict = {}
        
        # Train models based on selection
        if model_type == 'auto' or model_type == 'linear_regression':
            try:
                lr_model = train_linear_regression(X_train, y_train)
                lr_pred = predict_linear_regression(lr_model, X_test)
                models['linear_regression'] = {'model': lr_model, 'predictions': lr_pred}
            except Exception as e:
                print(f"Linear Regression failed: {str(e)}")
        
        if model_type == 'auto' or model_type == 'random_forest':
            try:
                rf_model = train_random_forest(X_train, y_train)
                rf_pred = predict_random_forest(rf_model, X_test)
                models['random_forest'] = {'model': rf_model, 'predictions': rf_pred}
            except Exception as e:
                print(f"Random Forest failed: {str(e)}")
        
        if model_type == 'auto' or model_type == 'arima':
            try:
                arima_model = train_arima(y_train)
                arima_pred = predict_arima(arima_model, len(y_test))
                models['arima'] = {'model': arima_model, 'predictions': arima_pred}
            except Exception as e:
                print(f"ARIMA failed: {str(e)}")
        
        if not models:
            return jsonify({'error': 'All models failed to train'}), 500
        
        # Evaluate and select best model
        best_model_name, accuracy = select_best_model(models, y_test)
        best_model = models[best_model_name]['model']
        
        # Generate future predictions
        last_date = df['date'].max()
        future_dates = [last_date + timedelta(days=i+1) for i in range(forecast_days)]
        
        # Create future features
        future_df = pd.DataFrame({'date': future_dates})
        future_df['day'] = future_df['date'].dt.day
        future_df['month'] = future_df['date'].dt.month
        future_df['quarter'] = future_df['date'].dt.quarter
        future_df['day_of_week'] = future_df['date'].dt.dayofweek
        
        # We need to compute future rolling_mean_7, lag_7, lag_14 from the last known values
        # Since this can be complex for multi-step forecasts, we will fill with the last known value
        last_qty = df['quantity'].iloc[-1] if not df.empty else 0
        last_7_mean = df['quantity'].tail(7).mean() if len(df) >= 7 else last_qty
        last_lag_7 = df['quantity'].iloc[-7] if len(df) >= 7 else last_qty
        last_lag_14 = df['quantity'].iloc[-14] if len(df) >= 14 else last_qty
        
        future_df['rolling_mean_7'] = last_7_mean
        future_df['lag_7'] = last_lag_7
        future_df['lag_14'] = last_lag_14
        
        # Generate predictions
        if best_model_name == 'arima':
            future_predictions = predict_arima(best_model, forecast_days)
        else:
            X_future = future_df[['day', 'month', 'quarter', 'day_of_week', 'rolling_mean_7', 'lag_7', 'lag_14']].values
            if best_model_name == 'linear_regression':
                future_predictions = predict_linear_regression(best_model, X_future)
            else:
                future_predictions = predict_random_forest(best_model, X_future)
        
        # Ensure non-negative predictions
        future_predictions = np.maximum(future_predictions, 0)
        
        # Calculate confidence intervals (±15%)
        confidence_interval = 0.15
        
        # Detect seasonality and trend
        seasonality = detect_seasonality(df['quantity'].values)
        
        # Detect anomalies
        anomalies = detect_anomalies(df['quantity'].values)
        
        # Prepare response
        predictions = []
        for i, date in enumerate(future_dates):
            pred_value = float(future_predictions[i])
            predictions.append({
                'date': date.strftime('%Y-%m-%d'),
                'predicted_demand': round(pred_value, 2),
                'confidence_min': round(pred_value * (1 - confidence_interval), 2),
                'confidence_max': round(pred_value * (1 + confidence_interval), 2)
            })
        
        # Determine trend
        recent_values = df['quantity'].tail(10).values
        if len(recent_values) >= 2:
            trend_slope = np.polyfit(range(len(recent_values)), recent_values, 1)[0]
            if trend_slope > 0.5:
                trend_direction = 'increasing'
            elif trend_slope < -0.5:
                trend_direction = 'decreasing'
            else:
                trend_direction = 'stable'
        else:
            trend_direction = 'none'
        
        return jsonify({
            'predictions': predictions,
            'best_model': best_model_name,
            'accuracy': accuracy,
            'seasonality': {
                'detected': seasonality['has_seasonality'],
                'strength': seasonality.get('strength', 0)
            },
            'trend': {
                'direction': trend_direction,
                'slope': float(trend_slope) if len(recent_values) >= 2 else 0
            },
            'anomalies': anomalies
        })
        
    except Exception as e:
        print(f"Prediction error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/ml/explain', methods=['POST'])
def explain():
    """
    Generate a demand explanation for a given product forecast.
    Expects JSON:
    {
        "historical_data": [{"date": "YYYY-MM-DD", "quantity": N}, ...],
        "seasonal_multiplier": 1.2,
        "season_name": "Festival Season",
        "has_anomaly": true,
        "anomaly_type": "demand_spike" | "demand_drop" | null,
        "inventory_low": false,
        "inventory_high": false,
        "forecast_value": 145.0
    }
    Returns:
    {
        "explanation": "...",
        "key_factors": [...],
        "direction": "increase" | "decrease" | "stable"
    }
    """
    try:
        data = request.json or {}
        historical_data = data.get('historical_data', [])

        if len(historical_data) < 2:
            return jsonify({'error': 'At least 2 historical records required'}), 400

        df = pd.DataFrame(historical_data)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        quantities = df['quantity'].tolist()

        explanation, key_factors, direction = generate_explanation(
            quantities=quantities,
            seasonal_multiplier=data.get('seasonal_multiplier', 1.0),
            season_name=data.get('season_name', 'Normal Season'),
            has_anomaly=data.get('has_anomaly', False),
            anomaly_type=data.get('anomaly_type', None),
            inventory_low=data.get('inventory_low', False),
            inventory_high=data.get('inventory_high', False),
            forecast_value=data.get('forecast_value', None),
        )

        return jsonify({
            'explanation': explanation,
            'key_factors': key_factors,
            'direction': direction
        })

    except Exception as e:
        print(f'Explain error: {str(e)}')
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print('🤖 ML Service starting...')
    app.run(host='0.0.0.0', port=5001, debug=False)
