
from pathlib import Path

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BASE_DIR / "ml_models"
MODEL_PATH = MODEL_DIR / "attrition_model.joblib"

TARGET_COLUMN = "Attrition"

NUMERIC_FEATURES = [
    "Age",
    "MonthlyIncome",
    "YearsAtCompany",
]

CATEGORICAL_FEATURES = [
    "Department",
    "JobRole",
]

FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES
MODEL_VERSION = "1.1.0"


def train_attrition_model(csv_path: str) -> dict:
    """Validate data, train a model, and report evaluation metrics."""

    file_path = Path(csv_path)

    if not file_path.is_file():
        raise ValueError("The uploaded dataset file could not be found.")

    try:
        df = pd.read_csv(file_path)
    except (pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise ValueError("The CSV file could not be parsed.") from exc

    if df.empty:
        raise ValueError("The dataset contains no rows.")

    original_rows = len(df)

    required_columns = FEATURE_COLUMNS + [TARGET_COLUMN]
    missing_columns = [
        column for column in required_columns if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Missing required columns: " + ", ".join(missing_columns)
        )

    # Use only the columns needed for this model.
    df = df[required_columns].copy()

    # Remove exact duplicate records before splitting.
    duplicate_rows = int(df.duplicated().sum())
    df = df.drop_duplicates().copy()

    # Normalize the target and count invalid labels.
    normalized_target = (
        df[TARGET_COLUMN]
        .astype("string")
        .str.strip()
        .str.lower()
    )

    valid_labels = normalized_target.isin(["yes", "no"])
    invalid_target_rows = int((~valid_labels).sum())

    df = df.loc[valid_labels].copy()
    df[TARGET_COLUMN] = (
        normalized_target.loc[valid_labels]
        .map({"yes": "Yes", "no": "No"})
    )

    # Convert numeric fields. Invalid or blank values become missing
    # and are imputed inside the training pipeline.
    for column in NUMERIC_FEATURES:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    # Normalize blank categorical values to missing.
    for column in CATEGORICAL_FEATURES:
        df[column] = df[column].replace(r"^\s*$", pd.NA, regex=True)

    if df.empty or df[TARGET_COLUMN].nunique() != 2:
        raise ValueError(
            "Training requires valid examples of both Attrition=Yes "
            "and Attrition=No."
        )

    class_counts = df[TARGET_COLUMN].value_counts()

    if len(df) < 10 or class_counts.min() < 2:
        raise ValueError(
            "The dataset is too small for a stratified evaluation split. "
            "Provide at least 10 valid unique rows and at least two "
            "examples of each attrition class."
        )

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )

    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=200,
                    random_state=42,
                    class_weight="balanced",
                ),
            ),
        ]
    )

    # Fit preprocessing only on training data to reduce data leakage.
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        labels=["Yes", "No"],
        average="binary",
        pos_label="Yes",
        zero_division=0,
    )

    matrix = confusion_matrix(
        y_test,
        predictions,
        labels=["Yes", "No"],
    )

    report = classification_report(
        y_test,
        predictions,
        labels=["Yes", "No"],
        output_dict=True,
        zero_division=0,
    )

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(
        {
            "model": model,
            "features": FEATURE_COLUMNS,
            "version": MODEL_VERSION,
        },
        MODEL_PATH,
    )

    return {
        "message": "Attrition model trained successfully.",
        "model_version": MODEL_VERSION,
        "dataset_quality": {
            "original_rows": original_rows,
            "duplicate_rows_removed": duplicate_rows,
            "invalid_target_rows_removed": invalid_target_rows,
            "valid_unique_rows": int(len(df)),
        },
        "training_rows": int(len(X_train)),
        "testing_rows": int(len(X_test)),
        "metrics": {
            "accuracy": round(float(accuracy), 4),
            "attrition_precision": round(float(precision), 4),
            "attrition_recall": round(float(recall), 4),
            "attrition_f1_score": round(float(f1), 4),
        },
        "confusion_matrix": {
            "labels": ["Yes", "No"],
            "matrix": matrix.tolist(),
        },
        "classification_report": {
            label: {
                metric: round(float(value), 4)
                for metric, value in scores.items()
            }
            for label, scores in report.items()
            if isinstance(scores, dict)
        },
    }


def load_attrition_model():
    """Load the most recently saved model artifact."""

    if not MODEL_PATH.is_file():
        raise ValueError(
            "No trained attrition model exists yet. Train a model first."
        )

    artifact = joblib.load(MODEL_PATH)
    return artifact["model"], artifact["version"]


def predict_attrition(features: dict) -> dict:
    """Predict attrition and estimate the positive-class probability."""

    model, version = load_attrition_model()

    missing_features = [
        column for column in FEATURE_COLUMNS if column not in features
    ]

    if missing_features:
        raise ValueError(
            "Missing required features: " + ", ".join(missing_features)
        )

    input_df = pd.DataFrame(
        [{column: features[column] for column in FEATURE_COLUMNS}]
    )

    for column in NUMERIC_FEATURES:
        input_df[column] = pd.to_numeric(
            input_df[column], errors="coerce"
        )

        if input_df[column].isna().any():
            raise ValueError(f"{column} must be a valid number.")

    for column in CATEGORICAL_FEATURES:
        value = input_df.at[0, column]
        if pd.isna(value) or not str(value).strip():
            raise ValueError(f"{column} must not be empty.")

    prediction = str(model.predict(input_df)[0])
    probabilities = model.predict_proba(input_df)[0]
    classes = list(model.named_steps["classifier"].classes_)
    probability_map = dict(zip(classes, probabilities))

    risk_probability = float(probability_map.get("Yes", 0.0))

    if risk_probability >= 0.70:
        risk_level = "HIGH"
    elif risk_probability >= 0.40:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "predicted_attrition": prediction,
        "risk_probability": round(risk_probability, 5),
        "risk_level": risk_level,
        "model_version": version,
    }

def get_feature_importance():
    """Return feature importance from the currently trained Random Forest model."""
    import joblib
    import pandas as pd

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            "No trained model found. Train the attrition model first."
        )

    artifact = joblib.load(MODEL_PATH)
    model = artifact.get("model")

    if model is None:
        raise ValueError("The saved model artifact is invalid.")

    try:
        preprocessor = model.named_steps["preprocessor"]
        classifier = model.named_steps["classifier"]

        feature_names = preprocessor.get_feature_names_out()
        importances = classifier.feature_importances_

    except (AttributeError, KeyError) as exc:
        raise ValueError(
            "The trained model does not support feature importance."
        ) from exc

    if len(feature_names) != len(importances):
        raise ValueError("Feature importance data is inconsistent.")

    results = pd.DataFrame(
        {
            "feature": [
                str(name)
                .replace("num__", "")
                .replace("cat__", "")
                .replace("remainder__", "")
                for name in feature_names
            ],
            "importance": importances,
        }
    )

    results = results.sort_values(
        "importance", ascending=False
    ).head(20)

    return {
        "model_version": artifact.get("version", "unknown"),
        "features": [
            {
                "feature": row["feature"],
                "importance": round(float(row["importance"]), 6),
                "importance_percent": round(
                    float(row["importance"]) * 100, 2
                ),
            }
            for _, row in results.iterrows()
        ],
    }
