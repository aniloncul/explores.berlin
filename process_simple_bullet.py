
from PIL import Image
import os

source = "/Volumes/2TBSSD/anilexternal/.gemini/antigravity/brain/a01e2ee2-6e9f-4b85-aa14-ce4429505fdd/thin_chrome_x_bullet_1769709479961.png"
destination = "public/newsletter/assets/bullet-chrome-x.png"

img = Image.open(source).convert("RGBA")

# Remove Black Background
data = img.getdata()
new_data = []
for item in data:
    if item[0] < 50 and item[1] < 50 and item[2] < 50:
        new_data.append((0, 0, 0, 0))
    else:
        new_data.append(item)
img.putdata(new_data)

# Crop
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

# Resize to icon size (20x20 - a bit smaller for simple text bullet)
img = img.resize((20, 20), Image.Resampling.LANCZOS)

# Ensure directory exists
os.makedirs(os.path.dirname(destination), exist_ok=True)
img.save(destination)
print(f"Processed simple chrome x bullet saved to {destination}")
