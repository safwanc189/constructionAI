"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Map,
  Navigation2,
  Calendar,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import type { CapturePoint, FloorPlan, VirtualTour } from "@/lib/types"
import { gpsToFloorPlanCoordinates, getCardinalDirection } from "@/lib/geo-utils"

interface VirtualTourViewerProps {
  tour: VirtualTour
  floorPlan?: FloorPlan
}

export function VirtualTourViewer({ tour, floorPlan }: VirtualTourViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [showFloorPlan, setShowFloorPlan] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const imageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentPoint = tour.capturePoints[currentIndex]
  const totalPoints = tour.capturePoints.length

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrevious()
      } else if (e.key === "ArrowRight") {
        handleNext()
      } else if (e.key === "ArrowUp") {
        setZoom((prev) => Math.min(prev + 0.25, 3))
      } else if (e.key === "ArrowDown") {
        setZoom((prev) => Math.max(prev - 0.25, 0.5))
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen()
      } else if (e.key === "m" || e.key === "M") {
        setShowFloorPlan(!showFloorPlan)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentIndex, showFloorPlan])

  // Determine if rotation should be applied
  const shouldRotate = tour.metadata?.captureMode !== "video"

  // Update rotation based on device orientation
  useEffect(() => {
    if (currentPoint) {
      setRotation(shouldRotate ? currentPoint.direction : 0)
    }
  }, [currentPoint, shouldRotate])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const handleNext = () => {
    if (currentIndex < totalPoints - 1) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1)
        setIsTransitioning(false)
      }, 150)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentIndex(currentIndex - 1)
        setIsTransitioning(false)
      }, 150)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return

    const deltaX = e.clientX - dragStart.x
    const rotationDelta = deltaX * 0.5

    setRotation((prev) => (prev + rotationDelta) % 360)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleFloorPlanClick = (index: number) => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex(index)
      setIsTransitioning(false)
    }, 150)
  }

  const getFloorPlanPosition = (point: CapturePoint) => {
    if (!floorPlan) return null
    if (point.floorPlanPosition) {
      return point.floorPlanPosition
    }
    return gpsToFloorPlanCoordinates(point.gps, floorPlan)
  }

  return (
    <div ref={containerRef} className="relative flex h-screen flex-col bg-black">
      {/* Main Panorama View */}
      <div
        ref={imageRef}
        className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {currentPoint && (
          <div
            className={`absolute inset-0 transition-all duration-300 ${isTransitioning ? "opacity-50" : "opacity-100"}`}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            <img
              src={currentPoint.imageUrl || "/placeholder.svg?height=1080&width=1920"}
              alt={`Capture point ${currentIndex + 1}`}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70"
              asChild
            >
              <a href="/tour-manager">
                <ChevronLeft className="h-6 w-6" />
              </a>
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-white">{tour.projectName}</h1>
              <p className="text-xs text-gray-300">
                {new Date(tour.date).toLocaleDateString()} • {totalPoints} captures •{" "}
                {tour.metadata.totalDistance.toFixed(0)}m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-black/70 text-white">
              <Calendar className="h-3 w-3 mr-1" />
              {new Date(currentPoint?.timestamp || 0).toLocaleTimeString()}
            </Badge>
            <Badge className="bg-black/70 text-white">
              <Navigation2 className="h-3 w-3 mr-1" />
              {getCardinalDirection(currentPoint?.direction || 0)}
            </Badge>
            <Badge className="bg-black/70 text-white text-xs">
              {currentPoint?.gps.latitude.toFixed(6)}, {currentPoint?.gps.longitude.toFixed(6)}
            </Badge>
          </div>
        </div>

        {/* Navigation Arrows - Street View style */}
        <div className="absolute inset-y-0 left-0 flex items-center p-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-16 w-16 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 transition-all hover:scale-110"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        </div>
        <div className="absolute inset-y-0 right-0 flex items-center p-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-16 w-16 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 transition-all hover:scale-110"
            onClick={handleNext}
            disabled={currentIndex === totalPoints - 1}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-24 right-4 flex flex-col gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 rounded-full bg-black/70 text-white hover:bg-black/90"
            onClick={() => setZoom((prev) => Math.min(prev + 0.25, 3))}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 rounded-full bg-black/70 text-white hover:bg-black/90"
            onClick={() => setZoom((prev) => Math.max(prev - 0.25, 0.5))}
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 rounded-full bg-black/70 text-white hover:bg-black/90"
            onClick={() => setShowFloorPlan(!showFloorPlan)}
          >
            <Map className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 rounded-full bg-black/70 text-white hover:bg-black/90"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </Button>
        </div>

        {/* Progress Indicator */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-black/70 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-white text-sm">
              <span>
                Point {currentIndex + 1} of {totalPoints}
              </span>
              <span>{Math.round((currentIndex / (totalPoints - 1)) * 100)}%</span>
            </div>
            <Slider
              value={[currentIndex]}
              onValueChange={([value]) => handleFloorPlanClick(value)}
              min={0}
              max={totalPoints - 1}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Floor Plan Mini Map with Current Position */}
      {showFloorPlan && floorPlan && (
        <div
          className="absolute top-20 left-4 bg-black/80 rounded-lg border border-white/20 overflow-hidden"
          style={{
            width: "280px",
            height: `${280 * (floorPlan.bounds.height / floorPlan.bounds.width)}px`,
          }}
        >
          <div className="relative w-full h-full p-2">
            <img
              src={`http://localhost:8000${floorPlan.imageUrl}`}
              alt="Floor plan"
              className="absolute inset-0 w-full h-full object-contain opacity-60"
            />

            {/* Corrected SVG using normalized 0–100 coords */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* PATH */}
              <path
                d={tour.capturePoints
                  .map((point, index) => {
                    const pos = getFloorPlanPosition(point)
                    if (!pos) return ""
                    const nx = (pos.x / floorPlan.bounds.width) * 100
                    const ny = (pos.y / floorPlan.bounds.height) * 100
                    return index === 0 ? `M ${nx} ${ny}` : `L ${nx} ${ny}`
                  })
                  .join(" ")}
                fill="none"
                stroke="#00D9A3"
                strokeWidth="1.5"
              />

              {/* POINTS */}
              {tour.capturePoints.map((point, index) => {
                const pos = getFloorPlanPosition(point)
                if (!pos) return null
                const nx = (pos.x / floorPlan.bounds.width) * 100
                const ny = (pos.y / floorPlan.bounds.height) * 100
                const isCurrent = index === currentIndex

                return (
                  <g key={point.id} className="cursor-pointer" onClick={() => handleFloorPlanClick(index)}>
                    <circle
                      cx={nx}
                      cy={ny}
                      r={isCurrent ? 3 : 1.8}
                      fill="#00D9A3"
                      stroke="white"
                      strokeWidth={isCurrent ? 1 : 0.5}
                    />
                    {isCurrent && (
                      <line
                        x1={nx}
                        y1={ny}
                        x2={nx + Math.cos((point.direction * Math.PI) / 180) * 6}
                        y2={ny + Math.sin((point.direction * Math.PI) / 180) * 6}
                        stroke="#00D9A3"
                        strokeWidth="1.5"
                      />
                    )}
                  </g>
                )
              })}
            </svg>

            <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-semibold">
              CURRENT LOCATION
            </div>
          </div>
        </div>
      )}

      {!isFullscreen && (
        <div className="absolute bottom-24 left-4 bg-black/70 text-white px-3 py-2 rounded-lg text-xs space-y-1">
          <p className="font-semibold">Keyboard Shortcuts:</p>
          <p>← → Navigate | ↑ ↓ Zoom | M Map | F Fullscreen</p>
        </div>
      )}
    </div>
  )
}
