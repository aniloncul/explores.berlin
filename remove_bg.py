from PIL import Image
import numpy as np
import os

def remove_black_background(input_path, output_path, threshold=30):
    if not os.path.exists(input_path):
        print(f"Error: Input file not found at {input_path}")
        # Try finding it in public directly if running from root
        if os.path.exists("./public/disco-bear-sigil.png"):
            input_path = "./public/disco-bear-sigil.png"
        else:
            return

    img = Image.open(input_path).convert("RGBA")
    data = np.array(img)
    
    # Extract RGB channels
    r, g, b, a = data.T
    
    # Identify black pixels
    black_areas = (r < threshold) & (g < threshold) & (b < threshold)
    
    # Set Alpha channel to 0 for black pixels
    data[..., 3][black_areas.T] = 0
    
    # Create new image
    new_img = Image.fromarray(data)
    new_img.save(output_path)
    print(f"Saved transparent image to {output_path}")

if __name__ == "__main__":
    # Relative path since we are running from the root
    input_file = "./public/disco-bear-sigil.png"
    remove_black_background(input_file, input_file)
