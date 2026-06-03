import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler

def preprocess_data(df):
    """
    Preprocess sales data for ML models
    """
    # Handle missing values
    df = df.fillna(method='ffill').fillna(method='bfill')
    
    # Extract date features
    df['day'] = df['date'].dt.day
    df['month'] = df['date'].dt.month
    df['quarter'] = df['date'].dt.quarter
    df['day_of_week'] = df['date'].dt.dayofweek
    df['week_of_year'] = df['date'].dt.isocalendar().week
    
    # Feature Engineering
    df['rolling_mean_7'] = df['quantity'].rolling(window=7, min_periods=1).mean()
    df['lag_7'] = df['quantity'].shift(7).fillna(method='bfill').fillna(0)
    df['lag_14'] = df['quantity'].shift(14).fillna(method='bfill').fillna(0)
    
    # Scale quantity
    scaler = StandardScaler()
    
    return df, scaler

def prepare_features(df):
    """
    Prepare features and target for training
    """
    # Feature columns
    feature_cols = ['day', 'month', 'quarter', 'day_of_week', 'rolling_mean_7', 'lag_7', 'lag_14']
    
    X = df[feature_cols].values
    y = df['quantity'].values
    
    return X, y
