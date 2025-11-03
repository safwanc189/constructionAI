"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

// ✅ Base URL for FastAPI Backend
const FASTAPI_URL = "http://localhost:8000";

export default function PanoramaComparisonPage({
  params,
}: {
  params: { id: string };
}) {
  // ✅ Next.js 15 Migration fix → params is a Promise
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    async function unwrapParams() {
      const resolved = await params; // Await the Promise
      setId(resolved.id); // Store ID value
    }
    unwrapParams();
  }, [params]);

  // ✅ Store API result image URLs
  const [imgA, setImgA] = useState<string | null>(null);
  const [imgB, setImgB] = useState<string | null>(null);

  // ✅ Loading status
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return; // Wait until ID is fully resolved

    // ID format: "tourA_tourB"
    const [tourA, tourB] = id.split("_");
    console.log("🔍 Fetching AI comparison result →", tourA, tourB);

    // ✅ API call → detect objects using YOLO in backend
    fetch(`${FASTAPI_URL}/compare-tours-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourA, tourB }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ AI Compare Response:", data);

        // ✅ Construct proper URL for backend static file
        setImgA(`${FASTAPI_URL}${data.tourA_image}`);
        setImgB(`${FASTAPI_URL}${data.tourB_image}`);
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Fetch error:", err);
        setLoading(false);
      });
  }, [id]);

  // ✅ Loading UI
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  // ✅ Final UI
  return (
    <div className="w-full min-h-screen bg-black flex flex-col items-center p-4">
      <h1 className="text-white text-2xl font-semibold mb-3">
        🤖 AI Object Detection Comparison
      </h1>

      <p className="text-gray-300 text-sm mb-6">
        Visualizing detected objects between two construction tours
      </p>

      {/* ✅ Display detected panoramas */}
      <div className="flex flex-wrap gap-6 justify-center">
        {imgA && (
          <div className="flex flex-col items-center">
            <p className="text-white font-medium mb-2">Before</p>
            <img
              src={imgA}
              alt="Tour A Detection"
              className="max-w-[45vw] max-h-[70vh] object-contain rounded-md shadow-md"
            />
          </div>
        )}

        {imgB && (
          <div className="flex flex-col items-center">
            <p className="text-white font-medium mb-2">After</p>
            <img
              src={imgB}
              alt="Tour B Detection"
              className="max-w-[45vw] max-h-[70vh] object-contain rounded-md shadow-md"
            />
          </div>
        )}
      </div>

      {/* ✅ Visual reference */}
      <p className="text-gray-500 text-xs mt-4">Compare ID: {id}</p>
    </div>
  );
}
