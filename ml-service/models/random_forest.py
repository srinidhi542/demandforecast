from sklearn.ensemble import RandomForestRegressor
import numpy as np

def train_random_forest(X_train, y_train):
    """
    Train Random Forest model
    """
    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)
    return model

def predict_random_forest(model, X):
    """
    Make predictions using Random Forest
    """
    predictions = model.predict(X)
    return predictions
