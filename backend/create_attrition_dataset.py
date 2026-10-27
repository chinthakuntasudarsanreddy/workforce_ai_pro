
import pandas as pd
from pathlib import Path

rows = [
    [24, "Sales", "Sales Representative", 28000, 1, "Yes"],
    [26, "Sales", "Sales Executive", 32000, 2, "Yes"],
    [29, "HR", "HR Assistant", 35000, 3, "Yes"],
    [31, "Research", "Research Scientist", 48000, 4, "Yes"],
    [27, "Technology", "Developer", 52000, 2, "Yes"],
    [35, "Sales", "Sales Executive", 45000, 5, "No"],
    [41, "Research", "Research Scientist", 65000, 8, "No"],
    [38, "HR", "HR Manager", 72000, 9, "No"],
    [32, "Technology", "Developer", 68000, 6, "No"],
    [45, "Research", "Research Scientist", 85000, 12, "No"],
    [28, "Sales", "Sales Executive", 42000, 4, "No"],
    [39, "Technology", "Developer", 78000, 10, "No"],
    [25, "HR", "HR Assistant", 30000, 1, "Yes"],
    [43, "Sales", "Sales Manager", 90000, 15, "No"],
    [30, "Technology", "Developer", 60000, 5, "No"],
    [33, "Research", "Research Scientist", 55000, 7, "No"],
    [26, "Sales", "Sales Representative", 29000, 1, "Yes"],
    [37, "HR", "HR Manager", 75000, 11, "No"],
    [29, "Technology", "Developer", 50000, 3, "Yes"],
    [40, "Research", "Research Scientist", 80000, 13, "No"],
    [31, "Sales", "Sales Executive", 38000, 2, "Yes"],
    [36, "Technology", "Developer", 70000, 8, "No"],
    [28, "HR", "HR Assistant", 34000, 2, "Yes"],
    [42, "Sales", "Sales Manager", 88000, 14, "No"],
    [34, "Research", "Research Scientist", 62000, 6, "No"],
    [27, "Technology", "Developer", 45000, 2, "Yes"],
    [44, "HR", "HR Manager", 82000, 12, "No"],
    [32, "Sales", "Sales Executive", 46000, 4, "No"],
    [25, "Research", "Research Scientist", 40000, 1, "Yes"],
    [39, "Technology", "Developer", 76000, 9, "No"],
]

columns = [
    "Age",
    "Department",
    "JobRole",
    "MonthlyIncome",
    "YearsAtCompany",
    "Attrition",
]

output = Path(__file__).resolve().parent / "attrition_training.csv"
pd.DataFrame(rows, columns=columns).to_csv(output, index=False)

print(f"Created: {output}")
print(f"Total rows: {len(rows)}")
print(pd.DataFrame(rows, columns=columns)["Attrition"].value_counts())

