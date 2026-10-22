import math
from typing import Dict, Any, Optional, Tuple

CAMPUS_BUILDINGS = [
    {"id": "bldg_1", "name": "Staff Quarters", "start": {"x": 2, "y": 2}, "end": {"x": 11, "y": 9}, "type": "hostel", "zone": "Residential Zone", "door": {"x": 7, "y": 10}},
    {"id": "bldg_2", "name": "Medical Center", "start": {"x": 14, "y": 2}, "end": {"x": 21, "y": 9}, "type": "medical", "zone": "Health & Emergency Zone", "door": {"x": 18, "y": 10}},
    {"id": "bldg_3", "name": "Food Court", "start": {"x": 30, "y": 2}, "end": {"x": 41, "y": 11}, "type": "food", "zone": "Student Amenities Zone", "door": {"x": 36, "y": 12}},
    {"id": "bldg_4", "name": "Computer Science Building", "start": {"x": 45, "y": 2}, "end": {"x": 56, "y": 9}, "type": "classroom", "zone": "Academic Block A", "door": {"x": 51, "y": 10}},
    {"id": "bldg_5", "name": "Generator & Power Room", "start": {"x": 66, "y": 2}, "end": {"x": 73, "y": 7}, "type": "utility", "zone": "Critical Utilities Zone", "door": {"x": 70, "y": 8}},
    {"id": "bldg_6", "name": "Girls Hostel", "start": {"x": 76, "y": 2}, "end": {"x": 87, "y": 13}, "type": "hostel", "zone": "Residential Zone", "door": {"x": 82, "y": 14}},
    {"id": "bldg_7", "name": "Administrative Building", "start": {"x": 96, "y": 2}, "end": {"x": 115, "y": 13}, "type": "admin", "zone": "Central Administration", "door": {"x": 106, "y": 14}},
    {"id": "bldg_8", "name": "Security & Control Room", "start": {"x": 45, "y": 90}, "end": {"x": 52, "y": 95}, "type": "security", "zone": "Main Campus Gate Area", "door": {"x": 52, "y": 92}},
    {"id": "bldg_9", "name": "Central Library", "start": {"x": 5, "y": 28}, "end": {"x": 19, "y": 37}, "type": "library", "zone": "Central Knowledge Hub", "door": {"x": 12, "y": 38}},
    {"id": "bldg_10", "name": "Microbiology Department", "start": {"x": 5, "y": 40}, "end": {"x": 16, "y": 47}, "type": "classroom", "zone": "Life Sciences Complex", "door": {"x": 11, "y": 48}},
    {"id": "bldg_11", "name": "Chemistry Department", "start": {"x": 30, "y": 28}, "end": {"x": 41, "y": 37}, "type": "classroom", "zone": "Science Block 1", "door": {"x": 36, "y": 38}},
    {"id": "bldg_12", "name": "Economics Department", "start": {"x": 45, "y": 28}, "end": {"x": 56, "y": 37}, "type": "classroom", "zone": "Social Sciences Block", "door": {"x": 51, "y": 38}},
    {"id": "bldg_13", "name": "Physics Department", "start": {"x": 30, "y": 40}, "end": {"x": 41, "y": 47}, "type": "classroom", "zone": "Science Block 2", "door": {"x": 36, "y": 48}},
    {"id": "bldg_14", "name": "Computer Applications Building", "start": {"x": 45, "y": 40}, "end": {"x": 56, "y": 47}, "type": "classroom", "zone": "IT Complex", "door": {"x": 51, "y": 48}},
    {"id": "bldg_15", "name": "Main University Auditorium", "start": {"x": 66, "y": 30}, "end": {"x": 85, "y": 44}, "type": "auditorium", "zone": "Cultural & Convention Center", "door": {"x": 76, "y": 45}},
    {"id": "bldg_16", "name": "Boys Hostel", "start": {"x": 96, "y": 30}, "end": {"x": 110, "y": 47}, "type": "hostel", "zone": "Residential Zone", "door": {"x": 103, "y": 48}},
    {"id": "bldg_17", "name": "Innovation & Robotics Lab", "start": {"x": 5, "y": 56}, "end": {"x": 19, "y": 65}, "type": "classroom", "zone": "Engineering & Innovation", "door": {"x": 12, "y": 66}},
    {"id": "bldg_18", "name": "Campus Data Center", "start": {"x": 5, "y": 68}, "end": {"x": 19, "y": 77}, "type": "utility", "zone": "Critical IT Infrastructure", "door": {"x": 12, "y": 78}},
    {"id": "bldg_19", "name": "Cricket Nets", "start": {"x": 30, "y": 56}, "end": {"x": 41, "y": 67}, "type": "sports", "zone": "Athletics Complex", "door": {"x": 36, "y": 68}},
    {"id": "bldg_20", "name": "Hockey Field", "start": {"x": 45, "y": 56}, "end": {"x": 56, "y": 67}, "type": "sports", "zone": "Athletics Complex", "door": {"x": 51, "y": 68}},
    {"id": "bldg_21", "name": "Main Sports Ground", "start": {"x": 30, "y": 70}, "end": {"x": 54, "y": 78}, "type": "sports", "zone": "Outdoor Sports Arena", "door": {"x": 42, "y": 79}},
    {"id": "bldg_22", "name": "Indoor Stadium", "start": {"x": 66, "y": 56}, "end": {"x": 80, "y": 70}, "type": "sports", "zone": "Sports & Recreation Center", "door": {"x": 73, "y": 71}},
    {"id": "bldg_23", "name": "Botanical Garden", "start": {"x": 66, "y": 73}, "end": {"x": 80, "y": 78}, "type": "park", "zone": "Eco & Garden Sector", "door": {"x": 73, "y": 79}},
    {"id": "bldg_24", "name": "Eco Park", "start": {"x": 96, "y": 56}, "end": {"x": 115, "y": 65}, "type": "park", "zone": "Environmental Green Belt", "door": {"x": 106, "y": 66}},
    {"id": "bldg_25", "name": "College of Education", "start": {"x": 96, "y": 68}, "end": {"x": 115, "y": 77}, "type": "classroom", "zone": "Faculty of Education", "door": {"x": 106, "y": 78}},
]

def get_compass_bearing(from_x: float, from_y: float, to_x: float, to_y: float) -> str:
    dx = to_x - from_x
    dy = to_y - from_y
    if abs(dx) < 1.0 and abs(dy) < 1.0:
        return "at"
    
    # Calculate angle in degrees (screen coordinates: y increases downwards / southwards)
    angle = math.degrees(math.atan2(dy, dx))
    
    if -22.5 <= angle < 22.5:
        return "East"
    elif 22.5 <= angle < 67.5:
        return "South-East"
    elif 67.5 <= angle < 112.5:
        return "South"
    elif 112.5 <= angle < 157.5:
        return "South-West"
    elif angle >= 157.5 or angle < -157.5:
        return "West"
    elif -157.5 <= angle < -112.5:
        return "North-West"
    elif -112.5 <= angle < -67.5:
        return "North"
    else:
        return "North-East"

def resolve_location(x: float, y: float, floor: int = 0) -> Dict[str, Any]:
    """
    Identifies the building, zone, or nearest campus landmark for a given (x, y) coordinate.
    Strictly prevents hallucinating non-existent room numbers.
    """
    rx = round(x)
    ry = round(y)
    
    # 1. Check if directly inside any building perimeter
    for bldg in CAMPUS_BUILDINGS:
        sx, sy = bldg["start"]["x"], bldg["start"]["y"]
        ex, ey = bldg["end"]["x"], bldg["end"]["y"]
        if sx <= rx <= ex and sy <= ry <= ey:
            return {
                "is_inside_building": True,
                "building_id": bldg["id"],
                "building_name": bldg["name"],
                "zone": bldg["zone"],
                "building_type": bldg["type"],
                "floor": f"Ground Floor (Level {floor})",
                "door_coordinate": bldg["door"],
                "coordinates": {"x": rx, "y": ry, "floor": floor},
                "display_location": f"{bldg['name']} ({bldg['zone']})",
                "speech_location": f"{bldg['name']} in the {bldg['zone']}"
            }
            
    # 2. Coordinates are on outdoor pathways, roads, or grounds.
    # Find the nearest building center to provide precise, realistic landmark context.
    nearest_bldg = None
    min_dist = float("inf")
    
    for bldg in CAMPUS_BUILDINGS:
        cx = (bldg["start"]["x"] + bldg["end"]["x"]) / 2.0
        cy = (bldg["start"]["y"] + bldg["end"]["y"]) / 2.0
        dist = math.hypot(x - cx, y - cy)
        if dist < min_dist:
            min_dist = dist
            nearest_bldg = bldg
            
    if nearest_bldg:
        cx = (nearest_bldg["start"]["x"] + nearest_bldg["end"]["x"]) / 2.0
        cy = (nearest_bldg["start"]["y"] + nearest_bldg["end"]["y"]) / 2.0
        bearing = get_compass_bearing(cx, cy, x, y)
        dist_meters = round(min_dist, 1)
        
        display_str = f"Outdoor Pathway ~{dist_meters}m {bearing} of {nearest_bldg['name']}"
        speech_str = f"Outdoor pathway approximately {int(dist_meters)} meters {bearing} of {nearest_bldg['name']}"
        
        return {
            "is_inside_building": False,
            "building_id": nearest_bldg["id"],
            "building_name": nearest_bldg["name"],
            "zone": nearest_bldg["zone"],
            "building_type": "outdoor_pathway",
            "floor": "Campus Ground Level",
            "door_coordinate": nearest_bldg["door"],
            "nearest_distance_meters": dist_meters,
            "relative_direction": bearing,
            "coordinates": {"x": rx, "y": ry, "floor": floor},
            "display_location": display_str,
            "speech_location": speech_str
        }

    return {
        "is_inside_building": False,
        "building_id": "campus_sector",
        "building_name": "University Campus Grounds",
        "zone": "General Campus Area",
        "building_type": "grounds",
        "floor": "Ground Level",
        "coordinates": {"x": rx, "y": ry, "floor": floor},
        "display_location": f"Campus Grid Coordinates ({rx}, {ry})",
        "speech_location": f"Campus grounds at coordinates {rx}, {ry}"
    }
