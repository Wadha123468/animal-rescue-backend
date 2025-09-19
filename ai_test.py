import json
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_service import classify_animal

# Test with a simple base64 image (1x1 pixel PNG)
test_image = "134.jpeg"

result = classify_animal(test_image)
print("Test Result:")
print(json.dumps(result, indent=2))
