import os
import torch
import numpy as np
import subprocess
import platform
import random
from PIL import Image, ImageOps
from diffusers import (
    StableDiffusionPipeline, 
    StableDiffusionImg2ImgPipeline, 
    StableDiffusionControlNetPipeline, 
    ControlNetModel,
    UniPCMultistepScheduler
)

class EpaperAIGenerator:
    def __init__(self):
        self.device = "cpu"
        self.model_id = "runwayml/stable-diffusion-v1-5"
        self.controlnet_id = "lllyasviel/sd-controlnet-scribble"
        
        # Pipelines (lazy-loaded)
        self.pipe_txt2img = None
        self.pipe_img2img = None
        self.pipe_scribble = None
        self.controlnet = None
        
        # Real-time Status Tracking
        self.current_status = "idle"
        self.current_message = ""

    def _init_txt2img(self):
        """Initialize the base text-to-image pipeline and apply memory optimizations."""
        if self.pipe_txt2img is None:
            self.current_status = "downloading_base"
            self.current_message = "Loading or downloading SD 1.5 base model (about 5GB, it will take a long time for the first execution)..."
            print("Loading Base Stable Diffusion v1.5 pipeline...")
            # We disable safety_checker to save ~600MB of RAM and prevent false positives
            self.pipe_txt2img = StableDiffusionPipeline.from_pretrained(
                self.model_id,
                safety_checker=None,
                requires_safety_checker=False,
                torch_dtype=torch.float32
            )
            # Use UniPCMultistepScheduler for faster generation on CPU
            self.pipe_txt2img.scheduler = UniPCMultistepScheduler.from_config(self.pipe_txt2img.scheduler.config)
            self.pipe_txt2img = self.pipe_txt2img.to(self.device)
            self.pipe_txt2img.enable_attention_slicing()
        return self.pipe_txt2img

    def _init_img2img(self):
        """Initialize image-to-image pipeline by sharing weights from the base pipeline."""
        if self.pipe_img2img is None:
            self.current_status = "loading_img2img"
            self.current_message = "Loading or downloading Image-to-Image module (about 5GB, it will take a long time for the first execution)..."
            base = self._init_txt2img()
            print("Initializing Image-to-Image pipeline (sharing weights)...")
            self.pipe_img2img = StableDiffusionImg2ImgPipeline(
                vae=base.vae,
                text_encoder=base.text_encoder,
                tokenizer=base.tokenizer,
                unet=base.unet,
                scheduler=base.scheduler,
                safety_checker=None,
                feature_extractor=None,
                requires_safety_checker=False
            ).to(self.device)
            self.pipe_img2img.enable_attention_slicing()
        return self.pipe_img2img

    def _init_scribble(self):
        """Initialize ControlNet Scribble pipeline by sharing weights from the base pipeline."""
        if self.pipe_scribble is None:
            self.current_status = "loading_scribble"
            self.current_message = "Loading or downloading ControlNet Scribble module (about 5GB, it will take a long time for the first execution)..."
            base = self._init_txt2img()
            print("Loading ControlNet Scribble model...")
            self.controlnet = ControlNetModel.from_pretrained(
                self.controlnet_id,
                torch_dtype=torch.float32
            ).to(self.device)
            
            self.current_status = "initializing_scribble"
            self.current_message = "Loading or downloading ControlNet Scribble module (about 5GB, it will take a long time for the first execution)..."
            print("Initializing ControlNet Scribble pipeline (sharing weights)...")
            self.pipe_scribble = StableDiffusionControlNetPipeline(
                vae=base.vae,
                text_encoder=base.text_encoder,
                tokenizer=base.tokenizer,
                unet=base.unet,
                controlnet=self.controlnet,
                scheduler=base.scheduler,
                safety_checker=None,
                feature_extractor=None,
                requires_safety_checker=False
            ).to(self.device)
            self.pipe_scribble.enable_attention_slicing()
        return self.pipe_scribble

    def _generate_via_onnxstream(self, prompt: str, negative_prompt: str, steps: int, seed: int) -> Image.Image:
        """Execute OnnxStream CLI to run SDXL Turbo text2img generation."""
        self.current_status = "generating"
        self.current_message = "Generating image using OnnxStream engine (estimated 1~2 minutes)..."
        is_windows = platform.system() == "Windows"
        executable = "sd.exe" if is_windows else "./sd"
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        exec_path = os.path.join(base_dir, executable)
        
        if not os.path.exists(exec_path):
            if os.path.exists(executable):
                exec_path = executable
            else:
                raise FileNotFoundError(
                    f"OnnxStream executable not found at '{exec_path}'. "
                    f"Please run the build script (build_win.bat or build_linux.sh) first."
                )
        
        if seed == -1:
            seed = random.randint(0, 1000000)
            
        output_dir = os.path.join(base_dir, "processed")
        os.makedirs(output_dir, exist_ok=True)
        temp_output = os.path.join(output_dir, f"temp_onnxstream_{int(os.getpid())}.png")
        
        cmd = [
            exec_path,
            "--models-path", os.path.join(base_dir, "models"),
            "--prompt", prompt,
            "--steps", str(steps),
            "--seed", str(seed),
            "--turbo",
            "--xl",
            "--output", temp_output
        ]
        
        if negative_prompt:
            cmd.extend(["--neg-prompt", negative_prompt])
            
        print(f"Running OnnxStream command: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(
                cmd,
                cwd=base_dir,
                capture_output=True,
                text=True,
                check=True
            )
            print("OnnxStream stdout:", result.stdout)
        except subprocess.CalledProcessError as e:
            print("OnnxStream stderr:", e.stderr)
            print("OnnxStream stdout:", e.stdout)
            raise RuntimeError(f"OnnxStream generation failed: {e.stderr or e.stdout or str(e)}")
            
        if not os.path.exists(temp_output):
            raise FileNotFoundError(f"OnnxStream execution finished, but output file '{temp_output}' was not created.")
            
        try:
            img = Image.open(temp_output)
            img.load()  # Load image data into memory
            return img
        finally:
            try:
                os.remove(temp_output)
            except Exception as ex:
                print(f"Error removing temp file {temp_output}: {ex}")

    def unload_pytorch(self):
        """Unload PyTorch models and run garbage collection to free up memory."""
        print("Unloading PyTorch pipelines to free RAM...")
        self.pipe_txt2img = None
        self.pipe_img2img = None
        self.pipe_scribble = None
        self.controlnet = None
        
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def generate(self, prompt: str, negative_prompt: str = "", mode: str = "text", 
                 steps: int = 20, seed: int = -1, strength: float = 0.75, 
                 input_image: Image.Image = None) -> Image.Image:
        """
        Generate an art image based on prompt and mode.
        - mode: "text" (OnnxStream SDXL Turbo), "img2img" (diffusers SD 1.5), or "scribble" (diffusers SD 1.5 ControlNet)
        - steps: number of inference steps
        - seed: random seed (-1 for random)
        - strength: image-to-image strength (0.0 to 1.0)
        - input_image: PIL Image used for img2img or scribble modes
        """
        print(f"Generating image. Mode: {mode}, Prompt: '{prompt}', Steps: {steps}, Seed: {seed}")
        self.current_status = "starting"
        self.current_message = "Loading or downloading SD 1.5 base model (about 5GB, it will take a long time for the first execution)..."
        
        if mode == "text":
            try:
                # Call OnnxStream SDXL Turbo path
                return self._generate_via_onnxstream(prompt, negative_prompt, steps, seed)
            finally:
                self.current_status = "idle"
                self.current_message = ""
            
        # Standard input resolution for SD v1.5 is 512x512
        width = 512
        height = 512
        
        # Set seed for PyTorch
        if seed == -1:
            generator = None
        else:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        try:
            if mode == "img2img":
                if input_image is None:
                    raise ValueError("Input image is required for img2img mode")
                
                pipe = self._init_img2img()
                ref_image = input_image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                
                self.current_status = "generating"
                self.current_message = "Generating image using PyTorch CPU (estimated 2~3 minutes)..."
                result = pipe(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    image=ref_image,
                    strength=strength,
                    num_inference_steps=steps,
                    generator=generator
                )
                return result.images[0]
                
            elif mode == "scribble":
                if input_image is None:
                    raise ValueError("Scribble image is required for scribble mode")
                    
                pipe = self._init_scribble()
                doodle_inverted = ImageOps.invert(input_image.convert("L"))
                doodle = doodle_inverted.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                
                self.current_status = "generating"
                self.current_message = "AI 正在繪製圖像中 (使用 ControlNet CPU 算圖，預估 2~4 分鐘)..."
                result = pipe(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    image=doodle,
                    num_inference_steps=steps,
                    generator=generator
                )
                return result.images[0]
            else:
                raise ValueError(f"Unknown mode: {mode}")
        finally:
            # Unload PyTorch models automatically after scribble or img2img generation to free RAM
            self.unload_pytorch()
            self.current_status = "idle"
            self.current_message = ""

# Singleton generator instance
ai_generator = EpaperAIGenerator()

