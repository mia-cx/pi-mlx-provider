# Pi MLX Provider

This context describes the language for a Pi extension that makes local MLX-family models available as Pi-selectable models.

## Language

**Runtime Environment**:
An installed, versioned local MLX capability that defines what kind of runtime server can be started for a model.
_Avoid_: Server, runtime, venv

**Runtime Server**:
A running local process started from a Runtime Environment to serve one or more model requests.
_Avoid_: Runtime Environment, environment

**Prewarmed Runtime Server**:
A Runtime Server started for a model that is ready locally but is not currently selected in Pi's `/model` picker.
_Avoid_: Selected model, active model

**Cached Model**:
A Hugging Face model snapshot already present on disk in the local model cache.
_Avoid_: Cached manifest, manifest

**Model Weight Download**:
An explicit user-confirmed fetch of a Hugging Face model snapshot into the local model cache.
_Avoid_: Runtime installation, manifest resolution

**Model Revision**:
The immutable Hugging Face commit SHA used as the cache identity for a model, even when the user typed no revision or a moving branch like `main`.
_Avoid_: Branch, tag

**Model Manifest**:
A cached record of what a specific model revision requires and which Runtime Environments are known to work or fail for it.
_Avoid_: Config, metadata cache, Cached Model

**Preferred Runtime Environment**:
The default Runtime Environment selected for a model when no request-specific constraint or user override says otherwise. By default, this is the most capable compatible environment.
_Avoid_: Runtime Requirement, fallback

**Default Environment Version**:
A moving version alias for a Runtime Environment that is resolved at install time and recorded as the concrete installed package version.
_Avoid_: Latest, unpinned version

**Runtime Requirement**:
The minimum Runtime Environment needed for a model and request shape, such as text-only or image-and-text input.
_Avoid_: Preferred Runtime Environment, server requirement, dependency

**Environment Override**:
A per-model user setting that replaces manifest-driven Preferred Runtime Environment resolution for model switching and initialization.
_Avoid_: Runtime Requirement, request override

**Request Shape**:
The modalities implied by a Pi request after the extension inspects its text and file paths, such as text-only or image-and-text input.
_Avoid_: Attachment type, payload type

**Attachment Path**:
A file path present in a Pi request that the extension may convert into a model-native image, audio, or other multimodal input when the selected Runtime Environment supports it.
_Avoid_: Attachment, upload
