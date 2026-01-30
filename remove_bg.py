from PIL import Image
import numpy as np

def remove_black_background(input_path, output_path, threshold=30):
    try:
        img = Image.open(input_path).convert("RGBA")
        data = np.array(img)
        
        # Extract RGB channels
        r, g, b, a = data.T
        
        # Identify black pixels (where all R, G, B are below threshold)
        black_areas = (r < threshold) & (g < threshold) & (b < threshold)
        
        # Set Alpha channel to 0 for black pixels
        data[..., 3][black_areas.T] = 0
        
        # Create new image
        new_img = Image.fromarray(data)
        new_img.save(output_path)
        print(f"Saved transparent image to {output_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

if __name__ == "__main__":
    # Correct file name
    input_file = "./public/rave-bear-black.png"
    print(f"Processing {input_file}...")
    remove_black_background(input_file, input_file)
