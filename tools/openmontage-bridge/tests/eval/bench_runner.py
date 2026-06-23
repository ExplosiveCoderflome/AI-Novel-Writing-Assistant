"""Video production bench runner.

Runs a matrix of synthetic scenarios through the lib-level quality validators
(slideshow_risk, variation_checker, delivery_promise) to verify that the
enforcement layer catches known-bad plans and passes known-good ones.

Usage:
    python -m tests.eval.bench_runner              # run all
    python -m tests.eval.bench_runner --tag cinematic  # filter by tag
    python -m tests.eval.bench_runner --verbose     # show per-scenario details
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Scenario definitions — synthetic plans that exercise validators
# ---------------------------------------------------------------------------

@dataclass
class BenchScenario:
    name: str
    tags: list[str]
    scenes: list[dict[str, Any]]
    edit_decisions: dict[str, Any] | None = None
    renderer_family: str | None = None
    render_runtime: str | None = None  # remotion | hyperframes | ffmpeg (optional)
    delivery_promise: dict[str, Any] | None = None
    cuts: list[dict[str, Any]] = field(default_factory=list)

    # Expected outcomes
    expected_slideshow_verdict: str | None = None  # strong/acceptable/revise/fail
    expected_variation_verdict: str | None = None   # strong/acceptable/revise/fail
    expected_promise_valid: bool | None = None


@dataclass
class BenchResult:
    scenario: str
    passed: bool
    checks: dict[str, dict[str, Any]] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Scenario factory helpers
# ---------------------------------------------------------------------------

def _scene(
    desc: str,
    scene_type: str = "visual",
    shot_size: str | None = None,
    movement: str = "static",
    lighting: str | None = None,
    intent: str | None = None,
    info_role: str | None = None,
    narrative_role: str | None = None,
    hero: bool = False,
    texture: list[str] | None = None,
) -> dict[str, Any]:
    s: dict[str, Any] = {"description": desc, "type": scene_type}
    sl: dict[str, Any] = {}
    if shot_size:
        sl["shot_size"] = shot_size
    sl["camera_movement"] = movement
    if lighting:
        sl["lighting_key"] = lighting
    if sl:
        s["shot_language"] = sl
    if intent:
        s["shot_intent"] = intent
    if info_role:
        s["information_role"] = info_role
    if narrative_role:
        s["narrative_role"] = narrative_role
    if hero:
        s["hero_moment"] = True
    if texture:
        s["texture_keywords"] = texture
    return s


def _cut(source: str, cut_type: str = "", in_s: float = 0, out_s: float = 5) -> dict:
    return {"source": source, "type": cut_type, "in_seconds": in_s, "out_seconds": out_s}


# ---------------------------------------------------------------------------
# Scenario bank
# ---------------------------------------------------------------------------

def build_scenarios() -> list[BenchScenario]:
    scenarios: list[BenchScenario] = []

    # ---- GOOD: Cinematic trailer with full shot language ----
    scenarios.append(BenchScenario(
        name="cinematic_full_shot_language",
        tags=["cinematic", "good", "slideshow_risk"],
        renderer_family="cinematic-trailer",
        scenes=[
            _scene("Aerial drone sweep over misty mountain valley at dawn",
                   shot_size="extreme-wide", movement="drone-forward", lighting="golden-hour",
                   intent="Establish scale and wonder", narrative_role="hook", hero=True,
                   texture=["film grain", "warm amber"]),
            _scene("Subject emerges from fog, silhouetted against sunrise",
                   shot_size="medium", movement="dolly-in", lighting="backlit",
                   intent="Introduce protagonist with mystery", narrative_role="setup"),
            _scene("Close-up of weathered hands gripping climbing rope",
                   shot_size="extreme-close-up", movement="static", lighting="natural",
                   intent="Texture detail sells physicality", narrative_role="development"),
            _scene("Wide shot of summit attempt, tiny figure against rock face",
                   shot_size="wide", movement="pan-right", lighting="overcast",
                   intent="Show scale of challenge", narrative_role="rising-action"),
            _scene("Slow-motion summit reach, clouds breaking to reveal vista",
                   shot_size="medium-close-up", movement="crane-up", lighting="golden-hour",
                   intent="Emotional payoff of the journey", narrative_role="climax", hero=True,
                   texture=["lens flare", "warm tones"]),
            _scene("Wide pull-back to reveal full mountain range at sunset",
                   shot_size="extreme-wide", movement="zoom-out", lighting="magic-hour",
                   intent="Resolution — contextualize the achievement", narrative_role="resolution"),
        ],
        expected_slideshow_verdict="strong",
        expected_variation_verdict="strong",
    ))

    # ---- GOOD: Data explainer with clear purpose per scene ----
    scenarios.append(BenchScenario(
        name="data_explainer_purposeful",
        tags=["explainer", "good", "slideshow_risk"],
        renderer_family="explainer-data",
        scenes=[
            _scene("Animated bar chart showing revenue growth 2020-2025",
                   scene_type="bar_chart", shot_size="medium",
                   intent="Anchor the narrative in hard numbers", info_role="key statistic"),
            _scene("Split screen: before/after product redesign",
                   scene_type="comparison", shot_size="medium",
                   intent="Visual proof of transformation", info_role="comparison"),
            _scene("Infographic showing 3-step process flow",
                   scene_type="callout", shot_size="wide",
                   intent="Simplify complex process into digestible steps", info_role="process explanation"),
            _scene("Customer testimonial overlay on product usage footage",
                   shot_size="medium-close-up", movement="static", lighting="studio",
                   intent="Social proof to support data claims", narrative_role="evidence"),
            _scene("KPI dashboard showing live metrics",
                   scene_type="kpi_grid", shot_size="wide",
                   intent="Real-time impact visualization", info_role="key statistic"),
        ],
        expected_slideshow_verdict="strong",
        expected_variation_verdict="acceptable",
    ))

    # ---- BAD: Slideshow — all same shot size, no intent ----
    scenarios.append(BenchScenario(
        name="slideshow_all_medium_no_intent",
        tags=["bad", "slideshow_risk"],
        renderer_family="explainer-data",
        scenes=[
            _scene("Stock photo of office building"),
            _scene("Stock photo of people in meeting room"),
            _scene("Stock photo of laptop on desk"),
            _scene("Stock photo of handshake"),
            _scene("Stock photo of skyline at night"),
            _scene("Stock photo of coffee cup"),
            _scene("Stock photo of whiteboard with notes"),
            _scene("Stock photo of team celebrating"),
        ],
        expected_slideshow_verdict="acceptable",
        expected_variation_verdict="revise",
    ))

    # ---- BAD: Typography overreliance ----
    scenarios.append(BenchScenario(
        name="text_card_overload",
        tags=["bad", "slideshow_risk", "typography"],
        renderer_family="explainer-teacher",
        scenes=[
            _scene("Title card: Welcome to Our Company", scene_type="text_card"),
            _scene("Bullet points: Our 5 core values", scene_type="text_card"),
            _scene("Statistics: 500 employees, 30 countries", scene_type="stat_card"),
            _scene("Quote: CEO inspirational message", scene_type="text_card"),
            _scene("KPI grid: Q4 results", scene_type="kpi_grid"),
            _scene("More bullet points: Our differentiators", scene_type="text_card"),
            _scene("Final stat card: Year over year growth", scene_type="stat_card"),
        ],
        expected_slideshow_verdict="revise",
    ))

    # ---- BAD: Cinematic claims without structure ----
    scenarios.append(BenchScenario(
        name="fake_cinematic_no_structure",
        tags=["bad", "cinematic", "slideshow_risk"],
        renderer_family="cinematic-trailer",
        scenes=[
            _scene("Beautiful landscape"),
            _scene("Person walking"),
            _scene("Close-up of face"),
            _scene("Wide shot of city"),
            _scene("Sunset scene"),
        ],
        expected_slideshow_verdict="fail",
    ))

    # ---- DELIVERY PROMISE: Motion-led with all stills ----
    scenarios.append(BenchScenario(
        name="motion_promise_all_stills",
        tags=["bad", "delivery_promise"],
        delivery_promise={
            "promise_type": "motion_led",
            "motion_required": True,
            "source_required": False,
            "tone_mode": "cinematic",
            "quality_floor": "broadcast",
        },
        scenes=[],
        cuts=[
            _cut("hero.png"), _cut("scene2.jpg"), _cut("scene3.png"),
            _cut("scene4.jpg"), _cut("scene5.png"),
        ],
        expected_promise_valid=False,
    ))

    # ---- DELIVERY PROMISE: Motion-led with enough video ----
    scenarios.append(BenchScenario(
        name="motion_promise_sufficient_video",
        tags=["good", "delivery_promise"],
        delivery_promise={
            "promise_type": "motion_led",
            "motion_required": True,
            "source_required": False,
            "tone_mode": "cinematic",
            "quality_floor": "broadcast",
        },
        scenes=[],
        cuts=[
            _cut("intro.mp4", "video"), _cut("scene2.mp4", "video"),
            _cut("scene3.mp4", "video"), _cut("overlay.png"),
            _cut("scene5.mp4", "video"),
        ],
        expected_promise_valid=True,
    ))

    # ---- DELIVERY PROMISE: Data explainer allows stills ----
    scenarios.append(BenchScenario(
        name="data_explainer_all_stills_ok",
        tags=["good", "delivery_promise"],
        delivery_promise={
            "promise_type": "data_explainer",
            "motion_required": False,
            "source_required": False,
            "tone_mode": "educational",
            "quality_floor": "presentable",
        },
        scenes=[],
        cuts=[
            _cut("chart1.png"), _cut("chart2.png"), _cut("diagram.png"),
        ],
        expected_promise_valid=True,
    ))

    # ---- VARIATION: Good diversity ----
    scenarios.append(BenchScenario(
        name="variation_diverse_scenes",
        tags=["good", "variation"],
        scenes=[
            _scene("Wide establishing shot of laboratory",
                   shot_size="wide", movement="dolly-in", lighting="fluorescent",
                   intent="Set the environment", texture=["clinical", "cool tones"]),
            _scene("Close-up of researcher examining sample",
                   shot_size="close-up", movement="static", lighting="practical",
                   intent="Show detail and expertise"),
            _scene("Medium shot of team discussion around data display",
                   shot_size="medium", movement="pan-left", lighting="natural",
                   intent="Show collaboration"),
            _scene("Extreme close-up of microscope slide revealing cell structure",
                   shot_size="extreme-close-up", movement="rack-focus", lighting="backlit",
                   intent="The discovery moment", hero=True),
            _scene("Wide overhead shot of full lab in action",
                   shot_size="extreme-wide", movement="crane-down", lighting="mixed",
                   intent="Scale — this is a major operation"),
        ],
        expected_variation_verdict="strong",
    ))

    # ---- VARIATION: Poor — all same size, generic descriptions ----
    scenarios.append(BenchScenario(
        name="variation_monotonous",
        tags=["bad", "variation"],
        scenes=[
            _scene("A person using a computer", shot_size="medium"),
            _scene("A person typing on keyboard", shot_size="medium"),
            _scene("A person looking at screen", shot_size="medium"),
            _scene("A person in modern office", shot_size="medium"),
            _scene("A person working at desk", shot_size="medium"),
        ],
        expected_variation_verdict="fail",
    ))

    # ---- EDGE: Empty scenes ----
    scenarios.append(BenchScenario(
        name="edge_empty_scenes",
        tags=["edge"],
        scenes=[],
        expected_slideshow_verdict="fail",
    ))

    # ---- EDGE: Single scene ----
    scenarios.append(BenchScenario(
        name="edge_single_scene",
        tags=["edge"],
        scenes=[
            _scene("Solo hero shot", shot_size="wide", movement="drone-forward",
                   intent="The only shot", hero=True),
        ],
        expected_slideshow_verdict="strong",
    ))

    # ---- MIXED: Acceptable but not great ----
    scenarios.append(BenchScenario(
        name="mixed_acceptable",
        tags=["mixed", "slideshow_risk"],
        renderer_family="explainer-teacher",
        scenes=[
            _scene("Animated title with topic introduction",
                   scene_type="text_card", intent="Hook the viewer"),
            _scene("Diagram showing system architecture",
                   shot_size="wide", intent="Explain the big picture", info_role="process explanation"),
            _scene("Screen recording of feature demo",
                   shot_size="medium", movement="static",
                   intent="Show the product in action"),
            _scene("Before/after comparison of results",
                   scene_type="comparison", intent="Prove the value"),
            _scene("Summary stats and call to action",
                   scene_type="stat_card", intent="Drive conversion"),
        ],
        expected_slideshow_verdict="acceptable",
    ))

    return scenarios


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

_VERDICT_ORDER = {"strong": 0, "acceptable": 1, "revise": 2, "fail": 3}


def _verdict_matches(expected: str, actual: str) -> bool:
    """Check if actual verdict is within +-1 tier of expected."""
    e = _VERDICT_ORDER.get(expected, -1)
    a = _VERDICT_ORDER.get(actual, -1)
    return abs(e - a) <= 1


def run_bench(scenarios: list[BenchScenario], verbose: bool = False) -> list[BenchResult]:
    results: list[BenchResult] = []

    for sc in scenarios:
        result = BenchResult(scenario=sc.name, passed=True)

        # --- Slideshow risk ---
        if sc.expected_slideshow_verdict is not None:
            try:
                from lib.slideshow_risk import score_slideshow_risk
                risk = score_slideshow_risk(
                    sc.scenes, sc.edit_decisions, sc.renderer_family, sc.render_runtime
                )
                actual = risk["verdict"]
                ok = _verdict_matches(sc.expected_slideshow_verdict, actual)
                result.checks["slideshow_risk"] = {
                    "expected": sc.expected_slideshow_verdict,
                    "actual": actual,
                    "score": risk["average"],
                    "passed": ok,
                }
                if not ok:
                    result.passed = False
                    result.errors.append(
                        f"slideshow_risk: expected ~{sc.expected_slideshow_verdict}, got {actual} ({risk['average']:.1f})"
                    )
            except Exception as e:
                result.passed = False
                result.errors.append(f"slideshow_risk error: {e}")

        # --- Variation checker ---
        if sc.expected_variation_verdict is not None and sc.scenes:
            try:
                from lib.variation_checker import check_scene_variation
                var = check_scene_variation(sc.scenes)
                actual = var["verdict"]
                ok = _verdict_matches(sc.expected_variation_verdict, actual)
                result.checks["variation"] = {
                    "expected": sc.expected_variation_verdict,
                    "actual": actual,
                    "score": var["score"],
                    "passed": ok,
                }
                if not ok:
                    result.passed = False
                    result.errors.append(
                        f"variation: expected ~{sc.expected_variation_verdict}, got {actual} ({var['score']:.1f})"
                    )
            except Exception as e:
                result.passed = False
                result.errors.append(f"variation error: {e}")

        # --- Delivery promise ---
        if sc.expected_promise_valid is not None and sc.delivery_promise:
            try:
                from lib.delivery_promise import DeliveryPromise
                promise = DeliveryPromise.from_dict(sc.delivery_promise)
                validation = promise.validate_cuts(sc.cuts)
                ok = validation["valid"] == sc.expected_promise_valid
                result.checks["delivery_promise"] = {
                    "expected_valid": sc.expected_promise_valid,
                    "actual_valid": validation["valid"],
                    "motion_ratio": validation["motion_ratio"],
                    "passed": ok,
                }
                if not ok:
                    result.passed = False
                    result.errors.append(
                        f"delivery_promise: expected valid={sc.expected_promise_valid}, "
                        f"got valid={validation['valid']} (motion_ratio={validation['motion_ratio']:.0%})"
                    )
            except Exception as e:
                result.passed = False
                result.errors.append(f"delivery_promise error: {e}")

        results.append(result)

    return results


def print_results(results: list[BenchResult], verbose: bool = False) -> None:
    passed = sum(1 for r in results if r.passed)
    total = len(results)

    print(f"\n{'='*60}")
    print(f"  Video Production Bench: {passed}/{total} scenarios passed")
    print(f"{'='*60}\n")

    for r in results:
        status = "PASS" if r.passed else "FAIL"
        print(f"  [{status}] {r.scenario}")
        if verbose or not r.passed:
            for check_name, check in r.checks.items():
                check_status = "ok" if check.get("passed") else "FAIL"
                print(f"         {check_name}: {check_status}")
                if verbose:
                    for k, v in check.items():
                        if k != "passed":
                            print(f"           {k}: {v}")
            for err in r.errors:
                print(f"         ERROR: {err}")

    print(f"\n  Total: {total} | Passed: {passed} | Failed: {total - passed}")
    if passed == total:
        print("  All scenarios passed.\n")
    else:
        print(f"  {total - passed} scenario(s) need attention.\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Video production bench runner")
    parser.add_argument("--tag", help="Filter scenarios by tag")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show per-scenario details")
    args = parser.parse_args()

    scenarios = build_scenarios()
    if args.tag:
        scenarios = [s for s in scenarios if args.tag in s.tags]

    if not scenarios:
        print(f"No scenarios found{' for tag ' + args.tag if args.tag else ''}")
        sys.exit(1)

    results = run_bench(scenarios, verbose=args.verbose)
    print_results(results, verbose=args.verbose)

    # Exit with failure code if any scenario failed
    if not all(r.passed for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
