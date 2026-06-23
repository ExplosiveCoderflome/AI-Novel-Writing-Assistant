"""Replay evaluation harness.

Provides the scaffold for replaying golden scenarios from saved checkpoints
and comparing outputs against reference results. Supports both deterministic
(exact match) and stochastic (threshold-based) evaluation paths.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional


class EvalMode(str, Enum):
    DETERMINISTIC = "deterministic"
    STOCHASTIC = "stochastic"


@dataclass
class GoldenScenario:
    """A known-good input -> output pair for regression testing."""
    name: str
    pipeline_type: str
    inputs: dict[str, Any]
    expected_artifacts: dict[str, Any]
    eval_mode: EvalMode = EvalMode.DETERMINISTIC
    tolerance: float = 0.0  # For stochastic comparisons
    tags: list[str] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path) -> "GoldenScenario":
        with open(path) as f:
            data = json.load(f)
        return cls(
            name=data["name"],
            pipeline_type=data["pipeline_type"],
            inputs=data["inputs"],
            expected_artifacts=data["expected_artifacts"],
            eval_mode=EvalMode(data.get("eval_mode", "deterministic")),
            tolerance=data.get("tolerance", 0.0),
            tags=data.get("tags", []),
        )

    def save(self, path: Path) -> None:
        data = {
            "name": self.name,
            "pipeline_type": self.pipeline_type,
            "inputs": self.inputs,
            "expected_artifacts": self.expected_artifacts,
            "eval_mode": self.eval_mode.value,
            "tolerance": self.tolerance,
            "tags": self.tags,
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)


@dataclass
class EvalResult:
    """Result of evaluating a single scenario."""
    scenario_name: str
    passed: bool
    details: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


# Type for custom comparison functions
Comparator = Callable[[Any, Any, float], bool]


def default_comparator(expected: Any, actual: Any, tolerance: float) -> bool:
    """Default comparator: exact match for deterministic, threshold for stochastic."""
    if tolerance == 0.0:
        return expected == actual
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        return abs(expected - actual) <= tolerance
    return expected == actual


class ReplayHarness:
    """Loads golden scenarios and replays them through the pipeline."""

    def __init__(
        self,
        scenarios_dir: Optional[Path] = None,
        outputs_dir: Optional[Path] = None,
    ) -> None:
        self.scenarios_dir = scenarios_dir or Path("tests/eval/golden_scenarios")
        self.outputs_dir = outputs_dir or Path("tests/eval/golden_outputs")
        self._comparators: dict[str, Comparator] = {}

    def register_comparator(self, artifact_name: str, comparator: Comparator) -> None:
        """Register a custom comparator for a specific artifact type."""
        self._comparators[artifact_name] = comparator

    def load_scenarios(self, tags: Optional[list[str]] = None) -> list[GoldenScenario]:
        """Load all golden scenarios, optionally filtering by tags."""
        scenarios = []
        for path in self.scenarios_dir.glob("*.json"):
            scenario = GoldenScenario.load(path)
            if tags and not any(t in scenario.tags for t in tags):
                continue
            scenarios.append(scenario)
        return scenarios

    def evaluate(
        self,
        scenario: GoldenScenario,
        actual_artifacts: dict[str, Any],
    ) -> EvalResult:
        """Compare actual artifacts against expected for a scenario."""
        errors = []
        details: dict[str, Any] = {}

        for artifact_name, expected in scenario.expected_artifacts.items():
            actual = actual_artifacts.get(artifact_name)
            if actual is None:
                errors.append(f"Missing artifact: {artifact_name}")
                continue

            comparator = self._comparators.get(artifact_name, default_comparator)
            passed = comparator(expected, actual, scenario.tolerance)
            details[artifact_name] = {
                "passed": passed,
                "expected_type": type(expected).__name__,
                "actual_type": type(actual).__name__,
            }
            if not passed:
                errors.append(f"Mismatch in {artifact_name}")

        return EvalResult(
            scenario_name=scenario.name,
            passed=len(errors) == 0,
            details=details,
            errors=errors,
        )

    def run_all(
        self,
        runner: Callable[[GoldenScenario], dict[str, Any]],
        tags: Optional[list[str]] = None,
    ) -> list[EvalResult]:
        """Run all scenarios through a runner function and evaluate results."""
        scenarios = self.load_scenarios(tags)
        results = []
        for scenario in scenarios:
            actual = runner(scenario)
            result = self.evaluate(scenario, actual)
            results.append(result)
        return results
