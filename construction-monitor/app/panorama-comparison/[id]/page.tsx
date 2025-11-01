"use client";

import { useState, useEffect, use } from "react";
import { Loader2 } from "lucide-react";

const FASTAPI_URL = "http://localhost:8000";

export default function PanoramaComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    console.log("🖼 Loading comparison result image →", id);

    const fullImageUrl = `${FASTAPI_URL}/compare_results/${id}`;
    setImgUrl(fullImageUrl);
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col items-center p-4">
      {/* ✅ Title */}
      <h1 className="text-white text-2xl font-semibold mb-3">
        🧱 Panorama Comparison Result
      </h1>

      {/* ✅ Extra Info */}
      <p className="text-gray-300 text-sm mb-4">
        Showing changes detected between two tours
      </p>

      {imgUrl ? (
        <>
          {/* ✅ Image */}
          <img
            src={imgUrl}
            alt="Tour Comparison"
            className="max-w-full max-h-[80vh] object-contain rounded-md shadow-lg"
          />

          {/* ✅ Show filename below */}
          <p className="text-gray-400 text-xs mt-2">
            File: {id}
          </p>
        </>
      ) : (
        <span className="text-white text-lg">
          ❌ Comparison image not available
        </span>
      )}
    </div>
  );
}
