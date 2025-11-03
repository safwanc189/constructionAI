"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const FASTAPI_URL = "http://localhost:8000";

export default function PanoramaComparisonPage({
  params,
}: {
  params: { id: string };
}) {
  const [id, setId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"yolo" | "segmentation">("yolo");

  const [yoloA, setYoloA] = useState<string | null>(null);
  const [yoloB, setYoloB] = useState<string | null>(null);
  const [segA, setSegA] = useState<string | null>(null);
  const [segB, setSegB] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function unwrapParams() {
      const resolved = await params;
      setId(resolved.id);
    }
    unwrapParams();
  }, [params]);

  useEffect(() => {
    if (!id) return;

    const [tourA, tourB] = id.split("_");
    console.log("🔍 Fetching comparison results", tourA, tourB);

    setLoading(true);

    fetch(`${FASTAPI_URL}/compare-tours-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourA, tourB }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ API Response:", data);

        setYoloA(`${FASTAPI_URL}${data.yolo.tourA}`);
        setYoloB(`${FASTAPI_URL}${data.yolo.tourB}`);

        setSegA(`${FASTAPI_URL}${data.segmentation.tourA}`);
        setSegB(`${FASTAPI_URL}${data.segmentation.tourB}`);

        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Fetch error:", err);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  const beforeImg = viewMode === "yolo" ? yoloA : segA;
  const afterImg = viewMode === "yolo" ? yoloB : segB;

  return (
    <div className="w-full min-h-screen bg-black flex flex-col items-center p-4">
      <h1 className="text-white text-2xl font-semibold mb-3">
        🏗️ Panorama Comparison
      </h1>

      {/* ✅ Toggle Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setViewMode("yolo")}
          className={`px-4 py-2 rounded-md font-semibold text-sm ${
            viewMode === "yolo"
              ? "bg-blue-500 text-white"
              : "bg-gray-800 text-gray-300"
          }`}
        >
          YOLO Detection
        </button>

        <button
          onClick={() => setViewMode("segmentation")}
          className={`px-4 py-2 rounded-md font-semibold text-sm ${
            viewMode === "segmentation"
              ? "bg-green-500 text-white"
              : "bg-gray-800 text-gray-300"
          }`}
        >
          Segmentation
        </button>
      </div>

      {/* ✅ Show selected AI result */}
      <div className="flex flex-wrap gap-6 justify-center">
        {beforeImg && (
          <div className="flex flex-col items-center">
            <p className="text-white font-medium mb-2">Before</p>
            <img
              src={beforeImg}
              alt="Tour A View"
              className="max-w-[45vw] max-h-[70vh] object-contain rounded-md shadow-md"
            />
          </div>
        )}

        {afterImg && (
          <div className="flex flex-col items-center">
            <p className="text-white font-medium mb-2">After</p>
            <img
              src={afterImg}
              alt="Tour B View"
              className="max-w-[45vw] max-h-[70vh] object-contain rounded-md shadow-md"
            />
          </div>
        )}
      </div>

      <p className="text-gray-500 text-xs mt-4">Compare ID: {id}</p>
    </div>
  );
}
