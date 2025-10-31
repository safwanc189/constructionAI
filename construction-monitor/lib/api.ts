// This is the URL where your FastAPI backend service is running
const FASTAPI_URL = "http://localhost:8000";

/**
 * Uploads a single frame (as a Blob) to the FastAPI backend.
 * Returns the fully qualified web-accessible URL of the uploaded image.
 */
export async function uploadImageFile(
  sessionId: string,
  blob: Blob,
  filename: string
): Promise<string> {
  const formData = new FormData();
  // Convert Blob to File with name and type for FastAPI handling
  const file = new File([blob], filename, { type: "image/jpeg" });
  formData.append("file", file);

  try {
    const response = await fetch(`${FASTAPI_URL}/upload-image-file/${sessionId}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Frame uploaded:", data.filename, "Raw URL:", data.imageUrl);

    // Ensure backend provided imageUrl
    if (!data.imageUrl) {
      throw new Error("Backend did not return an imageUrl after upload.");
    }

    // Convert relative path to absolute URL
    let fullUrl = data.imageUrl;
    if (!fullUrl.startsWith("http")) {
      // Automatically prepend backend base URL
      fullUrl = `${FASTAPI_URL}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
    }

    console.log("🌐 Final accessible image URL:", fullUrl);
    return fullUrl;

  } catch (error) {
    console.error("❌ Error uploading file:", error);
    throw error;
  }
}

/**
 * Triggers the FastAPI backend to stitch all frames for a session.
 * Returns the fully qualified URL of the final stitched panorama.
 */
export async function triggerStitchPanorama(
  sessionId: string,
  tourId: string
): Promise<{ finalPanoramaUrl: string }> {
  const formData = new FormData();
  formData.append("tour_id", tourId);

  try {
    const response = await fetch(`${FASTAPI_URL}/stitch-panorama/${sessionId}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stitching trigger failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("🧵 Stitching complete:", data);

    // Ensure backend provided finalPanoramaUrl
    if (!data.finalPanoramaUrl) {
      throw new Error("Backend did not return a finalPanoramaUrl after stitching.");
    }

    // Convert relative path to absolute URL if needed
    let fullUrl = data.finalPanoramaUrl;
    if (!fullUrl.startsWith("http")) {
      fullUrl = `${FASTAPI_URL}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
    }

    console.log("🌐 Final panorama URL:", fullUrl);
    return { finalPanoramaUrl: fullUrl };

  } catch (error) {
    console.error("❌ Error triggering stitch:", error);
    throw error;
  }
}