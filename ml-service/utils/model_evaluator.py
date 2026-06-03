from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import numpy as np

def calculate_metrics(y_true, y_pred):
    """
    Calculate evaluation metrics
    """
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)
    
    # MAPE (Mean Absolute Percentage Error)
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-10))) * 100
    
    return {
        'rmse': float(rmse),
        'mae': float(mae),
        'r2': float(r2),
        'mape': float(mape)
    }

def select_best_model(models, y_test):
    """
    Evaluate all models and select the best one based on RMSE
    """
    best_model_name = None
    best_rmse = float('inf')
    best_accuracy = None
    
    for model_name, model_data in models.items():
        predictions = model_data['predictions']
        
        # Ensure same length
        min_len = min(len(y_test), len(predictions))
        y_test_subset = y_test[:min_len]
        predictions_subset = predictions[:min_len]
        
        metrics = calculate_metrics(y_test_subset, predictions_subset)
        
        if metrics['rmse'] < best_rmse:
            best_rmse = metrics['rmse']
            best_model_name = model_name
            best_accuracy = metrics
    
    return best_model_name, best_accuracy

def evaluate_models(models, y_test):
    """
    Evaluate all models and return comparison
    """
    results = {}
    
    for model_name, model_data in models.items():
        predictions = model_data['predictions']
        
        min_len = min(len(y_test), len(predictions))
        y_test_subset = y_test[:min_len]
        predictions_subset = predictions[:min_len]
        
        metrics = calculate_metrics(y_test_subset, predictions_subset)
        results[model_name] = metrics
    
    return results
