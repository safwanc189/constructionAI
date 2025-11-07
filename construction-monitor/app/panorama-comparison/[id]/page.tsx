"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

// 🌍 Backend URL
const FASTAPI_URL = "http://localhost:8000";

// 📄 Handle PDF Download
const downloadPDFReport = async (id: string | null) => {
  if (!id) return;
  const [tourA, tourB] = id.split("_");

  try {
    const response = await fetch(`${FASTAPI_URL}/generate-pdf-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourA, tourB }),
    });

    if (!response.ok) {
      alert("❌ Failed to generate PDF report");
      return;
    }

    // ✅ Convert to blob and trigger browser download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ConstructionAI_Report_${tourA}_vs_${tourB}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("❌ PDF Download Error:", err);
    alert("PDF download failed. Please check the backend.");
  }
};

// ✅ Type definitions for report
interface ChangeReport {
  before: Record<string, number>;
  after: Record<string, number>;
  added: Record<string, number>;
  removed: Record<string, number>;
}

export default function PanoramaComparisonPage({
  params,
}: {
  params: { id: string };
}) {
  // 🌐 Extract comparison ID from URL
  const [id, setId] = useState<string | null>(null);

  // 🎛️ Mode selector
  const [viewMode, setViewMode] = useState<
    "yolo" | "segmentation" | "combined" | "custom_yolo"
  >("yolo");

  // 🖼️ Image states for each view type
  const [yoloA, setYoloA] = useState<string | null>(null);
  const [yoloB, setYoloB] = useState<string | null>(null);
  const [segA, setSegA] = useState<string | null>(null);
  const [segB, setSegB] = useState<string | null>(null);
  const [combinedA, setCombinedA] = useState<string | null>(null);
  const [combinedB, setCombinedB] = useState<string | null>(null);
  const [customBefore, setCustomBefore] = useState<string | null>(null);
  const [customAfter, setCustomAfter] = useState<string | null>(null);
  const [customReport, setCustomReport] = useState<ChangeReport | null>(null);

  const [loading, setLoading] = useState(true);

  // 🧩 Load tour IDs from URL
  useEffect(() => {
    async function unwrapParams() {
      const resolved = await params;
      setId(resolved.id);
    }
    unwrapParams();
  }, [params]);

  // 🔍 Fetch comparison results from FastAPI
  useEffect(() => {
    if (!id) return;

    const [tourA, tourB] = id.split("_");
    console.log("🔍 Fetching comparison results for:", tourA, tourB);
    setLoading(true);

    fetch(`${FASTAPI_URL}/compare-tours-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourA, tourB }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ API Response:", data);

        // YOLO Segmentation
        setYoloA(`${FASTAPI_URL}${data.yolo.tourA}`);
        setYoloB(`${FASTAPI_URL}${data.yolo.tourB}`);

        // SegFormer
        setSegA(`${FASTAPI_URL}${data.segmentation.tourA}`);
        setSegB(`${FASTAPI_URL}${data.segmentation.tourB}`);

        // Combined (YOLO + SegFormer)
        setCombinedA(`${FASTAPI_URL}${data.combined.tourA}`);
        setCombinedB(`${FASTAPI_URL}${data.combined.tourB}`);

        // 🧠 Custom YOLO model results
        if (data.custom_yolo) {
          setCustomBefore(`${FASTAPI_URL}${data.custom_yolo.before_image}`);
          setCustomAfter(`${FASTAPI_URL}${data.custom_yolo.after_image}`);
          setCustomReport(data.custom_yolo.report);
        }

        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Fetch error:", err);
        setLoading(false);
      });
  }, [id]);

  // 🕒 Loading spinner
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  // 🧠 Dynamically choose which image set to show
  const beforeImg =
    viewMode === "yolo"
      ? yoloA
      : viewMode === "segmentation"
        ? segA
        : viewMode === "combined"
          ? combinedA
          : customBefore;

  const afterImg =
    viewMode === "yolo"
      ? yoloB
      : viewMode === "segmentation"
        ? segB
        : viewMode === "combined"
          ? combinedB
          : customAfter;

  // 🧾 Helper: render report as readable blocks
  const renderReport = (report: ChangeReport) => (
    <div className="mt-10 bg-gray-900 text-white p-5 rounded-xl w-[90%] max-w-2xl shadow-lg">
      <h2 className="text-xl font-bold text-orange-400 mb-4">
        📊 Change Detection Report
      </h2>

      {/* ✅ Added objects */}
      {Object.keys(report.added || {}).length > 0 && (
        <div className="mb-3">
          <p className="text-green-400 font-semibold mb-1">✅ Added:</p>
          <ul className="list-disc list-inside text-gray-200">
            {(Object.entries(report.added) as [string, number][]).map(
              ([cls, count]) => (
                <li key={cls}>
                  <span className="font-medium text-white">{cls}</span>: +{count}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {/* ❌ Removed objects */}
      {Object.keys(report.removed || {}).length > 0 && (
        <div className="mb-3">
          <p className="text-red-400 font-semibold mb-1">❌ Removed:</p>
          <ul className="list-disc list-inside text-gray-200">
            {(Object.entries(report.removed) as [string, number][]).map(
              ([cls, count]) => (
                <li key={cls}>
                  <span className="font-medium text-white">{cls}</span>: −{count}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {/* 📋 Summary of before and after */}
      <div className="border-t border-gray-700 pt-3 mt-3">
        <p className="text-gray-400 mb-1">
          🪑 <span className="font-semibold">Before</span>:{" "}
          {Object.entries(report.before || {})
            .map(([k, v]) => `${k} = ${v}`)
            .join(", ")}
        </p>
        <p className="text-gray-400">
          🏗 <span className="font-semibold">After</span>:{" "}
          {Object.entries(report.after || {})
            .map(([k, v]) => `${k} = ${v}`)
            .join(", ")}
        </p>
      </div>
    </div>
  );

  // 🖼️ Render UI
  return (
    <div className="w-full min-h-screen bg-black flex flex-col items-center p-4">
      {/* 🏗️ Header */}
      <h1 className="text-white text-2xl font-semibold mb-3">
        🏗️ Panorama Comparison
      </h1>

      {/* 🔘 Toggle buttons */}
      <div className="flex flex-wrap justify-center gap-4 mb-6">
        {[
          { mode: "yolo", label: "YOLO Detection", color: "bg-blue-500" },
          { mode: "segmentation", label: "Segmentation", color: "bg-green-500" },
          { mode: "combined", label: "YOLO + SegFormer", color: "bg-purple-500" },
          { mode: "custom_yolo", label: "Own Model (best.pt)", color: "bg-orange-500" },
        ].map((btn) => (
          <button
            key={btn.mode}
            onClick={() => setViewMode(btn.mode as typeof viewMode)}
            className={`px-4 py-2 rounded-md font-semibold text-sm ${viewMode === btn.mode
              ? `${btn.color} text-white`
              : "bg-gray-800 text-gray-300"
              }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* 🖼️ Before/After Images */}
      <div className="flex flex-wrap gap-6 justify-center">
        {beforeImg && (
          <div className="flex flex-col items-center">
            <p className="text-white font-medium mb-2">Before</p>
            <img
              src={beforeImg}
              alt="Before"
              className="max-w-[45vw] max-h-[70vh] object-contain rounded-md shadow-md"
            />
          </div>
        )}

        {afterImg && (
          <div className="flex flex-col items-center">
            <p className="text-white font-medium mb-2">After</p>
            <img
              src={afterImg}
              alt="After"
              className="max-w-[45vw] max-h-[70vh] object-contain rounded-md shadow-md"
            />
          </div>
        )}
      </div>

      {/* 🧾 Custom YOLO Report */}
      {viewMode === "custom_yolo" && customReport && (
        <div className="flex flex-col items-center">
          {renderReport(customReport)}

          {/* 📄 Download Report Button */}
          <button
            onClick={() => downloadPDFReport(id)}
            className="mt-5 px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow-md transition"
          >
            📄 Download Full PDF Report
          </button>
        </div>
      )}

      {/* Footer */}
      <p className="text-gray-500 text-xs mt-6">Compare ID: {id}</p>
    </div>
  );
}
