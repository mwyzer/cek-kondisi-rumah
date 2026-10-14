from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st
from anthropic import Anthropic, AnthropicError
from streamlit.errors import StreamlitSecretNotFoundError

ROOT = Path(__file__).resolve().parent
ANALYZER_DIR = ROOT / "analyzer"
if str(ANALYZER_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYZER_DIR))

from analisis import FotoTidakValid, analisis_foto  # noqa: E402

MAX_PHOTOS = 10
MAX_PHOTO_BYTES = 5 * 1024 * 1024
ROOMS = [
    "Front exterior",
    "Roof",
    "Living room",
    "Bedroom",
    "Kitchen",
    "Bathroom",
    "Ceiling",
    "Floor",
    "Porch / carport",
    "Yard / fence",
    "Damage detail",
    "Other",
]
COMPONENTS = [
    ("structure", "Structure (foundation, columns, beams)", 25),
    ("roof", "Roof and gutters", 20),
    ("walls", "Walls", 15),
    ("floor", "Flooring", 10),
    ("ceiling", "Ceiling", 10),
    ("doors_windows", "Doors, windows, and frames", 8),
    ("utilities", "Utilities (electrical, plumbing, sanitation)", 7),
    ("finishes", "Finishes and paint", 5),
]
URGENCIES = {
    "immediate": "Immediate",
    "within_3_months": "Within 3 months",
    "within_12_months": "Within 12 months",
    "monitor": "Monitor",
}
DAMAGE_BY_SCORE = {5: 0, 4: 10, 3: 30, 2: 55, 1: 85}
QUALITY_LABELS = {
    "baik": "Clear",
    "agak_buram": "Slightly blurry",
    "buram": "Blurry",
    "gelap": "Too dark",
    "terlalu_terang": "Overexposed",
    "resolusi_rendah": "Low resolution",
}
DETECTION_LABELS = {
    "retak": "Crack",
    "rembesan": "Water stain / leak",
    "jamur": "Mold",
    "cat_mengelupas": "Peeling paint",
    "plester_rusak": "Damaged plaster",
    "karat": "Rust",
    "kayu_lapuk": "Rot / termite damage",
    "keramik_rusak": "Damaged tile",
    "plafon_rusak": "Damaged ceiling",
}


def _component_schema() -> dict[str, Any]:
    component = {
        "type": "object",
        "properties": {
            "score": {"type": ["integer", "null"], "minimum": 1, "maximum": 5},
            "findings": {"type": "array", "items": {"type": "string"}},
            "recommendation": {"type": "string"},
            "urgency": {"type": "string", "enum": list(URGENCIES)},
            "cost_min_idr": {"type": "integer", "minimum": 0},
            "cost_max_idr": {"type": "integer", "minimum": 0},
            "photos": {"type": "array", "items": {"type": "integer"}},
        },
        "required": [
            "score",
            "findings",
            "recommendation",
            "urgency",
            "cost_min_idr",
            "cost_max_idr",
            "photos",
        ],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "components": {
                "type": "object",
                "properties": {key: component for key, _, _ in COMPONENTS},
                "required": [key for key, _, _ in COMPONENTS],
                "additionalProperties": False,
            },
            "safety_risks": {"type": "array", "items": {"type": "string"}},
            "photo_quality": {"type": "string"},
            "photos_to_add": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary", "components", "safety_risks", "photo_quality", "photos_to_add"],
        "additionalProperties": False,
    }


def _build_prompt(info: dict[str, str], labels: list[str], photo_analysis: list[dict[str, Any]]) -> str:
    building_info = [
        f"Building type / area: {info['type']}" if info.get("type") else None,
        f"Building age: {info['age']} years" if info.get("age") else None,
        f"Number of floors: {info['floors']}" if info.get("floors") else None,
        f"Location: {info['city']}" if info.get("city") else None,
    ]
    details = "\n".join(value for value in building_info if value) or "Not provided."
    analysis_notes = []
    for item in photo_analysis:
        quality = item["kualitas"]
        analysis_notes.append(
            f"Photo {item['indeks']}: quality={QUALITY_LABELS.get(quality['status'], 'Unknown')}; "
            f"heuristic crack indications={item['retak']['jumlah']}; "
            f"stain indications={item['noda']['jumlah']}."
        )
    return f"""You are a residential building inspector in Indonesia. Assess the home ONLY from details that are actually visible in the attached photos. Do not guess about components that cannot be seen.

Building information:
{details}

Photo labels:
{chr(10).join(f"Photo {i + 1}: {label}" for i, label in enumerate(labels))}

Optional automated image-analysis hints (OpenCV heuristics can mistake shadows, grout, or object edges for damage). Use these only as prompts for where to look; make your decision from the visible photo evidence:
{chr(10).join(analysis_notes) or "Not available."}

Components and weights: {", ".join(f"{name} ({weight}%)" for _, name, weight in COMPONENTS)}.

Score each component from 1 to 5:
5 = excellent, no defects
4 = good, minor cosmetic defects only
3 = minor damage (hairline cracks, peeling paint, small water stains, displaced tiles)
2 = moderate damage (active leaks, sagging ceiling, cracks wider than 1 mm, rotten wood)
1 = severe or hazardous damage (structural diagonal cracks, damaged columns/beams, partial roof collapse)
null = component is not visible in any photo.

Estimate repair costs in Indonesian rupiah using reasonable local material and labor prices for 2026. Use 0 when no repair is needed. Urgency must be one of: immediate, within_3_months, within_12_months, monitor.

Write every text value in English. Base photo references on the supplied order, using 1-based photo numbers. If the photos do not show a house, set every score to null and explain that in the summary. Do not present this photo-based estimate as a professional structural diagnosis."""


def _normalize_report(raw: dict[str, Any], photo_count: int) -> dict[str, Any]:
    components: dict[str, dict[str, Any]] = {}
    source = raw.get("components", {})
    for key, _, _ in COMPONENTS:
        item = source.get(key, {})
        score = item.get("score")
        if score is not None:
            try:
                score = int(score)
            except (TypeError, ValueError):
                score = None
            if score not in DAMAGE_BY_SCORE:
                score = None
        cost_min = max(0, int(item.get("cost_min_idr", 0) or 0))
        cost_max = max(cost_min, int(item.get("cost_max_idr", 0) or 0))
        try:
            photo_numbers = item.get("photos", [])
            photos = sorted(
                {int(number) for number in photo_numbers if 1 <= int(number) <= photo_count}
            )
        except (TypeError, ValueError):
            photos = []
        urgency = item.get("urgency")
        if urgency not in URGENCIES:
            urgency = "monitor"
        components[key] = {
            "score": score,
            "findings": [str(value) for value in item.get("findings", [])[:6]],
            "recommendation": str(item.get("recommendation", "")),
            "urgency": urgency,
            "cost_min_idr": cost_min,
            "cost_max_idr": cost_max,
            "photos": photos,
        }
    return {
        "summary": str(raw.get("summary", "")),
        "components": components,
        "safety_risks": [str(value) for value in raw.get("safety_risks", [])],
        "photo_quality": str(raw.get("photo_quality", "")),
        "photos_to_add": [str(value) for value in raw.get("photos_to_add", [])],
    }


def _assess_photos(photos: list[Any], labels: list[str], info: dict[str, str], client: Anthropic, model: str) -> dict[str, Any]:
    analyses = []
    for index, photo in enumerate(photos, start=1):
        data = photo.getvalue()
        if len(data) > MAX_PHOTO_BYTES:
            raise ValueError(f"Photo {index} exceeds the 5 MB limit.")
        try:
            analyses.append(analisis_foto(data, index))
        except FotoTidakValid as error:
            raise ValueError(f"Photo {index} could not be read as an image: {error}") from error

    content: list[dict[str, Any]] = [
        {"type": "text", "text": _build_prompt(info, labels, analyses)}
    ]
    for index, (photo, label) in enumerate(zip(photos, labels), start=1):
        content.extend(
            [
                {"type": "text", "text": f"Photo {index} ({label}):"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": photo.type or "image/jpeg",
                        "data": base64.b64encode(photo.getvalue()).decode("ascii"),
                    },
                },
            ]
        )

    response = client.messages.create(
        model=model,
        max_tokens=8000,
        tools=[
            {
                "name": "create_home_condition_report",
                "description": "Return a structured, English-language home condition report.",
                "input_schema": _component_schema(),
            }
        ],
        tool_choice={"type": "tool", "name": "create_home_condition_report"},
        thinking={"type": "disabled"},
        messages=[{"role": "user", "content": content}],
    )
    report_block = next((block for block in response.content if block.type == "tool_use"), None)
    if report_block is None:
        raise RuntimeError("The AI did not return a structured report.")
    report = _normalize_report(report_block.input, len(photos))
    visible_weight = sum(
        weight for key, _, weight in COMPONENTS if report["components"][key]["score"] is not None
    )
    weighted_damage = sum(
        weight * DAMAGE_BY_SCORE[report["components"][key]["score"]]
        for key, _, weight in COMPONENTS
        if report["components"][key]["score"] is not None
    )
    costs_min = sum(item["cost_min_idr"] for item in report["components"].values())
    costs_max = sum(item["cost_max_idr"] for item in report["components"].values())
    damage = weighted_damage / visible_weight if visible_weight >= 50 else None
    index = math.floor(100 - damage + 0.5) if damage is not None else None
    if visible_weight < 50:
        category = "Insufficient data"
    elif damage < 10:
        category = "Good"
    elif damage <= 30:
        category = "Minor damage"
    elif damage <= 45:
        category = "Moderate damage"
    else:
        category = "Severe damage"
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "building": info,
        "model": model,
        "report": report,
        "assessment": {
            "condition_index": index,
            "damage_percent": damage,
            "coverage_percent": visible_weight,
            "category": category,
            "cost_min_idr": costs_min,
            "cost_max_idr": costs_max,
        },
        "photos": [
            {
                "label": label,
                "analysis": {
                    "quality": analyses[i]["kualitas"],
                    "cracks": analyses[i]["retak"],
                    "stains": analyses[i]["noda"],
                    "overlay": analyses[i]["overlay"],
                    "detections": analyses[i].get("deteksi", []),
                },
            }
            for i, label in enumerate(labels)
        ],
    }


def _format_idr(value: int) -> str:
    return f"IDR {value:,.0f}"


def _setting(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value:
        return value
    try:
        return str(st.secrets.get(name, default))
    except StreamlitSecretNotFoundError:
        return default


def _input_signature(photos: list[Any], labels: list[str], info: dict[str, str], model: str) -> str:
    digest = hashlib.sha256()
    for photo, label in zip(photos, labels):
        digest.update(photo.name.encode("utf-8"))
        digest.update(label.encode("utf-8"))
        digest.update(photo.getvalue())
    digest.update(json.dumps(info, sort_keys=True).encode("utf-8"))
    digest.update(model.encode("utf-8"))
    return digest.hexdigest()


def _display_report(result: dict[str, Any]) -> None:
    report = result["report"]
    assessment = result["assessment"]
    st.subheader("Assessment")
    metric_columns = st.columns(4)
    metric_columns[0].metric(
        "Condition index", f"{assessment['condition_index']}/100" if assessment["condition_index"] is not None else "N/A"
    )
    metric_columns[1].metric("Category", assessment["category"])
    metric_columns[2].metric("Visible coverage", f"{assessment['coverage_percent']}%")
    metric_columns[3].metric(
        "Estimated repair cost",
        f"{_format_idr(assessment['cost_min_idr'])} – {_format_idr(assessment['cost_max_idr'])}",
    )
    st.write(report["summary"])
    if assessment["condition_index"] is None:
        st.info("At least 50% of the component weight must be visible before a condition index is calculated.")

    if report["safety_risks"]:
        st.warning("Potential safety risks: " + " ".join(report["safety_risks"]))
    if report["photo_quality"]:
        st.write("**Overall photo quality:**", report["photo_quality"])
    if report["photos_to_add"]:
        st.write("**Additional photos recommended:**", ", ".join(report["photos_to_add"]))

    st.subheader("Component assessment")
    rows = []
    for key, name, weight in COMPONENTS:
        item = report["components"][key]
        rows.append(
            {
                "Component": name,
                "Weight": f"{weight}%",
                "Score": item["score"] if item["score"] is not None else "Not visible",
                "Urgency": URGENCIES[item["urgency"]],
                "Estimated cost": (
                    f"{_format_idr(item['cost_min_idr'])} – {_format_idr(item['cost_max_idr'])}"
                    if item["cost_min_idr"] or item["cost_max_idr"]
                    else "—"
                ),
            }
        )
    st.dataframe(rows, use_container_width=True, hide_index=True)
    for key, name, _ in COMPONENTS:
        item = report["components"][key]
        with st.expander(f"{name} — score {item['score'] if item['score'] is not None else 'N/A'}"):
            if item["findings"]:
                st.write("**Findings**")
                for finding in item["findings"]:
                    st.markdown(f"- {finding}")
            else:
                st.write("No specific findings were reported.")
            st.write("**Recommendation:**", item["recommendation"] or "No recommendation provided.")
            st.write("**Urgency:**", URGENCIES[item["urgency"]])
            if item["photos"]:
                st.write("**Evidence photos:**", ", ".join(f"Photo {number}" for number in item["photos"]))

    st.subheader("Photo review")
    columns = st.columns(min(3, len(result["photos"])))
    for index, photo in enumerate(result["photos"]):
        analysis = photo["analysis"]
        with columns[index % len(columns)]:
            st.image(base64.b64decode(analysis["overlay"].split(",", 1)[1]), caption=f"Photo {index + 1}: {photo['label']}")
            quality = analysis["quality"]
            st.caption(
                f"Quality: {QUALITY_LABELS.get(quality['status'], 'Unknown')} · "
                f"Crack indications: {analysis['cracks']['jumlah']} · "
                f"Stain indications: {analysis['stains']['jumlah']}"
            )
            detections = analysis["detections"]
            if detections:
                st.caption(
                    "Model detections: "
                    + ", ".join(
                        f"{DETECTION_LABELS.get(detection['kelas'], detection['kelas'])} ({detection['skor']:.0%})"
                        for detection in detections
                    )
                )


def main() -> None:
    st.set_page_config(page_title="Home Condition Assessment", page_icon="🏠", layout="wide")
    st.title("Home Condition Assessment")
    st.write(
        "Upload photos of a home to receive an AI-assisted assessment of eight building components, "
        "a condition index, repair priorities, and estimated costs."
    )
    st.info(
        "This is a photo-based estimate, not a professional structural inspection. "
        "Computer-vision findings are heuristic indicators and may be inaccurate."
    )

    api_key = _setting("DEEPSEEK_API_KEY")
    model = _setting("DEEPSEEK_MODEL", "deepseek-flash")

    with st.expander("1. Home photos", expanded=True):
        uploads = st.file_uploader(
            "Choose photos (JPG, PNG, or WebP; up to 10 photos, 5 MB each)",
            type=["jpg", "jpeg", "png", "webp"],
            accept_multiple_files=True,
        )
        preview_width = st.slider(
            "Photo preview size",
            min_value=100,
            max_value=300,
            value=140,
            step=40,
            format="%d px",
        )
    if len(uploads) > MAX_PHOTOS:
        st.error(f"Please upload no more than {MAX_PHOTOS} photos.")
        uploads = uploads[:MAX_PHOTOS]

    labels = []
    if uploads:
        column_count = max(1, min(5, 720 // preview_width))
        preview_columns = st.columns(min(column_count, len(uploads)))
        for index, photo in enumerate(uploads):
            with preview_columns[index % len(preview_columns)]:
                st.image(photo, caption=f"Photo {index + 1}", width=preview_width)
                labels.append(
                    st.selectbox(
                        f"Area shown in photo {index + 1}",
                        ROOMS,
                        key=f"photo_label_{index}",
                    )
                )

    st.subheader("2. Building details (optional)")
    info_columns = st.columns(4)
    building_type = info_columns[0].text_input("Building type / floor area", placeholder="e.g. 45 m²")
    building_age = info_columns[1].text_input("Building age (years)", placeholder="e.g. 12")
    floors = info_columns[2].selectbox("Number of floors", ["Not specified", "1", "2", "3 or more"])
    city = info_columns[3].text_input("City", placeholder="e.g. Jakarta")
    info = {
        "type": building_type.strip(),
        "age": building_age.strip(),
        "floors": "" if floors == "Not specified" else floors,
        "city": city.strip(),
    }

    if info["age"] and (not info["age"].isdigit() or int(info["age"]) > 150):
        st.error("Building age must be a whole number between 0 and 150.")
        info["age"] = ""
    too_large = [index + 1 for index, photo in enumerate(uploads) if photo.size > MAX_PHOTO_BYTES]
    if too_large:
        st.error("Photos exceeding 5 MB: " + ", ".join(str(index) for index in too_large))
    disabled = not uploads or bool(too_large) or not api_key.strip()
    if not api_key.strip():
        st.warning("Assessment is unavailable. Configure DEEPSEEK_API_KEY in the app environment or Streamlit Secrets.")
    signature = _input_signature(uploads, labels, info, model.strip()) if uploads else ""
    if st.session_state.get("assessment_signature") != signature:
        st.session_state.pop("assessment_result", None)
        st.session_state.pop("assessment_signature", None)

    if st.button("Assess home condition", type="primary", disabled=disabled):
        try:
            with st.spinner("Analyzing photos and generating the report..."):
                client = Anthropic(
                    api_key=api_key.strip(),
                    base_url="https://api.deepseek.com/anthropic",
                )
                result = _assess_photos(uploads, labels, info, client, model.strip())
                st.session_state["assessment_result"] = result
                st.session_state["assessment_signature"] = signature
        except (ValueError, RuntimeError) as error:
            st.error(str(error))
        except AnthropicError as error:
            st.error(f"Assessment failed: {error}")

    result = st.session_state.get("assessment_result")
    if result:
        st.divider()
        _display_report(result)
        st.download_button(
            "Download report as JSON",
            data=json.dumps(result, ensure_ascii=False, indent=2),
            file_name="home-condition-report.json",
            mime="application/json",
        )


if __name__ == "__main__":
    main()
