"use client"

import { useState, useEffect } from "react"
import { Calendar, ArrowLeftRight, SplitSquareHorizontal, Layers, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { VirtualTour } from "@/lib/types"
import { tourDB } from "@/lib/db"
import { AdvancedPanoramaViewer } from "@/components/advanced-panorama-viewer"
import { useRouter } from "next/navigation";

/**
 * TimelineComparison
 *
 * Replaces frame thumbnails with stitched 360° panoramas.
 * - Side-by-side: two independent AdvancedPanoramaViewer instances (user can control each separately)
 * - Overlay: flat panorama images overlaid with adjustable opacity
 * - Slider: split/drag comparison using flat panorama images
 *
 * NOTE: This file intentionally only modifies the "what is displayed" (360 panoramas)
 *       and preserves your existing controls/layout/behavior as requested.
 */

type ComparisonMode = "side-by-side" | "overlay" | "slider"

export function TimelineComparison() {
  const [tours, setTours] = useState<VirtualTour[]>([])
  const [selectedTourA, setSelectedTourA] = useState<VirtualTour | null>(null)
  const [selectedTourB, setSelectedTourB] = useState<VirtualTour | null>(null)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("side-by-side")

  // These index controls were in your original UI for navigating capture points.
  // Since we are now comparing final panoramas, they are kept for the UI but
  // no longer drive which panorama is shown (each tour has a single panorama).
  const [currentIndexA, setCurrentIndexA] = useState(0)
  const [currentIndexB, setCurrentIndexB] = useState(0)

  const [overlayOpacity, setOverlayOpacity] = useState(50)
  const [sliderPosition, setSliderPosition] = useState(50)

  const router = useRouter();

  // Base backend URL used to construct panorama urls when the tour object doesn't include one.
  const FASTAPI_URL = "http://localhost:8000"

  useEffect(() => {
    const loadTours = async () => {
      try {
        await tourDB.init()
        const allTours = await tourDB.getAllTours()
        // keep only completed tours (same as before)
        const completed = allTours.filter((t) => t.status === "completed")
        setTours(completed)

        // pick two as default if available
        if (completed.length >= 2) {
          setSelectedTourA(completed[0])
          setSelectedTourB(completed[1])
        } else if (completed.length === 1) {
          setSelectedTourA(completed[0])
        }
      } catch (error) {
        console.error("[v0] Error loading tours:", error)
      }
    }

    loadTours()
  }, [])

  // Basic next/prev logic left untouched. They no longer change which pano is shown,
  // but they keep the UI behavior consistent with your original design.
  const handleNext = () => {
    if (selectedTourA && currentIndexA < (selectedTourA.capturePoints?.length ?? 1) - 1) {
      setCurrentIndexA(currentIndexA + 1)
    }
    if (selectedTourB && currentIndexB < (selectedTourB.capturePoints?.length ?? 1) - 1) {
      setCurrentIndexB(currentIndexB + 1)
    }
  }

  const handlePrevious = () => {
    if (currentIndexA > 0) setCurrentIndexA(currentIndexA - 1)
    if (currentIndexB > 0) setCurrentIndexB(currentIndexB - 1)
  }

  // helper: build a panorama url for a tour (if not present on the tour object)
  const getPanoramaUrl = (tour: VirtualTour) => {
    // If panoramaUrl present on tour, use it; otherwise fallback to convention:
    // http://localhost:8000/panoramas/<tourId>_panorama.jpg
    // this keeps behavior consistent with your stitch endpoint / naming.
    if ((tour as any).panoramaUrl) return (tour as any).panoramaUrl
    return `${FASTAPI_URL}/panoramas/${tour.id}_panorama.jpg`
  }

  // currentPointA/B still referenced in UI text (keeps the same labels as before)
  const currentPointA = selectedTourA?.capturePoints?.[currentIndexA]
  const currentPointB = selectedTourB?.capturePoints?.[currentIndexB]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Timeline Comparison</h1>
              <p className="text-sm text-muted-foreground mt-1">Compare construction progress over time (360° panoramas)</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={comparisonMode === "side-by-side" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonMode("side-by-side")}
              >
                <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                Side by Side
              </Button>
              <Button
                variant={comparisonMode === "overlay" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonMode("overlay")}
              >
                <Layers className="h-4 w-4 mr-2" />
                Overlay
              </Button>
              <Button
                variant={comparisonMode === "slider" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonMode("slider")}
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Slider
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tour Selection */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-2 gap-6 mb-6">
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Tour A (Before)</h3>
                <Badge variant="secondary">
                  <Calendar className="h-3 w-3 mr-1" />
                  {selectedTourA ? new Date(selectedTourA.date).toLocaleDateString() : "N/A"}
                </Badge>
              </div>
              <Select
                value={selectedTourA?.id}
                onValueChange={(value) => {
                  const tour = tours.find((t) => t.id === value)
                  setSelectedTourA(tour || null)
                  setCurrentIndexA(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tour" />
                </SelectTrigger>
                <SelectContent>
                  {tours.map((tour) => (
                    <SelectItem key={tour.id} value={tour.id}>
                      {tour.projectName} - {new Date(tour.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTourA && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{selectedTourA.capturePoints.length} capture points</p>
                  <p>{selectedTourA.metadata?.totalDistance?.toFixed(1) ?? "0.0"}m distance</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Tour B (After)</h3>
                <Badge variant="secondary">
                  <Calendar className="h-3 w-3 mr-1" />
                  {selectedTourB ? new Date(selectedTourB.date).toLocaleDateString() : "N/A"}
                </Badge>
              </div>
              <Select
                value={selectedTourB?.id}
                onValueChange={(value) => {
                  const tour = tours.find((t) => t.id === value)
                  setSelectedTourB(tour || null)
                  setCurrentIndexB(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tour" />
                </SelectTrigger>
                <SelectContent>
                  {tours.map((tour) => (
                    <SelectItem key={tour.id} value={tour.id}>
                      {tour.projectName} - {new Date(tour.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTourB && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{selectedTourB.capturePoints.length} capture points</p>
                  <p>{selectedTourB.metadata?.totalDistance?.toFixed(1) ?? "0.0"}m distance</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Comparison View */}
        {selectedTourA && selectedTourB && (
          <div className="space-y-4">
            {/* Side by Side Mode: render two independent 360 viewers */}
            {comparisonMode === "side-by-side" && (
              <div className="grid grid-cols-2 gap-4">
                <Card className="relative overflow-hidden" style={{ height: "600px" }}>
                  {/* AdvancedPanoramaViewer expects a VirtualTour; we ensure panoramaUrl exists via getPanoramaUrl */}
                  <AdvancedPanoramaViewer tour={{ ...selectedTourA, panoramaUrl: getPanoramaUrl(selectedTourA) } as VirtualTour} />
                  <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-lg text-sm">
                    Before — {new Date(selectedTourA.date).toLocaleDateString()}
                  </div>
                </Card>

                <Card className="relative overflow-hidden" style={{ height: "600px" }}>
                  <AdvancedPanoramaViewer tour={{ ...selectedTourB, panoramaUrl: getPanoramaUrl(selectedTourB) } as VirtualTour} />
                  <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-lg text-sm">
                    After — {new Date(selectedTourB.date).toLocaleDateString()}
                  </div>
                </Card>
              </div>
            )}

            {/* Overlay Mode: show flat panorama images and adjust opacity */}
            {comparisonMode === "overlay" && (
              <Card className="relative overflow-hidden" style={{ height: "600px" }}>
                <img
                  src={getPanoramaUrl(selectedTourA)}
                  alt="Tour A panorama"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <img
                  src={getPanoramaUrl(selectedTourB)}
                  alt="Tour B panorama"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ opacity: overlayOpacity / 100 }}
                />
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                  <Badge className="bg-black/70 text-white">Before</Badge>
                  <div className="flex items-center gap-2 bg-black/70 px-4 py-2 rounded-lg">
                    <span className="text-white text-sm">Opacity</span>
                    <Slider
                      value={[overlayOpacity]}
                      onValueChange={([value]) => setOverlayOpacity(value)}
                      min={0}
                      max={100}
                      step={1}
                      className="w-32"
                    />
                  </div>
                  <Badge className="bg-black/70 text-white">After</Badge>
                </div>
                <div className="absolute bottom-4 left-4 right-4 space-y-2">
                  <div className="flex items-center justify-between text-white text-sm bg-black/70 px-4 py-2 rounded-lg">
                    <span>Tour A: {new Date(selectedTourA.date).toLocaleDateString()}</span>
                    <span>Tour B: {new Date(selectedTourB.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Slider Mode: split comparison using flat panorama images */}
            {comparisonMode === "slider" && (
              <Card className="relative overflow-hidden" style={{ height: "600px" }}>
                <div className="absolute inset-0 flex">
                  <div
                    className="relative overflow-hidden"
                    style={{ width: `${sliderPosition}%`, transition: "width 0.1s" }}
                  >
                    <img
                      src={getPanoramaUrl(selectedTourA)}
                      alt="Tour A panorama"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ width: "100vw", maxWidth: "none" }}
                    />
                  </div>
                  <div className="flex-1 relative overflow-hidden">
                    <img
                      src={getPanoramaUrl(selectedTourB)}
                      alt="Tour B panorama"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ width: "100vw", maxWidth: "none", right: 0 }}
                    />
                  </div>
                </div>
                {/* Slider Handle */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10"
                  style={{ left: `${sliderPosition}%` }}
                  onMouseDown={(e) => {
                    const rectParent = (e.currentTarget.parentElement as HTMLElement) // parent .relative container
                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      const rect = rectParent?.getBoundingClientRect()
                      if (rect) {
                        const x = moveEvent.clientX - rect.left
                        const percentage = (x / rect.width) * 100
                        setSliderPosition(Math.max(0, Math.min(100, percentage)))
                      }
                    }
                    const handleMouseUp = () => {
                      document.removeEventListener("mousemove", handleMouseMove)
                      document.removeEventListener("mouseup", handleMouseUp)
                    }
                    document.addEventListener("mousemove", handleMouseMove)
                    document.addEventListener("mouseup", handleMouseUp)
                  }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-16 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <ArrowLeftRight className="h-4 w-4 text-black" />
                  </div>
                </div>

                <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-lg text-sm">Before</div>
                <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-lg text-sm">After</div>
              </Card>
            )}

            {/* Compare Button */}
            <div className="flex items-center justify-center mt-6">
              <Button
                size="lg"
                className="px-8 py-3"
                disabled={!selectedTourA || !selectedTourB}
                onClick={async () => {
                  if (!selectedTourA || !selectedTourB) return;

                  try {
                    const response = await fetch(`${FASTAPI_URL}/compare-tours-ai`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tourA: selectedTourA.id,
                        tourB: selectedTourB.id,
                      }),
                    });

                    const result = await response.json();
                    console.log("AI Compare Result:", result);

                    if (
                      result.yolo?.tourA ||
                      result.yolo?.tourB ||
                      result.segmentation?.tourA ||
                      result.segmentation?.tourB
                    ) {
                      console.log("✅ AI assets received:", result);

                      router.push(
                        `/panorama-comparison/${selectedTourA.id}_${selectedTourB.id}`
                      );
                    } else {
                      alert("⚠ Backend returned no visualization assets!");
                    }
                  } catch (err) {
                    console.error("Compare error:", err);
                    alert("❌ Failed to send AI comparison request.");
                  }
                }}
              >
                🔍 Compare Tours
              </Button>
            </div>
          </div>
        )}

        {(!selectedTourA || !selectedTourB) && (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select two tours to compare construction progress over time</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
