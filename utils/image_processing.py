import numpy as np

def detect_reference_object(image_path, ref_type):
    import cv2
    """
    Simulates detection of reference object.
    Returns (x, y, w, h) of the bounding box.
    """
    # Placeholder: Return a center crop box
    # Real implementation would use cv2.findContours, etc.
    img = cv2.imread(image_path)
    if img is None:
        return None
    
    h, w = img.shape[:2]
    
    # Dummy box in the center
    center_x, center_y = w // 2, h // 2
    box_w, box_h = w // 5, h // 5
    
    return {
        "x": center_x - box_w // 2,
        "y": center_y - box_h // 2,
        "w": box_w,
        "h": box_h
    }
