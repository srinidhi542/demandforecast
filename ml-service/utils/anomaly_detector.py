import numpy as np
from scipy import stats

def detect_anomalies(data, threshold=3):
    """
    Detect anomalies using Z-score method
    """
    try:
        if len(data) < 3:
            return []
        
        # Calculate Z-scores
        z_scores = np.abs(stats.zscore(data))
        
        # Find anomalies
        anomaly_indices = np.where(z_scores > threshold)[0]
        
        anomalies = []
        for idx in anomaly_indices:
            anomalies.append({
                'index': int(idx),
                'value': float(data[idx]),
                'z_score': float(z_scores[idx]),
                'severity': 'high' if z_scores[idx] > 4 else 'medium'
            })
        
        return anomalies
    except Exception as e:
        print(f"Anomaly detection error: {e}")
        return []

def detect_anomalies_iqr(data):
    """
    Detect anomalies using IQR method
    """
    try:
        Q1 = np.percentile(data, 25)
        Q3 = np.percentile(data, 75)
        IQR = Q3 - Q1
        
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        anomaly_indices = np.where((data < lower_bound) | (data > upper_bound))[0]
        
        anomalies = []
        for idx in anomaly_indices:
            anomalies.append({
                'index': int(idx),
                'value': float(data[idx]),
                'method': 'IQR',
                'bounds': {'lower': float(lower_bound), 'upper': float(upper_bound)}
            })
        
        return anomalies
    except Exception as e:
        print(f"IQR anomaly detection error: {e}")
        return []
