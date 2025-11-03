import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse 
import os
import shutil
import cv2
import logging
import time
from pydantic import BaseModel
import numpy as np
from ultralytics import YOLO
from transformers import Mask2FormerImageProcessor, AutoModelForUniversalSegmentation
import torch

# Prevent CPU overload on Laptop
torch.set_num_threads(2)

# =========================================================
# Load Models
# =========================================================

#Load yolov8n
yolo_model = YOLO("yolov8n.pt")

# ✅ Load Mask2Former model
processor = Mask2FormerImageProcessor.from_pretrained("facebook/mask2former-swin-tiny-ade-semantic")
seg_model = AutoModelForUniversalSegmentation.from_pretrained(
    "facebook/mask2former-swin-tiny-ade-semantic"
).eval()

device = torch.device("cpu")
seg_model.to(device)

# 1️⃣ APP SETUP
app = FastAPI(title="Construction Monitor Stitching Service", version="1.3")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)


# =========================================================
# 2️⃣ CORS CONFIGURATION
# =========================================================
origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# 3️⃣ FILE STORAGE SETUP
# =========================================================
UPLOAD_DIR = "temp_uploads"
STITCHED_DIR = "stitched_panoramas"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STITCHED_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount(
    "/panoramas",
    StaticFiles(directory=r"D:\Cosysta\Construction\Working on\Backend\stitched_panoramas"),
    name="panoramas",
)

# ✅ Ensure correct static file serving for compare results
COMPARE_DIR = os.path.join(os.getcwd(), "compare_results")

app.mount(
    "/compare_results",
    StaticFiles(directory=COMPARE_DIR),
    name="compare_results"
)


# =========================================================
# 🔹 Get all uploaded image files for a tour
# =========================================================
def get_tour_files(tour_id: str):
    """
    Returns all image file paths for the given tour_id, sorted by frame number.
    Expected naming: frame-0.jpg, frame-1.jpg, ...
    """
    tour_dir = os.path.join(UPLOAD_DIR, tour_id)
    if not os.path.isdir(tour_dir):
        return []

    try:
        files = sorted(
            [os.path.join(tour_dir, f) for f in os.listdir(tour_dir) if f.endswith(".jpg")],
            key=lambda x: int(os.path.splitext(os.path.basename(x))[0].split('-')[1])
        )
    except Exception:
        files = sorted([
            os.path.join(tour_dir, f)
            for f in os.listdir(tour_dir)
            if f.endswith(".jpg")
        ])
    return files


# =========================================================
# 🔹 semantic segmentation & saves a colored overlay result
# =========================================================

def run_segmentation(input_path, output_path):
    """Runs semantic segmentation & saves a colored overlay result."""
    image = cv2.imread(input_path)
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    inputs = processor(images=image, return_tensors="pt")
    outputs = seg_model(**inputs)

    # Convert raw outputs to class mask
    class_scores = outputs.class_queries_logits  # [1, num_queries, num_classes]
    mask_logits = outputs.masks_queries_logits  # [1, num_queries, H/4, W/4]
    
    # Resize masks to original resolution
    mask_logits = torch.nn.functional.interpolate(
         mask_logits,
         size=inputs["pixel_values"].shape[-2:],  # original H, W
         mode="bilinear",
         align_corners=False,
    )
    
    mask_probs = mask_logits.softmax(dim=1)
    seg_map = mask_probs.argmax(dim=1).squeeze().cpu().numpy()

    # Resize segmentation to original image resolution ✅
    seg_map_resized = cv2.resize(seg_map.astype(np.uint8), (rgb_image.shape[1], rgb_image.shape[0]),
                             interpolation=cv2.INTER_NEAREST)

    # Apply colors
    colors = np.random.randint(0, 255, size=(150, 3), dtype=np.uint8)
    color_mask = colors[seg_map_resized]

    # Blend overlay
    final = cv2.addWeighted(rgb_image, 0.7, color_mask, 0.6, 0)
    cv2.imwrite(output_path, cv2.cvtColor(final, cv2.COLOR_RGB2BGR))

# =========================================================
# 4️⃣ API ROUTES
# =========================================================

@app.get("/")
def root():
    """Health check route — confirms backend is running."""
    return {"message": "✅ FastAPI Stitching Service is live and running!"}


# ---------------------------------------------------------
# Upload Endpoint
# ---------------------------------------------------------
@app.post("/upload-image-file/{tour_id}")
async def upload_image_file(tour_id: str, file: UploadFile = File(...)):
    """
    Uploads a single frame image and stores it in:
        temp_uploads/<tour_id>/<filename>
    """
    try:
        tour_dir = os.path.join(UPLOAD_DIR, tour_id)
        os.makedirs(tour_dir, exist_ok=True)

        file_path = os.path.join(tour_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        logging.info(f"📸 Saved frame: {file.filename} (Tour ID: {tour_id})")

        image_url = f"/uploads/{tour_id}/{file.filename}"
        return {"filename": file.filename, "imageUrl": image_url}

    except Exception as e:
        logging.error(f"❌ Upload failed for tour {tour_id}: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")


# ---------------------------------------------------------
# Stitch Endpoint
# ---------------------------------------------------------
@app.post("/stitch-panorama/{tour_id}")
async def stitch_panorama(tour_id: str):
    """
    Stitches all uploaded frames into one panorama using OpenCV.
    Skips stitching if the panorama already exists.
    """
    logging.info(f"🧵 Stitching requested for tour: {tour_id}")

    # 🔹 1️⃣ Check if panorama already exists
    output_filename = f"{tour_id}_panorama.jpg"
    output_path = os.path.join(STITCHED_DIR, output_filename)
    if os.path.exists(output_path):
        logging.info(f"🖼️ Panorama already exists for {tour_id}, skipping stitching.")
        return {
            "message": "✅ Panorama already exists, skipping stitching.",
            "tour_id": tour_id,
            "status": "exists",
            "saved_as": output_filename,
            "finalPanoramaUrl": f"/panoramas/{output_filename}",
        }

    # 🔹 2️⃣ Load uploaded images
    image_files = get_tour_files(tour_id)
    if len(image_files) < 2:
        logging.error(f"⚠️ Not enough frames to stitch ({len(image_files)} found)")
        raise HTTPException(status_code=400, detail="Need at least 2 images to create a panorama.")

    try:
        images = [cv2.imread(f) for f in image_files]
        if any(img is None for img in images):
            raise ValueError("One or more uploaded images could not be read.")
        logging.info(f"✅ Loaded {len(images)} images successfully for tour {tour_id}")
    except Exception as e:
        logging.error(f"❌ Error reading images: {e}")
        raise HTTPException(status_code=500, detail=f"Error loading images: {e}")

    # 🔹 3️⃣ Stitch with OpenCV
    stitcher = cv2.Stitcher.create(cv2.Stitcher_PANORAMA)
    start_time = time.time()
    status, stitched_image = stitcher.stitch(images)
    duration = time.time() - start_time
    logging.info(f"🕒 Stitch completed in {duration:.2f}s (Status: {status})")

    if status != cv2.Stitcher_OK:
        logging.warning(f"⚠️ Stitching failed (Status: {status}). Using first frame as fallback.")
        stitched_image = images[0]

    # 🔹 4️⃣ Save the panorama
    try:
        cv2.imwrite(output_path, stitched_image)
        logging.info(f"💾 Panorama successfully saved to: {output_path}")
    except Exception as e:
        logging.error(f"❌ Error saving stitched panorama: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save panorama: {e}")

    # 🔹 5️⃣ Return result

    return {
        "message": f"✅ Stitching completed in {duration:.2f}s",
        "tour_id": tour_id,
        "status": int(status),
        "saved_as": output_filename,
        "finalPanoramaUrl": f"/panoramas/{output_filename}",
    }


# ---------------------------------------------------------
# Compare Tours Endpoint
# ---------------------------------------------------------
class CompareRequest(BaseModel):
    tourA: str
    tourB: str

COMPARE_DIR = "compare_results"
os.makedirs(COMPARE_DIR, exist_ok=True)

YOLO_DIR = os.path.join(COMPARE_DIR, "yolo")
SEGMENT_DIR = os.path.join(COMPARE_DIR, "segmentation")

os.makedirs(YOLO_DIR, exist_ok=True)
os.makedirs(SEGMENT_DIR, exist_ok=True)

@app.post("/compare-tours-ai")
async def compare_tours_ai(data: CompareRequest):
    pathA = os.path.join(STITCHED_DIR, f"{data.tourA}_panorama.jpg")
    pathB = os.path.join(STITCHED_DIR, f"{data.tourB}_panorama.jpg")

    if not os.path.exists(pathA) or not os.path.exists(pathB):
        raise HTTPException(status_code=400, detail="One or both panoramas not found")

    # ✅ YOLO Detection
    yolo_A_path = os.path.join(YOLO_DIR, f"{data.tourA}_detected.jpg")
    yolo_B_path = os.path.join(YOLO_DIR, f"{data.tourB}_detected.jpg")

    results_A = yolo_model(pathA)
    results_A[0].save(yolo_A_path)

    results_B = yolo_model(pathB)
    results_B[0].save(yolo_B_path)
    

    # ✅ Segmentation Output Save Paths
    seg_A_path = os.path.join(SEGMENT_DIR, f"{data.tourA}_segmented.jpg")
    seg_B_path = os.path.join(SEGMENT_DIR, f"{data.tourB}_segmented.jpg")

    # ✅ Mask2Former segmentation
    run_segmentation(pathA, seg_A_path)
    run_segmentation(pathB, seg_B_path)

    print("Returning:", {
        "yolo": {
            "tourA": f"/compare_results/yolo/{data.tourA}_detected.jpg",
            "tourB": f"/compare_results/yolo/{data.tourB}_detected.jpg"
        },
        "segmentation": {
            "tourA": f"/compare_results/segmentation/{data.tourA}_segmented.jpg",
            "tourB": f"/compare_results/segmentation/{data.tourB}_segmented.jpg"
        }
    })
    
    return {
        "message": "✅ Compare complete with YOLO + Segmentation",
        "yolo": {
            "tourA": f"/compare_results/yolo/{data.tourA}_detected.jpg",
            "tourB": f"/compare_results/yolo/{data.tourB}_detected.jpg"
        },
        "segmentation": {
            "tourA": f"/compare_results/segmentation/{data.tourA}_segmented.jpg",
            "tourB": f"/compare_results/segmentation/{data.tourB}_segmented.jpg"
        }
    }



@app.get("/compare_results/{filename}")
async def get_compare_result(filename: str):
    file_path = os.path.join(COMPARE_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Diff image not found")
    return FileResponse(file_path)
# =========================================================
# 5️⃣ RUN SERVER
# =========================================================
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
