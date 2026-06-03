from sklearn.linear_model import LinearRegression
import numpy as np

def train_linear_regression(X_train, y_train):
    """
    Train Linear Regression model
    """
    model = LinearRegression()
    model.fit(X_train, y_train)
    return model

def predict_linear_regression(model, X):
    """
    Make predictions using Linear Regression
    """
    predictions = model.predict(X)
    return predictions
