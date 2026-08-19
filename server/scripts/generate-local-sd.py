import os
import sys
import torch
from diffusers import StableDiffusionPipeline

# Fix encoding for Windows command line stdout
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

def main():
    print("====================================================")
    print("   Local Lightweight Text-to-Image Generation (SD)")
    print("====================================================\n")

    # Default novel adaptation English prompt
    prompt = (
        "Lin Dong, a young Chinese male protagonist with short black hair and a resolute expression, "
        "wearing a simple traditional robe, gazing at a massive ancient tomb covered with crackling "
        "blue lightning. Chinese anime style, highly detailed."
    )
    if len(sys.argv) > 1 and sys.argv[1].strip():
        prompt = sys.argv[1].strip()

    print(f"[Prompt] -> \"{prompt}\"\n")
    print("Loading model (segmind/tiny-sd) from Hugging Face...")
    print("Info: This model is very small (~720MB) and ideal for local PCs.")
    print("      First run will download weights. Subsequent runs will start instantly.")

    # Detect hardware acceleration
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[Device] Running on: {device.upper()}")
    if device == "cpu":
        print("Warning: No NVIDIA GPU detected, using CPU. Drawing may take 1-2 minutes...")

    try:
        # Load lightweight SD 1.5 model
        pipe = StableDiffusionPipeline.from_pretrained(
            "segmind/tiny-sd",
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            safety_checker=None
        )
        pipe = pipe.to(device)

        print("\n[Start] Drawing image...")
        steps = 15 if device == "cpu" else 25
        result = pipe(prompt, num_inference_steps=steps)
        image = result.images[0]

        # Write output file
        output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tests/output"))
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "smoke_test_local_sd.png")
        image.save(output_path)

        print("\n====================================================")
        print("Success! Image generated successfully.")
        print(f"Output image path: {output_path}")
        print("====================================================")

    except Exception as e:
        print(f"\nError: {str(e)}")

if __name__ == "__main__":
    main()
