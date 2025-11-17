"use client";

import { useMemo, useRef, useState, useEffect } from "react";

type Point = { x: number; y: number }; // normalized [0..1]

export function FloorPathEditor({
  floorPlanImageUrl,
  onComplete,
  onCancel,
  initialPath,
}: {
  floorPlanImageUrl: string;
  onComplete: (path: { start: Point; polyline: Point[] }) => void;
  onCancel: () => void;
  initialPath?: { start: Point; polyline: Point[] } | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [start, setStart] = useState<Point | null>(initialPath?.start ?? null);
  const [points, setPoints] = useState<Point[]>(initialPath?.polyline ?? []);
  const [mode, setMode] = useState<"start" | "path">(start ? "path" : "start");

  const [imageBounds, setImageBounds] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  // Hover crosshair
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // Dragging
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const pathD = useMemo(() => {
    if (!points.length) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`)
      .join(" ");
  }, [points]);

  // Recalculate actual rendered image bounds
  const updateImageBounds = () => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    setImageBounds({
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
      width: imgRect.width,
      height: imgRect.height,
    });
  };

  useEffect(() => {
    updateImageBounds();
    const ro = new ResizeObserver(updateImageBounds);
    if (containerRef.current) ro.observe(containerRef.current);
    if (imgRef.current) ro.observe(imgRef.current);

    window.addEventListener("resize", updateImageBounds);
    return () => {
      window.removeEventListener("resize", updateImageBounds);
      ro.disconnect();
    };
  }, []);

  const onImgLoad = () => updateImageBounds();

  // Utility: convert real click to normalized [0..1]
  const getNormalized = (e: React.MouseEvent): Point | null => {
    const img = imgRef.current;
    if (!img) return null;

    const imgRect = img.getBoundingClientRect();

    if (
      e.clientX < imgRect.left ||
      e.clientX > imgRect.right ||
      e.clientY < imgRect.top ||
      e.clientY > imgRect.bottom
    )
      return null;

    return {
      x: (e.clientX - imgRect.left) / imgRect.width,
      y: (e.clientY - imgRect.top) / imgRect.height,
    };
  };

  // CLICK TO ADD POINT
  const handleClick = (e: React.MouseEvent) => {
    if (dragIndex !== null) return; // ignore click during drag

    const p = getNormalized(e);
    if (!p) return;

    if (mode === "start") {
      setStart(p);
      setMode("path");
    } else {
      setPoints((prev) => [...prev, p]);
    }
  };

  // HOVER CROSSHAIR
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragIndex !== null) {
      // dragging an existing point
      const p = getNormalized(e);
      if (!p) return;

      if (dragIndex === -1 && start) {
        // dragging START point
        setStart(p);
      } else if (dragIndex >= 0) {
        const updated = [...points];
        updated[dragIndex] = p;
        setPoints(updated);
      }
      return;
    }

    const p = getNormalized(e);
    setHoverPoint(p);
  };

  const handleMouseDown = (index: number) => {
    setDragIndex(index);
  };

  const handleMouseUp = () => {
    setDragIndex(null);
  };

  // DELETE POINT ON DOUBLE CLICK
  const handleDouble = (index: number) => {
    if (index === -1) {
      setStart(null);
      setMode("start");
      return;
    }
    setPoints((pts) => pts.filter((_, i) => i !== index));
  };

  const undo = () => setPoints((p) => p.slice(0, -1));
  const reset = () => {
    setStart(null);
    setPoints([]);
    setMode("start");
  };

  const finish = () => {
    if (!start || points.length < 2) return;
    onComplete({ start, polyline: points });
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-sm text-foreground/80">
        {mode === "start"
          ? "Click to set Start point (entrance)."
          : "Click to add path points. Drag to adjust. Double-click to delete."}
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-w-[720px] aspect-video rounded-md overflow-hidden ring-1 ring-border"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <img
          ref={imgRef}
          src={floorPlanImageUrl}
          onLoad={onImgLoad}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
        />

        {/* SVG EXACTLY over image */}
        <svg
          viewBox="0 0 100 100"
          className="absolute"
          style={{
            left: imageBounds.left,
            top: imageBounds.top,
            width: imageBounds.width,
            height: imageBounds.height,
          }}
        >
          {/* Path Line */}
          <path
            d={pathD}
            stroke="#00D9A3"
            strokeWidth={1}
            fill="none"
          />

          {/* Start point (draggable) */}
          {start && (
            <circle
              cx={start.x * 100}
              cy={start.y * 100}
              r={3}
              fill="green"
              stroke="white"
              strokeWidth={1}
              onMouseDown={() => handleMouseDown(-1)}
              onDoubleClick={() => handleDouble(-1)}
              style={{ cursor: "grab", pointerEvents: "auto" }}
            />
          )}

          {/* Path Points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x * 100}
              cy={p.y * 100}
              r={2.5}
              fill="#00D9A3"
              stroke="white"
              strokeWidth={0.8}
              onMouseDown={() => handleMouseDown(i)}
              onDoubleClick={() => handleDouble(i)}
              style={{ cursor: "grab", pointerEvents: "auto" }}
            />
          ))}

          {/* Hover crosshair */}
          {hoverPoint && dragIndex === null && (
            <circle
              cx={hoverPoint.x * 100}
              cy={hoverPoint.y * 100}
              r={1.8}
              fill="yellow"
              stroke="black"
              strokeWidth={0.4}
            />
          )}
        </svg>
      </div>

      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded-md bg-muted" onClick={undo} disabled={!points.length}>
          Undo
        </button>
        <button className="px-3 py-1.5 rounded-md bg-muted" onClick={reset}>
          Reset
        </button>
        <div className="flex-1" />
        <button className="px-3 py-1.5 rounded-md bg-background ring-1 ring-border" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
          disabled={!start || points.length < 2}
          onClick={finish}
        >
          Save Path
        </button>
      </div>
    </div>
  );
}
