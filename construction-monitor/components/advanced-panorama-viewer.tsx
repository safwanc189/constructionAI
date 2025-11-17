"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Rotate3D,
  Image as ImageIcon,
} from "lucide-react"
import type { VirtualTour } from "@/lib/types"

/**
 * 🌀 AdvancedPanoramaViewer
 * Default: 360° Pan & Zoom view (interactive)
 * Button: Toggle to Flat static image view
 */
export function AdvancedPanoramaViewer({ tour }: { tour: VirtualTour }) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const pannellumRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [zoom, setZoom] = useState(100)
  const [pitch, setPitch] = useState(0)
  const [yaw, setYaw] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isStaticView, setIsStaticView] = useState(false) // 👈 only toggle this

  //Backend and panorama urls
  const backendUrl = "http://localhost:8000"
  const stitchedUrl = `${backendUrl}/virtual_tours/${tour.id}/panorama/panorama.jpg`

  // 🧩 Initialize 360° viewer (default)
  useEffect(() => {
    if (isStaticView) return // skip pannellum init in static mode

    const initViewer = async () => {
      if (!viewerRef.current) return

      // Check panorama exists
      const panoramaExists = await fetch(stitchedUrl, { method: "HEAD" })
        .then((res) => res.ok)
        .catch(() => false)

      if (!panoramaExists) {
        console.log("⏳ Triggering stitching for:", tour.id)
        try {
          await fetch(`${backendUrl}/stitch-panorama/${tour.id}`, { method: "POST" })
        } catch (err) {
          console.error("❌ Stitch request failed:", err)
        }
      }

      // 📦 Dynamically load Pannellum script and stylesheet (only once)
      if (!window.pannellum) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script")
          script.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"
          script.async = true
          script.onload = () => resolve()
          document.head.appendChild(script)

          const link = document.createElement("link")
          link.rel = "stylesheet"
          link.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"
          document.head.appendChild(link)
        })
      }

      // Destroy old viewer
      if (pannellumRef.current) pannellumRef.current.destroy()

      // Initialize pannellum viewer
      pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
        type: "equirectangular",
        panorama: stitchedUrl,
        autoLoad: true,
        showControls: false,
        hfov: zoom,
        minHfov: 30,
        maxHfov: 120,
        pitch,
        yaw,
      })

      pannellumRef.current.on("mouseup", () => {
        setPitch(pannellumRef.current.getPitch())
        setYaw(pannellumRef.current.getYaw())
      })
    }

    initViewer()

    return () => pannellumRef.current?.destroy()
  }, [tour.id, isStaticView])

  // 🔍 Update zoom when changed
  useEffect(() => {
    if (pannellumRef.current && !isStaticView) pannellumRef.current.setHfov(zoom)
  }, [zoom, isStaticView])

  // 🔁 Reset 360° view
  const resetView = () => {
    if (!pannellumRef.current) return
    pannellumRef.current.setPitch(0)
    pannellumRef.current.setYaw(0)
    pannellumRef.current.setHfov(100)
    setPitch(0)
    setYaw(0)
    setZoom(100)
  }

  // ⛶ Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) document.exitFullscreen()
    else containerRef.current.requestFullscreen()
  }

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  // 🌐 Toggle between 360° and Flat
  const toggleViewMode = () => setIsStaticView((prev) => !prev)

  // 🗺️ Load floor plan + path data from IndexedDB (no backend)


  return (
    <div ref={containerRef} className="relative h-screen w-full bg-black overflow-hidden">

      {/* 🖼️ Viewer */}
      {!isStaticView ? (
        <div ref={viewerRef} className="absolute inset-0 cursor-grab" />
      ) : (
        <img
          src={stitchedUrl}
          alt="Flat Panorama"
          className="absolute inset-0 h-full w-full object-contain bg-black"
        />
      )}

      {/* 🎛️ Controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-black/40 px-4 py-2 text-white backdrop-blur-md">
        {!isStaticView && (
          <>
            <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(z + 10, 120))} title="Zoom In">
              <ZoomIn className="h-5 w-5" />
            </Button>

            <div className="w-40">
              <Slider value={[zoom]} min={30} max={120} step={1} onValueChange={(val) => setZoom(val[0])} />
            </div>

            <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(z - 10, 30))} title="Zoom Out">
              <ZoomOut className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon" onClick={resetView} title="Reset View">
              <RefreshCw className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* 🌐 Toggle Flat / 360 */}
        <Button variant="ghost" size="icon" onClick={toggleViewMode} title="Toggle Flat View">
          {isStaticView ? <Rotate3D className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
        </Button>

        {/* ⛶ Fullscreen */}
        <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Toggle Fullscreen">
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  )
}

// global pannellum type
declare global {
  interface Window {
    pannellum: any
  }
}
