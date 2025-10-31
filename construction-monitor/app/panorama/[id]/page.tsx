"use client"

import { useEffect, useState } from "react"
import { use } from "react"
import { AdvancedPanoramaViewer } from "@/components/advanced-panorama-viewer"
import { tourDB } from "@/lib/db"
import type { VirtualTour } from "@/lib/types"
import { Loader2 } from "lucide-react"

//  FastAPI backend base URL
const FASTAPI_URL = "http://localhost:8000"

/**
 * 🗺️ PanoramaPage
 * ------------------------------------------------------
 * This page handles:
 * 1️⃣ Loading tour data from IndexedDB (`tourDB`)
 * 2️⃣ Requesting FastAPI to stitch frames (if not done)
 * 3️⃣ Checking if the stitched panorama image exists
 * 4️⃣ Displaying the `AdvancedPanoramaViewer` to render it
 */

export default function PanoramaPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params) // ✅ unwrap params for Next.js 15
  const tourId = unwrappedParams.id

  const [tour, setTour] = useState<VirtualTour | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
 
  /**
   * 🔁 useEffect → Loads tour data when page mounts or `tourId` changes
   */
  
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
        /**
         * 🧵 Step 1: Trigger stitching on backend
         * --------------------------------------------------
         * Sends a POST request to FastAPI `/stitch-panorama/{id}`
         * - Backend takes all saved frames
         * - Stitches them into a 360° image
         * - Saves it as `<id>_panorama.jpg` in /panoramas
         */
        try {
          const stitchRes = await fetch(`${FASTAPI_URL}/stitch-panorama/${tourId}`, {
            method: "POST",
          })
          if (!stitchRes.ok) console.warn("⚠️ Stitching failed:", await stitchRes.text())
          else console.log("✅ Stitch request sent for", tourId)
        } catch (err) {
          console.warn("❌ Error triggering stitch:", err)
        }

        /**
         * 🧱 Step 2: Construct panorama file URL
         * --------------------------------------------------
         * Example:
         * - tourId: 12345
         * - panoramaUrl: http://localhost:8000/panoramas/12345_panorama.jpg
         */
        const panoramaFilename = `${tourId}_panorama.jpg`
        const panoramaUrl = `${FASTAPI_URL}/panoramas/${panoramaFilename}`

        /**
         * 🕵️ Step 3: Check if panorama image exists on backend
         * --------------------------------------------------
         * - HEAD request only checks existence (no image download)
         * - If found, attach the panorama URL to the tour data
         * - If not found yet, warn user that stitching may be pending
         */
        try {
          const res = await fetch(panoramaUrl, { method: "HEAD" })
          if (res.ok) loadedTour.panoramaUrl = panoramaUrl
          else console.warn("Panorama not found yet:", panoramaUrl)
        } catch (err) {
          console.warn("No panorama available yet:", err)
        }

        // ✅ Save updated tour (with panorama URL) into state
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

  /**
   * ⌛ Case 1: Show loader while fetching/stitching data
   */
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

  /**
   * 🚫 Case 2: If error or no tour data found, show fallback........
   */

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

  /**
   * ✅ Case 3: Success → Render the 360° Panorama Viewer
   */

  return (
    <AdvancedPanoramaViewer
      tour={tour}
      
     
    />
  )
}
