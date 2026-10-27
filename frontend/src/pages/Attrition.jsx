import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Award,
  Brain,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../services/api";

const COLORS = {
  High: "#ef4444",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

function getErrorMessage(error) {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color = "blue" }) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          {subtitle && (
            <p className="mt-2 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        <div
          className={`rounded-xl p-3 ${
            colorClasses[color] || colorClasses.blue
          }`}
        >
          {Icon && <Icon size={22} />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, icon: Icon, children, action }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
              <Icon size={20} />
            </div>
          )}
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RiskBadge({ level }) {
  const normalized = String(level || "UNKNOWN").toUpperCase();
  const classes = {
    HIGH: "bg-red-100 text-red-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    LOW: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        classes[normalized] || "bg-slate-100 text-slate-600"
      }`}
    >
      {normalized}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function DepartmentInsights({ analytics }) {
  // The analytics API returns these values nested under attrition.
  const departments =
    analytics?.attrition?.department_insights ??
    analytics?.departments ??
    analytics?.department_insights ??
    analytics?.department_breakdown ??
    [];

  if (!Array.isArray(departments) || departments.length === 0) {
    return (
      <EmptyState message="No department-level attrition predictions are available yet." />
    );
  }

  const chartData = departments.map((item) => ({
    department: item.department ?? item.name ?? "Unknown",
    predictions:
      item.predicted_attrition_count ??
      item.prediction_count ??
      item.count ??
      0,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -20, bottom: 35 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="department"
            angle={-25}
            textAnchor="end"
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar
            dataKey="predictions"
            name="Predicted to leave"
            fill="#6366f1"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FeatureImportance({ data, modelVersion }) {
  const features = Array.isArray(data?.features) ? data.features : [];

  return (
    <Section
      title="Feature Importance Analysis"
      subtitle="Factors contributing most to the trained model's predictions"
      icon={Award}
      action={
        modelVersion ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Model {modelVersion}
          </span>
        ) : null
      }
    >
      {features.length === 0 ? (
        <EmptyState message="No feature importance data loaded. Train a model first, then select Load Importance." />
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={features}
              layout="vertical"
              margin={{ top: 5, right: 24, left: 12, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="feature"
                width={150}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [
                  `${Number(value).toFixed(2)}%`,
                  "Importance",
                ]}
              />
              <Bar
                dataKey="importance_percent"
                name="Importance"
                fill="#6366f1"
                radius={[0, 5, 5, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

function ModelEvaluation({ result }) {
  if (!result) {
    return (
      <EmptyState message="Train a model to view evaluation metrics and dataset quality." />
    );
  }

  const metrics = result.metrics || result.evaluation || {};
  const quality = result.dataset_quality || {};
  const metricEntries = [
    ["Accuracy", metrics.accuracy],
    ["Precision", metrics.precision],
    ["Recall", metrics.recall],
    ["F1 Score", metrics.f1_score ?? metrics.f1],
  ].filter(([, value]) => value !== undefined && value !== null);

  const formatMetric = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return `${(number <= 1 ? number * 100 : number).toFixed(1)}%`;
  };

  return (
    <div className="space-y-4">
      {metricEntries.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metricEntries.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatMetric(value)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          The training response did not include evaluation metrics.
        </p>
      )}

      {Object.keys(quality).length > 0 && (
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-2 font-medium text-slate-800">Dataset Quality</h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {Object.entries(quality).map(([key, value]) => (
              <div key={key}>
                <p className="text-slate-500">
                  {key.replaceAll("_", " ")}
                </p>
                <p className="font-semibold text-slate-800">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.message && (
        <p className="text-sm text-slate-600">{result.message}</p>
      )}
    </div>
  );
}

export default function Attrition() {
  const [history, setHistory] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedDataset, setSelectedDataset] = useState("");
  const [training, setTraining] = useState(false);
  const [trainingResult, setTrainingResult] = useState(null);

  const [featureImportance, setFeatureImportance] = useState(null);
  const [loadingImportance, setLoadingImportance] = useState(false);
  const [importanceError, setImportanceError] = useState("");

  const [predicting, setPredicting] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [predictionResult, setPredictionResult] = useState(null);

  const loadPageData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");

    const requests = await Promise.allSettled([
      api.get("/api/attrition/history"),
      api.get("/api/datasets/"),
      api.get("/api/analytics/overview"),
    ]);

    const errors = [];

    if (requests[0].status === "fulfilled") {
      const data = requests[0].value.data;
      setHistory(
        Array.isArray(data)
          ? data
          : data?.items ?? data?.predictions ?? data?.history ?? []
      );
    } else {
      errors.push(`Prediction history: ${getErrorMessage(requests[0].reason)}`);
    }

    if (requests[1].status === "fulfilled") {
      const data = requests[1].value.data;
      const list = Array.isArray(data)
        ? data
        : data?.items ?? data?.datasets ?? [];
      setDatasets(list);

      setSelectedDataset((previous) => {
        if (previous && list.some((item) => String(item.id) === previous)) {
          return previous;
        }
        const available = list.find((item) =>
          ["TRAINED", "VALIDATED", "READY", "UPLOADED"].includes(
            String(item.status || "").toUpperCase()
          )
        );
        return available ? String(available.id) : list[0] ? String(list[0].id) : "";
      });
    } else {
      errors.push(`Datasets: ${getErrorMessage(requests[1].reason)}`);
    }

    if (requests[2].status === "fulfilled") {
      setAnalytics(requests[2].value.data);
    } else {
      errors.push(`Workforce analytics: ${getErrorMessage(requests[2].reason)}`);
    }

    if (errors.length === 3) setError(errors.join(" | "));
    else if (errors.length > 0) setNotice(errors.join(" | "));

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const predictions = useMemo(
    () => (Array.isArray(history) ? history : []),
    [history]
  );

  const totalEmployees =
    analytics?.workforce?.total_employees ??
    analytics?.total_employees ??
    analytics?.employee_count ??
    analytics?.totalEmployees ??
    0;

  const totalPredictions =
    analytics?.attrition?.total_predictions ??
    predictions.length;

  const highRiskCount = predictions.filter(
    (item) => String(item.risk_level || "").toUpperCase() === "HIGH"
  ).length;

  const averageRisk = predictions.length
    ? predictions.reduce(
        (sum, item) =>
          sum + Number(item.risk_probability ?? item.probability ?? 0),
        0
      ) / predictions.length
    : 0;

  const riskCounts = useMemo(() => {
    const source = analytics?.attrition?.risk_distribution;

    if (source && typeof source === "object") {
      return {
        High: Number(source.HIGH ?? source.High ?? source.high ?? 0),
        Medium: Number(source.MEDIUM ?? source.Medium ?? source.medium ?? 0),
        Low: Number(source.LOW ?? source.Low ?? source.low ?? 0),
      };
    }

    return predictions.reduce(
      (counts, item) => {
        const level = String(item.risk_level || "").toUpperCase();
        if (level === "HIGH") counts.High += 1;
        if (level === "MEDIUM") counts.Medium += 1;
        if (level === "LOW") counts.Low += 1;
        return counts;
      },
      { High: 0, Medium: 0, Low: 0 }
    );
  }, [analytics, predictions]);

  const riskChartData = [
    { name: "High", value: riskCounts.High, fill: COLORS.High },
    { name: "Medium", value: riskCounts.Medium, fill: COLORS.Medium },
    { name: "Low", value: riskCounts.Low, fill: COLORS.Low },
  ];

  async function handleTrainModel(event) {
    event.preventDefault();
    setTraining(true);
    setError("");
    setNotice("");
    setTrainingResult(null);

    try {
      if (!selectedDataset) {
        throw new Error("Select a dataset before training the model.");
      }

      const response = await api.post(
        `/api/attrition/train?dataset_id=${encodeURIComponent(selectedDataset)}`
      );

      setTrainingResult(response.data);
      setFeatureImportance(null);
      setNotice("Model training request completed.");
      await loadPageData(false);
    } catch (err) {
      setError(`Model training failed: ${getErrorMessage(err)}`);
    } finally {
      setTraining(false);
    }
  }

  async function handleLoadImportance() {
    setLoadingImportance(true);
    setImportanceError("");

    try {
      const response = await api.get("/api/attrition/feature-importance");
      setFeatureImportance(response.data);
    } catch (err) {
      setImportanceError(getErrorMessage(err));
    } finally {
      setLoadingImportance(false);
    }
  }

  async function handlePredict(event) {
    event.preventDefault();
    setPredicting(true);
    setError("");
    setPredictionResult(null);

    try {
      const payload = {};
      if (employeeId.trim()) {
        const parsedId = Number(employeeId);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
          throw new Error("Employee ID must be a positive whole number.");
        }
        payload.employee_id = parsedId;
      }

      const response = await api.post("/api/attrition/predict", payload);
      setPredictionResult(response.data);
      setNotice("Prediction completed successfully.");
      await loadPageData(false);
    } catch (err) {
      setError(`Prediction failed: ${getErrorMessage(err)}`);
    } finally {
      setPredicting(false);
    }
  }

  const getProbabilityPercent = (item) => {
    const value = Number(
      item?.risk_probability ??
        item?.probability ??
        item?.attrition_probability ??
        0
    );
    return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
  };

  const getPredictionLabel = (item) =>
    item?.predicted_attrition ??
    item?.prediction ??
    item?.predicted_label ??
    "—";

  const getPredictionId = (item) => item?.id ?? item?.prediction_id ?? "—";

  const formatDate = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
              <Brain size={25} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              AI Attrition Intelligence
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Predict employee attrition, monitor workforce risk, and understand
            the factors that influence model predictions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            loadPageData(false);
          }}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {notice && !error && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
          <p>{notice}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-slate-500">
          <Loader2 size={22} className="animate-spin" />
          Loading attrition analytics...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total Employees"
              value={totalEmployees}
              subtitle="From workforce analytics"
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Predictions Saved"
              value={totalPredictions}
              subtitle="All recorded predictions"
              icon={Activity}
              color="purple"
            />
            <StatCard
              title="High-Risk Predictions"
              value={highRiskCount}
              subtitle="Predictions marked HIGH"
              icon={ShieldAlert}
              color="orange"
            />
            <StatCard
              title="Average Risk Probability"
              value={`${averageRisk.toFixed(1)}%`}
              subtitle="Across displayed prediction history"
              icon={TrendingUp}
              color="green"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section
              title="Risk Distribution"
              subtitle="Predictions grouped by risk level"
              icon={ShieldAlert}
            >
              {riskCounts.High + riskCounts.Medium + riskCounts.Low === 0 ? (
                <EmptyState message="No risk distribution data is available yet." />
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={riskChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {riskChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {riskChartData.map((item) => (
                      <div
                        key={item.name}
                        className="rounded-xl bg-slate-50 p-3 text-center"
                      >
                        <span
                          className="mx-auto mb-2 block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.fill }}
                        />
                        <p className="text-sm text-slate-500">{item.name}</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Section>

            <Section
              title="Department Insights"
              subtitle="Departments with employees predicted to leave"
              icon={Building2}
            >
              <DepartmentInsights analytics={analytics} />
            </Section>
          </div>

          <Section
            title="Train Attrition Model"
            subtitle="Choose an uploaded dataset to train or retrain the model"
            icon={Brain}
          >
            <form
              onSubmit={handleTrainModel}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <select
                value={selectedDataset}
                onChange={(event) => setSelectedDataset(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">Select a dataset</option>
                {datasets.map((dataset, index) => (
                  <option
                    key={dataset.id ?? `${dataset.name}-${index}`}
                    value={dataset.id}
                  >
                    {dataset.name ??
                      dataset.filename ??
                      `Dataset ${dataset.id}`}{" "}
                    {dataset.status ? `— ${dataset.status}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={training || !selectedDataset}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {training ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Sparkles size={17} />
                )}
                {training ? "Training..." : "Train Model"}
              </button>
            </form>

            {datasets.length === 0 && (
              <p className="mt-3 text-sm text-amber-700">
                No datasets were returned. Upload or register a dataset before
                training.
              </p>
            )}

            {trainingResult && (
              <div className="mt-5 space-y-4 rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-green-800">
                  <CheckCircle2 size={18} />
                  Training response received
                </div>
                <ModelEvaluation result={trainingResult} />
                <button
                  type="button"
                  onClick={handleLoadImportance}
                  disabled={loadingImportance}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-60"
                >
                  {loadingImportance ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Award size={16} />
                  )}
                  Load Importance
                </button>
              </div>
            )}
          </Section>

          <FeatureImportance
            data={featureImportance}
            modelVersion={
              featureImportance?.model_version ??
              trainingResult?.model_version
            }
          />

          {importanceError && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <CircleHelp size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Could not load feature importance</p>
                <p className="mt-1">{importanceError}</p>
                <button
                  type="button"
                  onClick={handleLoadImportance}
                  className="mt-2 font-semibold underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!trainingResult && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleLoadImportance}
                disabled={loadingImportance}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingImportance ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Award size={16} />
                )}
                Load Importance
              </button>
            </div>
          )}

          <Section
            title="Predict Attrition"
            subtitle="Optionally link the prediction to an existing employee"
            icon={Sparkles}
          >
            <form
              onSubmit={handlePredict}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <input
                type="number"
                min="1"
                step="1"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                placeholder="Employee ID (optional)"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="submit"
                disabled={predicting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {predicting ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Activity size={17} />
                )}
                {predicting ? "Predicting..." : "Run Prediction"}
              </button>
            </form>

            <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
              <CircleHelp size={15} className="mt-0.5 shrink-0" />
              The prediction uses the feature values or defaults implemented by
              your backend. Supplying an employee ID links the prediction to
              that employee when supported.
            </p>

            {predictionResult && (
              <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <h3 className="font-semibold text-indigo-950">
                  Prediction Result
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-indigo-700">Prediction</p>
                    <p className="mt-1 font-bold text-indigo-950">
                      {getPredictionLabel(predictionResult)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-indigo-700">Risk Probability</p>
                    <p className="mt-1 font-bold text-indigo-950">
                      {getProbabilityPercent(predictionResult)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-indigo-700">Risk Level</p>
                    <div className="mt-1">
                      <RiskBadge level={predictionResult.risk_level} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Prediction History"
            subtitle="Recently recorded employee attrition predictions"
            icon={Clock}
            action={
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {predictions.length} records
              </span>
            }
          >
            {predictions.length === 0 ? (
              <EmptyState message="No predictions have been recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 font-semibold">ID</th>
                      <th className="px-3 py-3 font-semibold">Employee</th>
                      <th className="px-3 py-3 font-semibold">Attrition</th>
                      <th className="px-3 py-3 font-semibold">Probability</th>
                      <th className="px-3 py-3 font-semibold">Risk</th>
                      <th className="px-3 py-3 font-semibold">Model Version</th>
                      <th className="px-3 py-3 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map((item, index) => (
                      <tr
                        key={item.id ?? `${item.employee_id}-${index}`}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-3 py-4 font-medium text-slate-900">
                          {getPredictionId(item)}
                        </td>
                        <td className="px-3 py-4 text-slate-600">
                          {item.employee_id ?? "—"}
                        </td>
                        <td className="px-3 py-4 text-slate-700">
                          {getPredictionLabel(item)}
                        </td>
                        <td className="px-3 py-4 font-medium text-slate-800">
                          {getProbabilityPercent(item)}
                        </td>
                        <td className="px-3 py-4">
                          <RiskBadge level={item.risk_level} />
                        </td>
                        <td className="px-3 py-4 text-slate-600">
                          {item.model_version ?? "—"}
                        </td>
                        <td className="px-3 py-4 text-slate-500">
                          {formatDate(item.created_at ?? item.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
