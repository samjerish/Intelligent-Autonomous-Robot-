import time
import uuid
import base64
from typing import Dict, Any, List, Optional
from pathlib import Path
from .config import SNAPSHOT_DIR, DEDUPLICATION_WINDOW_SECONDS
from .location_resolver import resolve_location
from .alert_dispatcher import AlertDispatcher

class EmergencyManager:
    def __init__(self):
        self.active_incident: Optional[Dict[str, Any]] = None
        self.incident_history: List[Dict[str, Any]] = []
        self.dispatcher = AlertDispatcher()
        self.last_detection_time: Dict[str, float] = {}

    def process_detection(
        self,
        detection_result: Dict[str, Any],
        robot_coords: Dict[str, Any],
        hazard_coords: Optional[Dict[str, Any]] = None,
        raw_frame_b64: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Processes a raw detection frame. If fire or dense smoke is verified,
        resolves the location, checks deduplication, triggers alerts immediately,
        and saves image evidence.
        """
        if not detection_result.get("is_emergency", False):
            return None

        # Coordinates to resolve: prefer hazard's specific coordinate if known, otherwise robot's position
        target_pos = hazard_coords if hazard_coords else robot_coords
        x = float(target_pos.get("x", 0))
        y = float(target_pos.get("y", 0))
        floor = int(target_pos.get("floor", 0))
        
        resolved_loc = resolve_location(x, y, floor)
        bldg_key = resolved_loc.get("building_id", f"{int(x)}_{int(y)}")
        
        now = time.time()
        last_time = self.last_detection_time.get(bldg_key, 0)
        
        # Determine detection type
        has_fire = detection_result.get("has_fire", False)
        has_smoke = detection_result.get("has_smoke", False)
        if has_fire and has_smoke:
            det_type = "Active Fire & Smoke Hazard"
        elif has_fire:
            det_type = "Active Fire Hazard"
        else:
            det_type = "Dense Smoke Hazard"

        # Check deduplication window
        if self.active_incident and (now - last_time < DEDUPLICATION_WINDOW_SECONDS):
            if self.active_incident.get("location", {}).get("building_id") == bldg_key:
                # Update existing incident telemetry rather than duplicating
                self.active_incident["confidence"] = max(
                    self.active_incident["confidence"],
                    detection_result.get("max_confidence", 0.9)
                )
                self.active_incident["last_seen_timestamp"] = now
                self.active_incident["snapshot_base64"] = detection_result.get("annotated_frame_base64", self.active_incident.get("snapshot_base64"))
                return self.active_incident

        # New Credible Incident Detected!
        incident_id = f"INC-{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        self.last_detection_time[bldg_key] = now
        
        # Save snapshot evidence to disk
        snapshot_filename = f"{incident_id}.jpg"
        snapshot_path = SNAPSHOT_DIR / snapshot_filename
        
        snapshot_b64 = detection_result.get("annotated_frame_base64", "")
        if snapshot_b64 and "," in snapshot_b64:
            try:
                img_data = base64.b64decode(snapshot_b64.split(",")[1])
                with open(snapshot_path, "wb") as f:
                    f.write(img_data)
            except Exception as e:
                print(f"[EmergencyManager] Snapshot write error: {e}")

        # Compute safe standoff position for the robot
        # Robot must observe safely from ~6 units away outside the danger perimeter
        dx = robot_coords.get("x", 0) - x
        dy = robot_coords.get("y", 0) - y
        dist = max(1.0, (dx*dx + dy*dy)**0.5)
        safe_dist = 7.0
        safe_x = round(x + (dx / dist) * safe_dist)
        safe_y = round(y + (dy / dist) * safe_dist)

        incident_record: Dict[str, Any] = {
            "id": incident_id,
            "status": "ACTIVE_EMERGENCY",
            "detection_type": det_type,
            "confidence": detection_result.get("max_confidence", 0.95),
            "detections": detection_result.get("detections", []),
            "timestamp": now,
            "timestamp_formatted": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
            "last_seen_timestamp": now,
            "location": resolved_loc,
            "robot_position": robot_coords,
            "safe_observation_point": {"x": safe_x, "y": safe_y, "f": floor},
            "snapshot_filename": snapshot_filename,
            "snapshot_base64": snapshot_b64,
            "acknowledgement": {
                "is_acknowledged": False,
                "acknowledged_by": None,
                "acknowledged_at": None
            },
            "notifications": {
                "sms_status": "pending",
                "voice_status": "pending",
                "dispatch_details": None
            }
        }

        # Dispatch immediate Automated Voice Call and SMS notification
        dispatch_res = self.dispatcher.dispatch_emergency_notifications(incident_record)
        incident_record["notifications"]["sms_status"] = dispatch_res["sms"]["status"]
        incident_record["notifications"]["voice_status"] = dispatch_res["voice_call"]["status"]
        incident_record["notifications"]["dispatch_details"] = dispatch_res

        self.active_incident = incident_record
        self.incident_history.insert(0, incident_record)
        return incident_record

    def acknowledge_incident(self, incident_id: str, operator_name: Optional[str] = "Control Room Operator") -> Optional[Dict[str, Any]]:
        op_name = operator_name or "Control Room Operator"
        target = None
        if self.active_incident and self.active_incident["id"] == incident_id:
            target = self.active_incident
        else:
            for inc in self.incident_history:
                if inc["id"] == incident_id:
                    target = inc
                    break

        if target:
            target["acknowledgement"] = {
                "is_acknowledged": True,
                "acknowledged_by": op_name,
                "acknowledged_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            target["status"] = "ACKNOWLEDGED"
            return target
        return None

    def resolve_active_incident(self, incident_id: str) -> Optional[Dict[str, Any]]:
        if self.active_incident and self.active_incident["id"] == incident_id:
            self.active_incident["status"] = "RESOLVED"
            resolved = self.active_incident
            self.active_incident = None
            return resolved
        return None
