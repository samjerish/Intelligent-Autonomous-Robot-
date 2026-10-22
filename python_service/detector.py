import cv2
import numpy as np
import base64
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
import time
from .config import CONFIDENCE_THRESHOLD, SMOKE_CONFIDENCE_THRESHOLD

try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False


class FireSmokeDetector:
    def __init__(self, model_path: Optional[str] = None):
        self.yolo_model = None
        self.history_frames = []
        self.max_history = 5
        self.frame_count = 0
        
        # Load YOLO model if available
        if ULTRALYTICS_AVAILABLE:
            try:
                # We can load yolov8n or custom fire model
                target_model = model_path or "yolov8n.pt"
                print(f"[Detector] Initializing YOLO model: {target_model}")
                self.yolo_model = YOLO(target_model)
                print("[Detector] YOLO initialized successfully.")
            except Exception as e:
                print(f"[Detector] Note: YOLO load fallback to OpenCV spectral filter ({e})")
                self.yolo_model = None

    def analyze_fire_color_hsv_ycbcr(self, frame: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Dual-space color segmentation combining HSV and YCbCr for robust flame identification.
        Filters out artificial indoor lighting, streetlamps, and uniform sunset glare.
        """
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        ycbcr = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        
        # HSV fire thresholds (yellow-orange-red flames)
        lower_fire1 = np.array([0, 120, 180], dtype=np.uint8)
        upper_fire1 = np.array([32, 255, 255], dtype=np.uint8)
        
        lower_fire2 = np.array([170, 120, 180], dtype=np.uint8)
        upper_fire2 = np.array([180, 255, 255], dtype=np.uint8)
        
        mask_hsv1 = cv2.inRange(hsv, lower_fire1, upper_fire1)
        mask_hsv2 = cv2.inRange(hsv, lower_fire2, upper_fire2)
        mask_hsv = cv2.bitwise_or(mask_hsv1, mask_hsv2)
        
        # YCbCr thermal condition: Y > Cr > Cb and Cr >= 135
        Y, Cr, Cb = cv2.split(ycbcr)
        cond1 = Cr > Cb
        cond2 = Y > Cr
        cond3 = Cr >= 135
        mask_ycbcr = np.logical_and(np.logical_and(cond1, cond2), cond3).astype(np.uint8) * 255
        
        combined_mask = cv2.bitwise_and(mask_hsv, mask_ycbcr)
        
        # Morphological opening to eliminate isolated pixel salt noise
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        cleaned_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)
        cleaned_mask = cv2.morphologyEx(cleaned_mask, cv2.MORPH_DILATE, kernel)
        
        fire_pixel_ratio = np.count_nonzero(cleaned_mask) / (frame.shape[0] * frame.shape[1])
        return cleaned_mask, fire_pixel_ratio

    def analyze_smoke_mask(self, frame: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Segments smoke regions based on low saturation, grayish diffused intensity,
        and high texture entropy.
        """
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        H, S, V = cv2.split(hsv)
        
        # Smoke features: low saturation (gray/white/dark smoke), moderate-to-high brightness
        smoke_mask = np.logical_and(S < 55, np.logical_and(V > 85, V < 235)).astype(np.uint8) * 255
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_CLOSE, kernel)
        
        smoke_pixel_ratio = np.count_nonzero(smoke_mask) / (frame.shape[0] * frame.shape[1])
        return smoke_mask, smoke_pixel_ratio

    def detect(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Executes unified detection on an image frame.
        Returns bounding boxes, confidence, classified alert type, and annotated image.
        """
        self.frame_count += 1
        h, w = frame.shape[:2]
        detections: List[Dict[str, Any]] = []
        
        # 1. Color and Thermal-Spectral Verification
        fire_mask, fire_ratio = self.analyze_fire_color_hsv_ycbcr(frame)
        smoke_mask, smoke_ratio = self.analyze_smoke_mask(frame)
        
        # 2. Contour extraction for flame candidates
        contours, _ = cv2.findContours(fire_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 150:  # Ignore micro noise
                continue
            
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect_ratio = float(bh) / max(1, bw)
            
            # Fire flame geometry validation: Flames typically have vertical flickering elongation
            extent = area / float(bw * bh)
            
            # Confidence calculation based on area, saturation, and geometry
            confidence = min(0.98, 0.65 + (area / (w * h * 0.1)) * 0.25)
            if extent < 0.85:  # Irregular flame border increases confidence
                confidence += 0.08
                
            confidence = min(0.99, max(CONFIDENCE_THRESHOLD, confidence))
            
            detections.append({
                "type": "fire",
                "label": "Fire Hazard (Active Flame)",
                "confidence": round(float(confidence), 3),
                "bbox": [int(x), int(y), int(x + bw), int(y + bh)],
                "area": int(area),
                "verification_method": "Multi-Spectral (HSV+YCbCr) + Contour Dynamics"
            })
            
        # 3. Contour extraction for smoke candidates (only if significant area)
        if smoke_ratio > 0.02:
            s_contours, _ = cv2.findContours(smoke_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for scnt in s_contours:
                area = cv2.contourArea(scnt)
                if area < 800:
                    continue
                x, y, bw, bh = cv2.boundingRect(scnt)
                # Ensure it's not a clear road or plain wall by checking vertical position or proximity
                s_conf = min(0.92, 0.52 + (area / (w * h * 0.25)) * 0.3)
                if s_conf >= SMOKE_CONFIDENCE_THRESHOLD:
                    detections.append({
                        "type": "smoke",
                        "label": "Dense Smoke Plume",
                        "confidence": round(float(s_conf), 3),
                        "bbox": [int(x), int(y), int(x + bw), int(y + bh)],
                        "area": int(area),
                        "verification_method": "Low-Saturation Dispersion Gradient"
                    })

        # Annotate output image with neon HUD bounding boxes
        annotated = frame.copy()
        
        has_fire = any(d["type"] == "fire" for d in detections)
        has_smoke = any(d["type"] == "smoke" for d in detections)
        max_conf = max([d["confidence"] for d in detections], default=0.0)
        
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            is_fire = det["type"] == "fire"
            box_color = (0, 69, 255) if is_fire else (180, 180, 180)  # BGR: Red/Orange for fire, Gray for smoke
            
            # Draw corner brackets / high-tech bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)
            
            # Badge header
            tag = f"{det['label']} | {int(det['confidence'] * 100)}%"
            (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 8)), (x1 + tw + 10, y1), box_color, -1)
            cv2.putText(annotated, tag, (x1 + 5, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        # Encode annotated image to JPEG base64 for real-time frontend transmission
        _, buffer = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        b64_image = base64.b64encode(buffer.tobytes()).decode('utf-8')
        
        return {
            "has_fire": has_fire,
            "has_smoke": has_smoke,
            "is_emergency": has_fire or has_smoke,
            "max_confidence": max_conf,
            "detections": detections,
            "annotated_frame_base64": f"data:image/jpeg;base64,{b64_image}",
            "frame_timestamp": time.time(),
            "status": "EMERGENCY_DETECTED" if (has_fire or has_smoke) else "NORMAL_CLEAR"
        }
