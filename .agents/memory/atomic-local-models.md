---
name: Atomic Agent local requirements
description: User's local-first setup requirement and corrected diffusion model names
---

PixelStudio must be ready for the user to clone to their local machine and run against their Atomic Agent endpoint at http://127.0.0.1:1337/v1/images/generations.

The user corrected the model names to Qwen-Image-2.1-Turbo (Qwen) and Krea 2 Turbo, superseding the earlier Qwen Image 2.2 Turbo and Kreaturbo2 12B names. They previously specified 14 steps for Qwen and 8 steps for Krea.

**Why:** The user runs their own diffusion models locally and explicitly supplied the updated model names.

**How to apply:** Preserve clone-and-run local compatibility and use the corrected names for the built-in presets; keep identifiers editable rather than claiming unverified Atomic Agent identifiers are canonical.
