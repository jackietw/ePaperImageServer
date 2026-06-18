import os
import torch
import json
import numpy as np
import random
import io
import cv2
from PIL import Image, ImageOps
from diffusers import (
    StableDiffusionPipeline, 
    StableDiffusionImg2ImgPipeline, 
    StableDiffusionControlNetPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    StableDiffusionXLControlNetPipeline,
    ControlNetModel,
    UniPCMultistepScheduler
)
from huggingface_hub import InferenceClient

def translate_to_english_if_needed(text: str) -> str:
    if not text:
        return text
    # Check if there are non-ASCII characters (e.g. Chinese, Japanese, accented characters, etc.)
    has_non_ascii = any(ord(char) >= 128 for char in text)
    if not has_non_ascii:
        return text
        
    try:
        from deep_translator import GoogleTranslator
        print(f"Detecting non-English text. Translating prompt: '{text}'")
        
        # Check for specific CJK character ranges to avoid auto-detect failures
        has_cjk = any('\u4e00' <= char <= '\u9fff' for char in text)
        has_kana = any('\u3040' <= char <= '\u30ff' for char in text)
        has_hangul = any('\uac00' <= char <= '\ud7a3' for char in text)
        
        # If it has Chinese characters but no Japanese kana/Korean hangul, prioritize zh-TW
        is_chinese = has_cjk and not has_kana and not has_hangul
        
        translated = None
        if is_chinese:
            try:
                translated = GoogleTranslator(source='zh-TW', target='en').translate(text)
            except Exception:
                pass
                
        # If not Chinese, or the zh-TW translation failed/was bypassed, try auto-detection
        if not translated or any(ord(char) >= 128 for char in translated):
            try:
                translated = GoogleTranslator(source='auto', target='en').translate(text)
            except Exception:
                pass
                
        # If translation still contains non-ASCII characters, apply explicit language fallbacks
        if translated and any(ord(char) >= 128 for char in translated):
            fallbacks = []
            if has_hangul:
                fallbacks = ['ko']
            elif has_kana:
                fallbacks = ['ja']
            elif has_cjk:
                fallbacks = ['zh-TW']
            else:
                fallbacks = ['zh-TW', 'ja', 'ko']
                
            for lang in fallbacks:
                try:
                    candidate = GoogleTranslator(source=lang, target='en').translate(text)
                    if candidate and not any(ord(char) >= 128 for char in candidate):
                        translated = candidate
                        break
                except Exception:
                    continue
                    
        if translated and not any(ord(char) >= 128 for char in translated):
            print(f"Translated to: '{translated}'")
            return translated
        else:
            print("Translation failed or returned non-English text, using original prompt.")
            return text
            
    except Exception as e:
        print("Translation failed, using original prompt:", e)
        return text

def clean_conversational_prompt(text: str) -> str:
    if not text:
        return text
    import re
    # Strip conversational prefixes (case-insensitive)
    patterns = [
        r"^(please\s+)?(help\s+me\s+)?(change|modify|turn|transform|make|replace)\s+(it|the\s+scene|the\s+image|this|scene|background)\s+(to|into|with)\s+",
        r"^(please\s+)?(help\s+me\s+)?(change|modify|turn|transform|make|replace)\s+(to|into|with)\s+",
        r"^(please\s+)?(help\s+me\s+)?(generate|draw|paint|create)\s+(a|an|the)?\s*"
    ]
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    # Capitalize the first letter if it is lowercase
    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned.strip()


class EpaperAIGenerator:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.model_id = "Lykon/dreamshaper-8"
        self.controlnet_id = "lllyasviel/sd-controlnet-scribble"
        self.controlnet_canny_id = "lllyasviel/sd-controlnet-canny"
        self.controlnet_xl_canny_id = "diffusers/controlnet-canny-sdxl-1.0"
        
        # Models path setting
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.cache_dir = os.path.join(base_dir, "models")
        self.config_path = os.path.join(base_dir, "config.json")
        
        # Optimize CPU threads for PyTorch
        try:
            num_cores = os.cpu_count()
            if num_cores:
                torch.set_num_threads(num_cores)
                print(f"Set PyTorch CPU threads to {num_cores}")
        except Exception as e:
            print("Failed to set PyTorch CPU threads:", e)
            
        # Local Pipelines (lazy-loaded)
        self.pipe_txt2img = None
        self.pipe_scribble = None
        self.pipe_controlnet_edge = None
        self.current_edge_algorithm = None
        self.pipe_img2img = None
        self.controlnet = None
        self.controlnet_canny = None
        
        # Load Hugging Face token from config.json
        self.hf_token = ""
        self.load_config()
        
        # Real-time Status Tracking
        self.current_status = "idle"
        self.current_message = ""
        self.current_progress = 0
        self.is_cancelled = False
  
    def load_config(self):
        """Load configuration from config.json if it exists."""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    self.hf_token = config.get("hf_token", "")
                    if self.hf_token:
                        print("Loaded Hugging Face token from config.json")
            except Exception as e:
                print("Failed to load config.json:", e)



    def _is_sdxl(self):
        m = self.model_id.lower()
        return "xl" in m or "flux" in m

    def _init_txt2img(self):
        """Initialize the base text-to-image pipeline for weight sharing (local CPU)."""
        if self.pipe_txt2img is None:
            is_xl = self._is_sdxl()
            model_type = "SDXL" if is_xl else "SD 1.5"
            self.current_status = "loading_local_base"
            self.current_message = f"Loading local {model_type} base model (first loading takes time)..."
            print(f"Loading Base {model_type} pipeline...")
            
            pipe_class = StableDiffusionXLPipeline if is_xl else StableDiffusionPipeline
            
            self.pipe_txt2img = pipe_class.from_pretrained(
                self.model_id,
                safety_checker=None,
                requires_safety_checker=False,
                torch_dtype=self.torch_dtype,
                cache_dir=self.cache_dir
            )
            # Use UniPCMultistepScheduler for faster generation on CPU
            self.pipe_txt2img.scheduler = UniPCMultistepScheduler.from_config(self.pipe_txt2img.scheduler.config)
            self.pipe_txt2img = self.pipe_txt2img.to(self.device)
            self.pipe_txt2img.enable_attention_slicing()
        return self.pipe_txt2img
  
    def _init_scribble(self):
        """Initialize ControlNet Scribble pipeline by sharing weights (local CPU)."""
        if self._is_sdxl():
            raise ValueError("Scribble mode is currently not supported for local SDXL models. Please use Canny or Img2Img.")
            
        if self.pipe_scribble is None:
            self.current_status = "loading_local_scribble"
            self.current_message = "Loading local ControlNet Scribble module (first loading takes time)..."
            base = self._init_txt2img()
            print("Loading ControlNet Scribble model...")
            self.controlnet = ControlNetModel.from_pretrained(
                self.controlnet_id,
                torch_dtype=self.torch_dtype,
                cache_dir=self.cache_dir
            ).to(self.device)
            
            self.current_status = "initializing_local_scribble"
            self.current_message = "Initializing local Scribble pipeline..."
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

    def _init_controlnet_edge(self, edge_algorithm="canny"):
        """Initialize ControlNet pipeline for edges (Canny, Lineart, SoftEdge) (local CPU)."""
        is_xl = self._is_sdxl()
        model_type = "SDXL" if is_xl else "SD 1.5"
        
        if is_xl and edge_algorithm != "canny":
            print(f"Warning: {edge_algorithm} is not supported for SDXL yet. Falling back to Canny.")
            edge_algorithm = "canny"
            
        cnet_id_map = {
            "canny": self.controlnet_xl_canny_id if is_xl else "lllyasviel/sd-controlnet-canny",
            "lineart": "lllyasviel/control_v11p_sd15_lineart",
            "hed": "lllyasviel/control_v11p_sd15_softedge"
        }
        cnet_id = cnet_id_map.get(edge_algorithm, "lllyasviel/sd-controlnet-canny")

        if self.pipe_controlnet_edge is None or self.current_edge_algorithm != edge_algorithm:
            self.current_status = f"loading_local_{edge_algorithm}"
            self.current_message = f"Loading local ControlNet {model_type} {edge_algorithm.capitalize()} module..."
            base = self._init_txt2img()
            print(f"Loading ControlNet {model_type} {edge_algorithm} model...")
            controlnet = ControlNetModel.from_pretrained(
                cnet_id,
                torch_dtype=self.torch_dtype,
                cache_dir=self.cache_dir
            ).to(self.device)
            
            self.current_status = f"initializing_local_{edge_algorithm}"
            self.current_message = f"Initializing local {model_type} {edge_algorithm.capitalize()} pipeline..."
            print(f"Initializing ControlNet {edge_algorithm} pipeline (sharing weights)...")
            
            pipe_class = StableDiffusionXLControlNetPipeline if is_xl else StableDiffusionControlNetPipeline
            
            kwargs = {
                "vae": base.vae,
                "text_encoder": base.text_encoder,
                "tokenizer": base.tokenizer,
                "unet": base.unet,
                "controlnet": controlnet,
                "scheduler": base.scheduler,
                "safety_checker": None,
                "feature_extractor": None,
                "requires_safety_checker": False
            }
            if is_xl:
                kwargs["text_encoder_2"] = base.text_encoder_2
                kwargs["tokenizer_2"] = base.tokenizer_2
                
            self.pipe_controlnet_edge = pipe_class(**kwargs).to(self.device)
            self.pipe_controlnet_edge.enable_attention_slicing()
            self.current_edge_algorithm = edge_algorithm
            
        return self.pipe_controlnet_edge


    def _init_img2img(self):
        """Initialize local Stable Diffusion Image-to-Image pipeline by sharing weights (local CPU)."""
        if self.pipe_img2img is None:
            is_xl = self._is_sdxl()
            model_type = "SDXL" if is_xl else "SD 1.5"
            self.current_status = "initializing_local_img2img"
            self.current_message = f"Initializing local {model_type} Image-to-Image pipeline..."
            base = self._init_txt2img()
            print(f"Initializing {model_type} Img2Img pipeline (sharing weights)...")
            
            pipe_class = StableDiffusionXLImg2ImgPipeline if is_xl else StableDiffusionImg2ImgPipeline
            kwargs = {
                "vae": base.vae,
                "text_encoder": base.text_encoder,
                "tokenizer": base.tokenizer,
                "unet": base.unet,
                "scheduler": base.scheduler,
                "safety_checker": None,
                "feature_extractor": None,
                "requires_safety_checker": False
            }
            if is_xl:
                kwargs["text_encoder_2"] = base.text_encoder_2
                kwargs["tokenizer_2"] = base.tokenizer_2
                
            self.pipe_img2img = pipe_class(**kwargs).to(self.device)
            self.pipe_img2img.enable_attention_slicing()
        return self.pipe_img2img

    def unload_pytorch(self):
        """Unload PyTorch models and run garbage collection to free up memory."""
        print("Unloading PyTorch pipelines to free RAM...")
        self.pipe_txt2img = None
        self.pipe_scribble = None
        self.pipe_controlnet_edge = None
        self.pipe_img2img = None
        self.controlnet = None
        self.controlnet_canny = None
        
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def generate(self, prompt, negative_prompt="", mode="text", steps=20, seed=-1, strength=0.75, input_image=None, engine="local", cloud_model="", local_model="", edge_algorithm="canny", base_url="", temp_img_path="") -> Image.Image:
        """
        Generate an art image based on prompt and parameters.
        - engine: "cloud" (Hugging Face API) or "local" (Local PyTorch CPU - Scribble only)
        - mode: "text" (Text-to-Art), "img2img" (Reference Image-to-Art), or "scribble" (Scribble-to-Art)
        - cloud_model: Hugging Face model identifier for cloud generation
        """
        # Load config dynamically in case it changed
        self.load_config()
        
        # Check if local model changed and unload if needed
        if engine == "local" and local_model and self.model_id != local_model:
            print(f"Local model changed from {self.model_id} to {local_model}. Unloading memory...")
            self.unload_pytorch()
            self.model_id = local_model
            
        # Determine final token to use from config
        token = self.hf_token
        
        # Translate CJK characters
        prompt = translate_to_english_if_needed(prompt)
        negative_prompt = translate_to_english_if_needed(negative_prompt)
        
        # Clean conversational noise
        prompt = clean_conversational_prompt(prompt)
        negative_prompt = clean_conversational_prompt(negative_prompt)
        
        # Quality auto-enhancement
        if engine == "local" and "xl" in local_model.lower():
            if "masterpiece" not in prompt.lower():
                prompt = "masterpiece, best quality, ultra-detailed, " + prompt
            if "ugly" not in negative_prompt.lower() and negative_prompt:
                negative_prompt = "ugly, deformed, bad anatomy, watermark, " + negative_prompt
        
        print(f"Generating image. Engine: {engine}, Mode: {mode}, Prompt: '{prompt}', Model: {cloud_model if engine=='cloud' else 'local'}")
        
        self.current_status = "generating"
        self.is_cancelled = False
        
        if engine == "cloud":
            if not token:
                raise ValueError("Hugging Face API Token is missing! Please configure config.json or input it in the UI settings.")
                
            self.current_message = f"Calling Hugging Face API ({cloud_model})..."
            client = InferenceClient(token=token)
            
            try:
                if mode == "text":
                    print(f"Cloud Text-to-Image generating via model: {cloud_model}")
                    # FLUX.1-schnell doesn't need negative prompts, but others might.
                    extra_params = {}
                    if "schnell" in cloud_model.lower():
                        extra_params["num_inference_steps"] = 4
                    elif negative_prompt:
                        extra_params["negative_prompt"] = negative_prompt
                    
                    if seed != -1:
                        extra_params["seed"] = seed
                        
                    try:
                        image = client.text_to_image(
                            prompt=prompt,
                            model=cloud_model,
                            **extra_params
                        )
                    except StopIteration:
                        # Fallback for huggingface_hub library bug where provider routing fails with StopIteration
                        print("huggingface_hub StopIteration detected. Falling back to direct HTTP API call...")
                        import requests
                        
                        api_url = f"https://router.huggingface.co/hf-inference/models/{cloud_model}"
                        headers = {
                            "Authorization": f"Bearer {token}",
                            "Content-Type": "application/json"
                        }
                        
                        payload = {
                            "inputs": prompt,
                            "parameters": {}
                        }
                        if negative_prompt:
                            payload["parameters"]["negative_prompt"] = negative_prompt
                        if seed != -1:
                            payload["parameters"]["seed"] = seed
                        if "num_inference_steps" in extra_params:
                            payload["parameters"]["num_inference_steps"] = extra_params["num_inference_steps"]
                            
                        response = requests.post(api_url, headers=headers, json=payload)
                        
                        # Check if response is JSON (often holds warning or "estimated_time" if model loading)
                        content_type = response.headers.get("content-type", "")
                        if "application/json" in content_type:
                            try:
                                res_json = response.json()
                                if isinstance(res_json, dict) and "error" in res_json:
                                    err_msg = res_json.get("error", "")
                                    if "loading" in err_msg.lower() and "estimated_time" in res_json:
                                        err_msg += f" (Estimated loading time: {res_json['estimated_time']:.1f}s)"
                                    raise RuntimeError(f"Hugging Face API error ({response.status_code}): {err_msg}")
                            except ValueError:
                                pass
                                
                        if response.status_code != 200:
                            try:
                                err_json = response.json()
                                err_msg = err_json.get("error", "") or err_json.get("message", "")
                            except Exception:
                                err_msg = response.text
                            raise RuntimeError(f"Hugging Face API error ({response.status_code}): {err_msg}")
                            
                        image = Image.open(io.BytesIO(response.content))
                    return image
                    
                elif mode == "img2img":
                    if input_image is None:
                        raise ValueError("Input image is required for img2img mode")
                    
                    print(f"Cloud Image-to-Image generating via model: {cloud_model}")
                    # Resize input image to standard size for efficiency
                    ref_image = input_image.convert("RGB").resize((1024, 1024) if "xl" in cloud_model.lower() or "flux" in cloud_model.lower() else (512, 512), Image.Resampling.LANCZOS)
                    
                    # Convert image to bytes to send to client
                    buffered = io.BytesIO()
                    ref_image.save(buffered, format="JPEG")
                    img_bytes = buffered.getvalue()
                    
                    extra_params = {}
                    if negative_prompt:
                        extra_params["negative_prompt"] = negative_prompt
                    if seed != -1:
                        extra_params["seed"] = seed
                        
                    try:
                        image = client.image_to_image(
                            image=img_bytes,
                            prompt=prompt,
                            model=cloud_model,
                            strength=strength,
                            **extra_params
                        )
                    except StopIteration:
                        # Fallback for huggingface_hub library bug where provider routing fails with StopIteration
                        print("huggingface_hub StopIteration detected. Falling back to direct HTTP API call...")
                        import requests
                        import base64
                        
                        api_url = f"https://router.huggingface.co/hf-inference/models/{cloud_model}"
                        headers = {
                            "Authorization": f"Bearer {token}",
                            "Content-Type": "application/json"
                        }
                        
                        encoded_image = base64.b64encode(img_bytes).decode('utf-8')
                        payload = {
                            "inputs": encoded_image,
                            "parameters": {
                                "prompt": prompt,
                                "strength": strength
                            }
                        }
                        if negative_prompt:
                            payload["parameters"]["negative_prompt"] = negative_prompt
                        if seed != -1:
                            payload["parameters"]["seed"] = seed
                            
                        response = requests.post(api_url, headers=headers, json=payload)
                        
                        # Check if response is JSON (often holds warning or "estimated_time" if model loading)
                        content_type = response.headers.get("content-type", "")
                        if "application/json" in content_type:
                            try:
                                res_json = response.json()
                                if isinstance(res_json, dict) and "error" in res_json:
                                    err_msg = res_json.get("error", "")
                                    if "loading" in err_msg.lower() and "estimated_time" in res_json:
                                        err_msg += f" (Estimated loading time: {res_json['estimated_time']:.1f}s)"
                                    raise RuntimeError(f"Hugging Face API error ({response.status_code}): {err_msg}")
                            except ValueError:
                                pass
                                
                        if response.status_code != 200:
                            try:
                                err_json = response.json()
                                err_msg = err_json.get("error", "") or err_json.get("message", "")
                            except Exception:
                                err_msg = response.text
                            raise RuntimeError(f"Hugging Face API error ({response.status_code}): {err_msg}")
                            
                        image = Image.open(io.BytesIO(response.content))
                    return image
                else:
                    # Scribble mode is local-only in this version, fallback to local engine
                    print("Scribble mode detected in Cloud engine selection. Falling back to local CPU engine.")
                    engine = "local"
            except Exception as e:
                import traceback
                traceback.print_exc()
                
                # Try to extract the most descriptive error message
                err_msg = ""
                if hasattr(e, "server_message") and e.server_message:
                    err_msg = e.server_message
                elif hasattr(e, "response") and e.response is not None:
                    try:
                        err_json = e.response.json()
                        if isinstance(err_json, dict):
                            err_msg = err_json.get("error", "") or err_json.get("message", "")
                    except Exception:
                        pass
                    if not err_msg:
                        err_msg = e.response.text
                
                if not err_msg:
                    err_msg = str(e) or repr(e)
                
                print(f"Cloud API generation failed: {err_msg}")
                raise RuntimeError(f"Cloud API failed: {err_msg}. Please check if your Token is valid, the model is available, or if you hit rate limits.")
                self.current_status = "idle"
                self.current_message = ""
                
        elif engine == "pollinations":
            try:
                self.current_status = "generating"
                self.current_message = f"Pollinations.AI generating image..."
                
                import requests
                import os
                import urllib.parse
                
                encoded_prompt = urllib.parse.quote(prompt)
                api_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?nologo=true"
                
                if mode in ["img2img", "scribble"] and input_image and temp_img_path and base_url:
                    filename = os.path.basename(temp_img_path)
                    public_url = f"{base_url.rstrip('/')}/temp/{filename}"
                    api_url += f"&image={urllib.parse.quote(public_url)}"
                
                response = requests.get(api_url, timeout=60)
                
                if response.status_code != 200:
                    err_msg = response.text
                    raise RuntimeError(f"Pollinations.AI Error ({response.status_code}): {err_msg}")
                    
                image = Image.open(io.BytesIO(response.content))
                return image
                    
            except Exception as e:
                import traceback
                traceback.print_exc()
                err_msg = str(e)
                print(f"Pollinations.AI generation failed: {err_msg}")
                raise RuntimeError(f"Pollinations.AI failed: {err_msg}")
            finally:
                self.current_status = "idle"
                self.current_message = ""
                
        if engine == "local":
            if mode not in ["scribble", "img2img", "controlnet_canny"]:
                raise ValueError("Local generation is only supported for 'scribble', 'img2img' and 'controlnet_canny' modes on this branch.")
                
            if input_image is None:
                raise ValueError(f"Input image is required for {mode} mode")
                
            try:
                self.current_progress = 0
                if mode == "scribble":
                    pipe = self._init_scribble()
                    
                    # Standard input resolution for SD v1.5 is 512x512
                    width = 512
                    height = 512
                    
                    # Invert colors (ControlNet scribble expects black background with white lines)
                    doodle_inverted = ImageOps.invert(input_image.convert("L"))
                    doodle = doodle_inverted.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                    
                    # Set seed
                    if seed == -1:
                        generator = None
                    else:
                        generator = torch.Generator(device=self.device).manual_seed(seed)
                    
                    self.current_status = "generating"
                    self.current_message = "Local AI drawing image... Step 0/{} (using ControlNet CPU, estimated 5~15 minutes)...".format(steps)
                    
                    actual_total = steps
                    def scribble_step_end(pipe, step: int, timestep: int, callback_kwargs: dict):
                        if self.is_cancelled:
                            print("Scribble generation cancelled.")
                            raise InterruptedError("Generation cancelled by user.")
                        display_step = min(step + 1, actual_total)
                        self.current_progress = int((display_step / actual_total) * 100)
                        self.current_message = f"Local AI drawing image... Step {display_step}/{actual_total} (using ControlNet CPU, estimated 5~15 minutes)..."
                        print(f"[Local AI Scribble Progress] Step {display_step}/{actual_total} ({self.current_progress}%)")
                        return callback_kwargs

                    result = pipe(
                        prompt=prompt,
                        negative_prompt=negative_prompt,
                        image=doodle,
                        num_inference_steps=steps,
                        generator=generator,
                        callback_on_step_end=scribble_step_end
                    )
                    return result.images[0]
                    
                elif mode == "controlnet_canny":
                    pipe = self._init_controlnet_edge(edge_algorithm)
                    
                    is_xl = self._is_sdxl()
                    width = 1024 if is_xl else 512
                    height = 1024 if is_xl else 512
                    
                    input_img_resized = input_image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                    
                    self.current_status = "extracting_edges"
                    self.current_message = f"Extracting {edge_algorithm.capitalize()} edges (may take a moment)..."
                    
                    if edge_algorithm == "lineart":
                        from controlnet_aux import LineartDetector
                        processor = LineartDetector.from_pretrained("lllyasviel/Annotators").to(self.device)
                        edge_image = processor(input_img_resized)
                    elif edge_algorithm == "hed":
                        from controlnet_aux import HEDdetector
                        processor = HEDdetector.from_pretrained("lllyasviel/Annotators").to(self.device)
                        edge_image = processor(input_img_resized)
                    else:
                        # Default to Canny
                        image_arr = np.array(input_img_resized)
                        image_gray = cv2.cvtColor(image_arr, cv2.COLOR_RGB2GRAY)
                        edges = cv2.Canny(image_gray, 100, 200)
                        edges = edges[:, :, None]
                        edges = np.concatenate([edges, edges, edges], axis=2)
                        edge_image = Image.fromarray(edges)
                    
                    if seed == -1:
                        generator = None
                    else:
                        generator = torch.Generator(device=self.device).manual_seed(seed)
                        
                    self.current_status = "generating"
                    self.current_message = f"Local AI drawing image... Step 0/{steps} (using ControlNet {edge_algorithm.capitalize()} CPU, estimated 8~15 minutes)..."
                    
                    actual_total = steps
                    def controlnet_step_end(pipe, step: int, timestep: int, callback_kwargs: dict):
                        if self.is_cancelled:
                            print(f"{edge_algorithm} generation cancelled.")
                            raise InterruptedError("Generation cancelled by user.")
                        display_step = min(step + 1, actual_total)
                        self.current_progress = int((display_step / actual_total) * 100)
                        self.current_message = f"Local AI drawing image... Step {display_step}/{actual_total} (using ControlNet {edge_algorithm.capitalize()} CPU, estimated 8~15 minutes)..."
                        print(f"[Local AI {edge_algorithm.capitalize()} Progress] Step {display_step}/{actual_total} ({self.current_progress}%)")
                        return callback_kwargs

                    result = pipe(
                        prompt=prompt,
                        negative_prompt=negative_prompt,
                        image=edge_image,
                        num_inference_steps=steps,
                        generator=generator,
                        controlnet_conditioning_scale=0.7,
                        callback_on_step_end=controlnet_step_end
                    )
                    return result.images[0]
                    
                elif mode == "img2img":
                    pipe = self._init_img2img()
                    
                    is_xl = self._is_sdxl()
                    width = 1024 if is_xl else 512
                    height = 1024 if is_xl else 512
                    ref_image = input_image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                    
                    if seed == -1:
                        generator = None
                    else:
                        generator = torch.Generator(device=self.device).manual_seed(seed)
                        
                    actual_total = max(1, int(steps * strength))
                    self.current_status = "generating"
                    self.current_message = "Local AI drawing image... Step 0/{} (using SD 1.5 CPU, estimated 5~10 minutes)...".format(actual_total)
                    
                    def img2img_step_end(pipe, step: int, timestep: int, callback_kwargs: dict):
                        if self.is_cancelled:
                            print("Img2Img generation cancelled.")
                            raise InterruptedError("Generation cancelled by user.")
                        display_step = min(step + 1, actual_total)
                        self.current_progress = int((display_step / actual_total) * 100)
                        self.current_message = f"Local AI drawing image... Step {display_step}/{actual_total} (using SD 1.5 CPU, estimated 5~10 minutes)..."
                        print(f"[Local AI Img2Img Progress] Step {display_step}/{actual_total} ({self.current_progress}%)")
                        return callback_kwargs

                    result = pipe(
                        prompt=prompt,
                        negative_prompt=negative_prompt,
                        image=ref_image,
                        strength=strength,
                        num_inference_steps=steps,
                        generator=generator,
                        callback_on_step_end=img2img_step_end
                    )
                    return result.images[0]
            finally:
                # Unload PyTorch models automatically after generation to free RAM
                self.unload_pytorch()
                self.current_status = "idle"
                self.current_message = ""
                self.current_progress = 0

# Singleton generator instance
ai_generator = EpaperAIGenerator()
