#Imports

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
from transformers import AutoImageProcessor, SegformerForSemanticSegmentation
from PIL import Image
import torch
import random
import supervision as sv

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

# 🧭 Auto-detect base project directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 🗂 Define folders dynamically
UPLOAD_DIR = os.path.join(BASE_DIR, "temp_uploads")
STITCHED_DIR = os.path.join(BASE_DIR, "stitched_panoramas")
COMPARE_DIR = os.path.join(BASE_DIR, "compare_results")

# ✅ Ensure all directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STITCHED_DIR, exist_ok=True)
os.makedirs(COMPARE_DIR, exist_ok=True)

# 📁 Subfolders for compare results
YOLO_DIR = os.path.join(COMPARE_DIR, "yolo")
SEGMENT_DIR = os.path.join(COMPARE_DIR, "segmentation")
COMBINED_DIR = os.path.join(COMPARE_DIR, "combined")
CUSTOM_YOLO_DIR = os.path.join(COMPARE_DIR, "custom_yolo")

os.makedirs(YOLO_DIR, exist_ok=True)
os.makedirs(SEGMENT_DIR, exist_ok=True)
os.makedirs(COMBINED_DIR, exist_ok=True)
os.makedirs(CUSTOM_YOLO_DIR, exist_ok=True)

# 📁 Mount static directories for frontend access
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/panoramas", StaticFiles(directory=STITCHED_DIR), name="panoramas")
app.mount("/compare_results", StaticFiles(directory=COMPARE_DIR), name="compare_results")


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
# Load Models
# =========================================================

#Load yolov8n
yolo_model = YOLO("yolov8m-seg.pt")
print("✅ YOLOv8-Seg model loaded successfully.")


# ✅ Load SegFormer ADE20K model (lightweight and CPU-friendly)
print("⏳ Loading SegFormer ADE20K model...")
SEG_MODEL_ID = "nvidia/segformer-b2-finetuned-ade-512-512"
processor = AutoImageProcessor.from_pretrained(SEG_MODEL_ID)
seg_model = SegformerForSemanticSegmentation.from_pretrained(SEG_MODEL_ID).eval()
print("✅ SegFormer model loaded successfully.")

# Prevent CPU overload on Laptop
torch.set_num_threads(2)

device = torch.device("cpu")
seg_model.to(device)


print("⏳ Loading custom trained YOLOv8 model (best.pt)...")
custom_yolo_model = YOLO("best.pt")
print("✅ Custom YOLOv8 model loaded successfully.")

# =========================================================
# 🔹 YOLOv8 Instance Segmentation (Highlight Chairs & Persons)
# =========================================================
def run_yolo_seg(input_path: str, output_path: str):
    """
    Runs YOLOv8 instance segmentation on an image and highlights key objects.
    - 'chair' → pink overlay
    - 'person' → orange overlay
    Other objects → green overlay (default)
    """

    # Run YOLOv8-Seg model on input image
    results = yolo_model(input_path)
    result = results[0]

    # Load image
    img = cv2.imread(input_path)
    if img is None:
        print(f"❌ Could not load image from {input_path}")
        return

    # If YOLO detected masks, process them
    if result.masks is not None:
        masks = result.masks.data.cpu().numpy()
        boxes = result.boxes
        names = yolo_model.names

        for i, mask in enumerate(masks):
            class_id = int(boxes.cls[i])
            class_name = names[class_id]

            # --- 🎨 Custom highlight colors ---
            if class_name == "chair":
                color = (255, 105, 180)  # pink
            elif class_name == "person":
                color = (255, 165, 0)    # orange
            else:
                color = (0, 255, 0)      # green (default)

            # Resize mask to match image size
            mask_resized = cv2.resize(mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
            mask_binary = mask_resized.astype(bool)

            # Blend the color into the image (0.4 background, 0.6 color)
            img[mask_binary] = img[mask_binary] * 0.4 + np.array(color) * 0.6

        # --- 📦 Draw bounding boxes for detected objects ---
        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cls_name = names[int(box.cls[0])]
            conf = float(box.conf[0])

            # Reuse the same color used above (default green if not chair/person)
            if cls_name == "chair":
                color = (255, 105, 180)
            elif cls_name == "person":
                color = (255, 165, 0)
            else:
                color = (0, 255, 0)

            # Draw bounding box
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

            # Add class label + confidence
            cv2.putText(img, f"{cls_name} {conf:.2f}", (x1, max(y1 - 5, 20)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # Save final result
    cv2.imwrite(output_path, img)
    print(f"✅ YOLO-Seg output saved: {output_path}")

# =========================================================
# 🔹 semantic segmentation & saves a colored overlay result
# =========================================================

def run_segmentation(input_path, output_path):
    """Runs semantic segmentation & saves a colored overlay result (SegFormer version)."""
    image = cv2.imread(input_path)
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # ✅ Convert to PIL for SegFormer processor
    pil_image = Image.fromarray(rgb_image)

    # Run through SegFormer
    inputs = processor(images=pil_image, return_tensors="pt")
    with torch.no_grad():
        outputs = seg_model(**inputs)

    # Resize logits to original resolution
    logits = torch.nn.functional.interpolate(
        outputs.logits,
        size=pil_image.size[::-1],
        mode="bilinear",
        align_corners=False,
    )

    seg_map = logits.argmax(dim=1)[0].cpu().numpy()

    # Resize to exact original shape (safety)
    seg_map_resized = cv2.resize(seg_map.astype(np.uint8),
                                 (rgb_image.shape[1], rgb_image.shape[0]),
                                 interpolation=cv2.INTER_NEAREST)

    # ✅ Your fixed bright construction colors
    CUSTOM_COLORS = {
        'wall': [255, 0, 0],        # red
        'floor': [0, 255, 0],       # green
        'ceiling': [255, 255, 0],   # yellow
        'windowpane': [0, 255, 255],# cyan
        'door': [255, 165, 0],      # orange
        'table': [128, 0, 128],     # purple
        'cabinet': [0, 0, 255],     # blue
        'desk': [255, 105, 180],    # pink
    }

    # ADE20K labels list (to map names → indices)
    ADE20K_CLASSES = [
        'wall', 'building', 'sky', 'floor', 'tree', 'ceiling', 'road', 'bed', 'windowpane',
        'grass', 'cabinet', 'sidewalk', 'person', 'earth', 'door', 'table', 'mountain',
        'plant', 'curtain', 'chair', 'car', 'water', 'painting', 'sofa', 'shelf', 'house',
        'sea', 'mirror', 'rug', 'field', 'armchair', 'seat', 'fence', 'desk', 'rock',
        'wardrobe', 'lamp', 'bathtub', 'railing', 'cushion', 'base', 'box', 'column',
        'signboard', 'chest of drawers', 'counter', 'sand', 'sink', 'skyscraper', 'fireplace',
        'refrigerator', 'grandstand', 'path', 'stairs', 'runway', 'case', 'pool table',
        'pillow', 'screen door', 'stairway', 'river', 'bridge', 'bookcase', 'blind',
        'coffee table', 'toilet', 'flower', 'book', 'hill', 'bench', 'countertop', 'stove',
        'palm', 'kitchen island', 'computer', 'swivel chair', 'boat', 'bar', 'arcade machine',
        'hovel', 'bus', 'towel', 'light', 'truck', 'tower', 'chandelier', 'awning',
        'streetlight', 'booth', 'television', 'airplane', 'dirt track', 'apparel', 'pole',
        'land', 'bannister', 'escalator', 'ottoman', 'bottle', 'buffet', 'poster', 'stage',
        'van', 'ship', 'fountain', 'conveyer belt', 'canopy', 'washer', 'plaything',
        'swimming pool', 'stool', 'barrel', 'basket', 'waterfall', 'tent', 'bag', 'minibike',
        'cradle', 'oven', 'ball', 'food', 'step', 'tank', 'trade name', 'microwave', 'pot',
        'animal', 'bicycle', 'lake', 'dishwasher', 'screen', 'blanket', 'sculpture', 'hood',
        'sconce', 'vase', 'traffic light', 'tray', 'ashcan', 'fan', 'pier', 'crt screen',
        'plate', 'monitor', 'bulletin board', 'shower', 'radiator', 'glass', 'clock', 'flag'
    ]

    # Create color mask (same shape as image)
    color_mask = np.zeros_like(rgb_image)

    # Fixed seed so random colors stay consistent
    random.seed(42)

    # Assign colors
    for class_id, class_name in enumerate(ADE20K_CLASSES):
        mask = seg_map_resized == class_id
        color = CUSTOM_COLORS.get(class_name, [random.randint(0, 255) for _ in range(3)])
        color_mask[mask] = color

    # Overlay
    final = cv2.addWeighted(rgb_image, 0.6, color_mask, 0.6, 0)
    cv2.imwrite(output_path, cv2.cvtColor(final, cv2.COLOR_RGB2BGR))
    

# =========================================================
# 🔹 Combined YOLO-Seg + SegFormer Semantic Overlay
# =========================================================
def run_combined_segformer_yoloseg(input_path: str, output_path: str):
    """
    Combines SegFormer (semantic segmentation) + YOLOv8-Seg (instance segmentation)
    into one intelligent visual output.
    """

    image = cv2.imread(input_path)
    if image is None:
        print(f"❌ Error: Could not load image from {input_path}")
        return

    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb_image)
    H, W, _ = rgb_image.shape

    # =====================================================
    # 1️⃣ Run SegFormer (structure segmentation)
    # =====================================================
    inputs = processor(images=pil_image, return_tensors="pt")
    with torch.no_grad():
        outputs = seg_model(**inputs)

    logits = torch.nn.functional.interpolate(
        outputs.logits, size=pil_image.size[::-1], mode="bilinear", align_corners=False
    )
    seg_map = logits.argmax(dim=1)[0].cpu().numpy()

    CUSTOM_COLORS = {
        'wall': [255, 0, 0],
        'floor': [0, 255, 0],
        'ceiling': [255, 255, 0],
        'windowpane': [0, 255, 255],
        'door': [255, 165, 0],
        'table': [128, 0, 128],
        'cabinet': [0, 0, 255],
        'desk': [255, 105, 180],
    }

    color_mask = np.zeros_like(rgb_image)
    random.seed(42)

    ADE20K_CLASSES = [
        'wall', 'building', 'sky', 'floor', 'tree', 'ceiling', 'road', 'bed', 'windowpane',
        'grass', 'cabinet', 'sidewalk', 'person', 'earth', 'door', 'table', 'mountain',
        'plant', 'curtain', 'chair', 'car', 'water', 'painting', 'sofa', 'shelf', 'house',
        'sea', 'mirror', 'rug', 'field', 'armchair', 'seat', 'fence', 'desk', 'rock',
        'wardrobe', 'lamp', 'bathtub', 'railing', 'cushion', 'base', 'box', 'column',
        'signboard', 'chest of drawers', 'counter', 'sand', 'sink', 'skyscraper', 'fireplace',
        'refrigerator', 'grandstand', 'path', 'stairs', 'runway', 'case', 'pool table',
        'pillow', 'screen door', 'stairway', 'river', 'bridge', 'bookcase', 'blind',
        'coffee table', 'toilet', 'flower', 'book', 'hill', 'bench', 'countertop', 'stove',
        'palm', 'kitchen island', 'computer', 'swivel chair', 'boat', 'bar', 'arcade machine',
        'hovel', 'bus', 'towel', 'light', 'truck', 'tower', 'chandelier', 'awning',
        'streetlight', 'booth', 'television', 'airplane', 'dirt track', 'apparel', 'pole',
        'land', 'bannister', 'escalator', 'ottoman', 'bottle', 'buffet', 'poster', 'stage',
        'van', 'ship', 'fountain', 'conveyer belt', 'canopy', 'washer', 'plaything',
        'swimming pool', 'stool', 'barrel', 'basket', 'waterfall', 'tent', 'bag', 'minibike',
        'cradle', 'oven', 'ball', 'food', 'step', 'tank', 'trade name', 'microwave', 'pot',
        'animal', 'bicycle', 'lake', 'dishwasher', 'screen', 'blanket', 'sculpture', 'hood',
        'sconce', 'vase', 'traffic light', 'tray', 'ashcan', 'fan', 'pier', 'crt screen',
        'plate', 'monitor', 'bulletin board', 'shower', 'radiator', 'glass', 'clock', 'flag'
    ]

    for class_id, class_name in enumerate(ADE20K_CLASSES):
        mask = seg_map == class_id
        color = CUSTOM_COLORS.get(class_name, [random.randint(0, 255) for _ in range(3)])
        color_mask[mask] = color

    segformer_overlay = cv2.addWeighted(rgb_image, 0.5, color_mask, 0.5, 0)

    # =====================================================
    # 2️⃣ Run YOLOv8-Seg (object segmentation)
    # =====================================================
    results = yolo_model(rgb_image, verbose=False)
    combined = segformer_overlay.copy()

    for result in results:
        if result.masks is None:
             continue

        boxes = result.boxes
        masks = result.masks.data.cpu().numpy()
        names = yolo_model.names

        for i, mask in enumerate(masks):
            class_id = int(boxes.cls[i])
            class_name = names[class_id]

            # --- 🎨 Custom highlight colors ---
            if class_name == "chair":
                 color = (255, 105, 180)  # pink
            elif class_name == "person":
                 color = (255, 165, 0)    # orange
            else:
                 color = (0, 255, 0)      # green (default)

        # --- 🩵 Apply segmentation mask ---
            mask_resized = cv2.resize(mask, (W, H), interpolation=cv2.INTER_NEAREST)
            mask_binary = mask_resized.astype(bool)
            combined[mask_binary] = combined[mask_binary] * 0.5 + np.array(color) * 0.5

        # --- 🟩 Draw bounding box + label ---
            x1, y1, x2, y2 = map(int, boxes.xyxy[i])
            conf = float(boxes.conf[i])
            label_text = f"{class_name} {conf:.2f}"

        # Draw bounding box with same color
            cv2.rectangle(combined, (x1, y1), (x2, y2), color, 2)

        # Draw label background (black rectangle behind text)
            (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(combined, (x1, y1 - th - 6), (x1 + tw + 2, y1), (0, 0, 0), -1)

        # Put white label text
            cv2.putText(combined, label_text, (x1, y1 - 5),
                         cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)


    # Save
    cv2.imwrite(output_path, cv2.cvtColor(combined, cv2.COLOR_RGB2BGR))
    print(f"✅ Combined YOLO+SegFormer output saved: {output_path}")

# =========================================================
# 🔹Own yolomodel
# =========================================================
def run_custom_yolo_change_detection(model, before_path, after_path, output_dir, tourA, tourB):
    """
    Runs your custom YOLOv8 change detection (best.pt)
    on the stitched panoramas, saves annotated images and report.
    """

    def analyze(image_path):
        image = cv2.imread(image_path)
        if image is None:
            print(f"❌ Error: Could not load image {image_path}")
            return None, {}
        results = model(image)
        detections = sv.Detections.from_ultralytics(results[0])
        mask_annotator = sv.MaskAnnotator(opacity=0.7)
        label_annotator = sv.LabelAnnotator(text_scale=0.6, text_padding=5, text_position=sv.Position.CENTER)

        annotated = mask_annotator.annotate(scene=image.copy(), detections=detections)
        annotated = label_annotator.annotate(scene=annotated, detections=detections)

        # count detected classes
        counts = {}
        if results[0].boxes:
            for cls_id in results[0].boxes.cls:
                cls_name = model.names[int(cls_id)]
                counts[cls_name] = counts.get(cls_name, 0) + 1

        return annotated, counts

    before_img, counts_before = analyze(before_path)
    after_img, counts_after = analyze(after_path)

    before_out = os.path.join(output_dir, f"{tourA}_custom_before.jpg")
    after_out = os.path.join(output_dir, f"{tourB}_custom_after.jpg")

    cv2.imwrite(before_out, before_img)
    cv2.imwrite(after_out, after_img)

    # Compare object differences
    report = {"before": counts_before, "after": counts_after, "added": {}, "removed": {}}
    all_classes = set(counts_before.keys()) | set(counts_after.keys())

    for cls in all_classes:
        b = counts_before.get(cls, 0)
        a = counts_after.get(cls, 0)
        if a > b:
            report["added"][cls] = a - b
        elif b > a:
            report["removed"][cls] = b - a

    # Save text report
    report_path = os.path.join(output_dir, f"{tourA}_vs_{tourB}_custom_report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("📊 CHANGE DETECTION REPORT 📊\n\n")
        f.write(f"BEFORE: {counts_before}\n")
        f.write(f"AFTER: {counts_after}\n\n")
        for k, v in report["added"].items():
            f.write(f"✅ ADDED {v}x {k}\n")
        for k, v in report["removed"].items():
            f.write(f"❌ REMOVED {v}x {k}\n")

    return {
        "before_image": f"/compare_results/custom_yolo/{tourA}_custom_before.jpg",
        "after_image": f"/compare_results/custom_yolo/{tourB}_custom_after.jpg",
        "report_path": f"/compare_results/custom_yolo/{tourA}_vs_{tourB}_custom_report.txt",
        "report": report,
    }

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
    
@app.post("/compare-tours-ai")
async def compare_tours_ai(data: CompareRequest):
    pathA = os.path.join(STITCHED_DIR, f"{data.tourA}_panorama.jpg")
    pathB = os.path.join(STITCHED_DIR, f"{data.tourB}_panorama.jpg")

    if not os.path.exists(pathA) or not os.path.exists(pathB):
        raise HTTPException(status_code=400, detail="One or both panoramas not found")

    # ✅ YOLO-Segmentation (Instance Segmentation)
    yolo_A_path = os.path.join(YOLO_DIR, f"{data.tourA}_detected.jpg")
    yolo_B_path = os.path.join(YOLO_DIR, f"{data.tourB}_detected.jpg")

    run_yolo_seg(pathA, yolo_A_path)
    run_yolo_seg(pathB, yolo_B_path)
    

    # ✅ Segmentation Output Save Paths
    seg_A_path = os.path.join(SEGMENT_DIR, f"{data.tourA}_segmented.jpg")
    seg_B_path = os.path.join(SEGMENT_DIR, f"{data.tourB}_segmented.jpg")

    # ✅ SegFormer segmentation (ADE20K)
    run_segmentation(pathA, seg_A_path)
    run_segmentation(pathB, seg_B_path)
    
    # ✅ Combined YOLO + SegFormer
    combined_A_path = os.path.join(COMBINED_DIR, f"{data.tourA}_combined.jpg")
    combined_B_path = os.path.join(COMBINED_DIR, f"{data.tourB}_combined.jpg")

    run_combined_segformer_yoloseg(pathA, combined_A_path)
    run_combined_segformer_yoloseg(pathB, combined_B_path)
    
    # ✅ 🆕 Custom YOLOv8 (best.pt) — Change Detection
    custom_result = run_custom_yolo_change_detection(
        model=custom_yolo_model,
        before_path=pathA,
        after_path=pathB,
        output_dir=CUSTOM_YOLO_DIR,
        tourA=data.tourA,
        tourB=data.tourB
    )

    print("Returning:", {
        "yolo": {
            "tourA": f"/compare_results/yolo/{data.tourA}_detected.jpg",
            "tourB": f"/compare_results/yolo/{data.tourB}_detected.jpg"
        },
        "segmentation": {
            "tourA": f"/compare_results/segmentation/{data.tourA}_segmented.jpg",
            "tourB": f"/compare_results/segmentation/{data.tourB}_segmented.jpg"
        },
        "combined": {
            "tourA": f"/compare_results/combined/{data.tourA}_combined.jpg",
            "tourB": f"/compare_results/combined/{data.tourB}_combined.jpg"
        },
        "custom_yolo": custom_result
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
        },
        "combined": {
            "tourA": f"/compare_results/combined/{data.tourA}_combined.jpg",
            "tourB": f"/compare_results/combined/{data.tourB}_combined.jpg"
        },
        "custom_yolo": custom_result
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
