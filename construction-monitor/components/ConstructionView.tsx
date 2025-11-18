"use client";

import React, { useEffect, useRef, useState } from "react";

type CapturePoint = {
  id: string;
  stitchedPanoramaUrl: string;
  floorPlanPosition: { x: number; y: number };
};

type DemoTour = {
  floorPlan: {
    id: string;
    imageUrl: string;
    bounds: { width: number; height: number };
  };
  positions: CapturePoint[];
};

export function ConstructionView() {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [demoData, setDemoData] = useState<DemoTour | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<CapturePoint | null>(null);

  // -----------------------------
  // Load demo JSON
  // -----------------------------
  useEffect(() => {
    async function loadDemo() {
      const res = await fetch("/demo/demo-tour.json");
      const json = await res.json();
      setDemoData(json);

      if (json.positions.length > 0) {
        setSelectedPoint(json.positions[0]);
      }
    }
    loadDemo();
  }, []);

  // -----------------------------
  // Load Panolens library
  // -----------------------------
  useEffect(() => {
    if ((window as any).PANOLENS) return;

    const s1 = document.createElement("script");
    s1.src = "https://unpkg.com/three@0.150.0/build/three.min.js";

    const s2 = document.createElement("script");
    s2.src = "https://unpkg.com/panolens@0.12.0/build/panolens.min.js";

    document.body.appendChild(s1);
    s1.onload = () => document.body.appendChild(s2);
  }, []);

  // -----------------------------
  // Initialize viewer
  // -----------------------------
  useEffect(() => {
    const initViewer = () => {
      if (!(window as any).PANOLENS) return;
      if (!containerRef.current) return;
      if (viewerRef.current) return;

      const PANOLENS = (window as any).PANOLENS;

      viewerRef.current = new PANOLENS.Viewer({
        container: containerRef.current,
        autoHideControlBar: false,
      });
    };

    const timer = setInterval(initViewer, 300);
    return () => clearInterval(timer);
  }, []);

  // -----------------------------
  // Load panorama when hotspot clicked
  // -----------------------------
  useEffect(() => {
    if (!selectedPoint) return;
    const url = selectedPoint.stitchedPanoramaUrl;

    const PANOLENS = (window as any).PANOLENS;
    if (!PANOLENS || !viewerRef.current) return;

    const pano = new PANOLENS.ImagePanorama(url);

    try {
      viewerRef.current.clear();
    } catch {}

    viewerRef.current.add(pano);
    viewerRef.current.setPanorama(pano);
  }, [selectedPoint]);

  if (!demoData) return <div>Loading demo...</div>;

  const floor = demoData.floorPlan;

  const toCss = (pt: { x: number; y: number }) => ({
    left: `${(pt.x / floor.bounds.width) * 100}%`,
    top: `${(pt.y / floor.bounds.height) * 100}%`,
  });

  return (
    <div style={{ display: "flex", height: "calc(100vh - 70px)" }}>
      {/* Left side: floorplan */}
      <div style={{ width: "40%", padding: 12, borderRight: "1px solid #eee" }}>
        <h2>Demo Floorplan</h2>

        <div style={{ position: "relative", width: "100%", paddingBottom: "70%" }}>
          <img
            src={floor.imageUrl}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
          />

          {demoData.positions.map((pt) => (
            <button
              key={pt.id}
              onClick={() => setSelectedPoint(pt)}
              style={{
                position: "absolute",
                transform: "translate(-50%, -50%)",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: selectedPoint?.id === pt.id ? "#00c853" : "#ff5252",
                border: "2px solid white",
                cursor: "pointer",
                ...toCss(pt.floorPlanPosition),
              }}
            />
          ))}
        </div>
      </div>

      {/* Right side: viewer */}
      <div style={{ flex: 1, padding: 12 }}>
        <h2>360 Viewer</h2>
        <div ref={containerRef} style={{ width: "100%", height: "calc(100% - 40px)", background: "black" }} />
      </div>
    </div>
  );
}

export default ConstructionView;
