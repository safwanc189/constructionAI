"use client"

import { useEffect, useState } from "react"
import { use } from "react"
import { AdvancedPanoramaViewer } from "@/components/advanced-panorama-viewer"
import { tourDB } from "@/lib/db"
import type { VirtualTour } from "@/lib/types"
import { Loader2 } from "lucide-react"

const FASTAPI_URL = "http://localhost:8000"

export default function PanoramaPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params) // ✅ unwrap params for Next.js 15
  const tourId = unwrappedParams.id

  const [tour, setTour] = useState<VirtualTour | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTour = async () => {
      try {
        await tourDB.init()
        const loadedTour = await tourDB.getTour(tourId)

        if (!loadedTour) {
          setError("Tour not found in local DB")
          return
        }

        console.log("🧩 Triggering stitch for:", tourId)
        try {
          const stitchRes = await fetch(`${FASTAPI_URL}/stitch-panorama/${tourId}`, {
            method: "POST",
          })
          if (!stitchRes.ok) console.warn("⚠️ Stitching failed:", await stitchRes.text())
          else console.log("✅ Stitch request sent for", tourId)
        } catch (err) {
          console.warn("❌ Error triggering stitch:", err)
        }

        // ✅ Construct panorama URL
        const panoramaFilename = `${tourId}_panorama.jpg`
        const panoramaUrl = `${FASTAPI_URL}/panoramas/${panoramaFilename}`

        // ✅ Check if panorama exists
        try {
          const res = await fetch(panoramaUrl, { method: "HEAD" })
          if (res.ok) loadedTour.panoramaUrl = panoramaUrl
          else console.warn("Panorama not found yet:", panoramaUrl)
        } catch (err) {
          console.warn("No panorama available yet:", err)
        }

        setTour(loadedTour)
      } catch (err) {
        console.error("Error loading tour:", err)
        setError("Failed to load tour data")
      } finally {
        setLoading(false)
      }
    }

    loadTour()
  }, [tourId])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white">Loading 360° tour...</p>
        </div>
      </div>
    )
  }

  if (error || !tour) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-white text-xl">{error || "Tour not found"}</p>
          <a href="/tour-manager" className="text-primary hover:underline mt-4 inline-block">
            Back to Tour Manager
          </a>
        </div>
      </div>
    )
  }

  return (
    <AdvancedPanoramaViewer
      tour={tour}
      sessionId={tour.id}
      onSave={(updatedTour: VirtualTour) => setTour(updatedTour)}
    />
  )
}
