"""Aperture NVDA point-in-time research utilities."""

from .manifest import build_dataset_manifest, validate_dataset_rows
from .walk_forward import EvaluationConfig, evaluate_expanding_walk_forward

__all__ = [
    "EvaluationConfig",
    "build_dataset_manifest",
    "evaluate_expanding_walk_forward",
    "validate_dataset_rows",
]
