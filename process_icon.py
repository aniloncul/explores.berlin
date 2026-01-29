
from PIL import Image, ImageOps
import os

source = "/Volumes/2TBSSD/anilexternal/.gemini/antigravity/brain/a01e2ee2-6e9f-4b85-aa14-ce4429505fdd/bullet_disco_bear_1769708441879.png"
destination = "public/newsletter/assets/bullet-disco-bear.png"

img = Image.open(source).convert("RGBA")

# Make background transparent (Assuming white background)
data = img.getdata()
new_data = []
for item in data:
    if item[0] > 200 and item[1] > 200 and item[2] > 200:
        new_data.append((255, 255, 255, 0))  # Transparent
    else:
        new_data.append(item)

img.putdata(new_data)

# Crop excess transparent space
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

# Resize to icon size (e.g. 48x48)
img = img.resize((48, 48), Image.Resampling.LANCZOS)

# Ensure directory exists
os.makedirs(os.path.dirname(destination), exist_ok=True)
img.save(destination)
print(f"Processed disco bear icon saved to {destination}")
