# Product Requirements Document

## 1. Product summary

**Home Condition Assessment** helps homeowners and property professionals review residential building condition from uploaded photos. An AI model describes visible evidence across eight building components. The application calculates a weighted condition index and damage category, and presents recommendations, urgency, and indicative repair-cost ranges.

The repository contains two experiences:

1. **Full web application:** a Next.js application with persistent assessment history, optional dataset-labeling and model-training workflows, and optional 3D Gaussian Splatting visualization.
2. **Streamlit demo:** a simplified English-language assessment flow that reuses the Python/OpenCV analyzer. Reports are held in the current Streamlit session and can be downloaded as JSON. It does not provide persistent history, dataset tools, or 3D scanning.

The Streamlit demo is an alternative interface, not a replacement for or feature-equivalent version of the full web application.

### Language and compatibility

- All current user-facing interfaces, newly generated report text, prompts, service errors, and maintained product documentation are in English.
- Existing database/API field names and persisted status values remain stable for compatibility. Display labels may map older stored Indonesian room names to English without rewriting stored records.
- Historical AI-generated report content is not translated automatically and may remain in Indonesian.

## 2. Problem and goals

Homeowners may have difficulty organizing visible maintenance issues, understanding which repairs need attention first, and communicating observations to a contractor. This product turns a set of home photos into a structured, preliminary report.

### Goals

- Make it straightforward to submit photos of relevant parts of a home.
- Summarize visible condition across a consistent set of building components.
- Show the evidence, limitations, repair recommendations, urgency, and estimated cost range in an understandable report.
- Keep calculated scores and categories deterministic and consistent with the published weighting rules.
- Offer a small, English-language Streamlit deployment path for assessment demonstrations.

### Non-goals

- Replacing an on-site inspection, engineering assessment, building-code review, or contractor quotation.
- Certifying that a property is safe, structurally sound, compliant, or fit for occupancy.
- Automatically estimating market value, insurance eligibility, or loan eligibility.
- Guaranteeing repair prices, diagnosis, or detection of every defect.
- Making the Streamlit demo feature-equivalent to the full web application.

## 3. Users

- **Homeowners and residents** who want to organize visible maintenance concerns and next steps.
- **Property managers or inspectors** who want a preliminary, photo-based report to support follow-up.
- **Dataset maintainers** who curate annotated damage photos to train the optional detector. This is a workflow in the full web application, not the Streamlit demo.

## 4. Core user journey

### Full web application

1. The user uploads one or more photos and identifies the area shown.
2. The user may provide building type or area, age, number of floors, and city.
3. The server validates the submission and may run the optional Python/OpenCV photo analyzer.
4. The AI assesses visible evidence and returns a structured report.
5. The application normalizes AI output, calculates derived scores, and stores the report.
6. The user reviews the report, photo analysis, recommendations, and any available optional 3D room visualization.
7. The user can return to saved assessments in history.

### Streamlit demo

1. The user uploads up to 10 photos (JPG, PNG, or WebP; up to 5 MB each). Anthropic credentials and model settings are preconfigured in the deployment environment or Streamlit Secrets; the interface does not expose AI configuration.
2. The user labels each photo and may enter building details.
3. The app runs the shared OpenCV analyzer and requests a structured report from the configured Anthropic model.
4. The app calculates the condition index and category, then displays findings and indicative repair-cost ranges.
5. The user may download the current report as JSON.

## 5. Functional requirements

### 5.1 Photo input

- Accept supported image types and reject invalid or oversized files with a visible error.
- Support up to 10 photos per assessment.
- Let the user associate each photo with a room, building component, or damage detail.
- Preserve photo ordering so report evidence references identify the correct image.
- Provide useful preview and processing status feedback.
- Present user-facing labels, validation messages, and help text in English; preserve stable machine-readable field names and status values for compatibility.

### 5.2 Photo analysis

- Assess photo clarity, brightness, and resolution.
- Provide heuristic crack and stain indicators and a marked-up image when the analyzer is available.
- Treat computer-vision output as an indication for review, not a confirmed defect.
- Allow the full web application to use the optional trained RF-DETR detector when installed and configured.

### 5.3 AI assessment and report

- Assess the following eight components: structure; roof and gutters; walls; flooring; ceiling; doors, windows, and frames; utilities; and finishes and paint.
- Return a score from 1 to 5, or “not visible,” for each component.
- Include visible findings, recommendations, urgency, repair-cost ranges, and supporting photo numbers.
- Include an overall summary, potential safety risks, photo-quality notes, and requests for additional photos.
- Use the configured AI provider and present provider errors as failures rather than implying a successful assessment.
- Require newly generated user-facing report text to be in English; do not treat historical saved report text as translated.

### 5.4 Derived assessment

- Map component scores to damage percentages: 5 → 0%, 4 → 10%, 3 → 30%, 2 → 55%, and 1 → 85%.
- Calculate the weighted damage percentage from visible components only, renormalizing the remaining weights.
- Use component weights of 25%, 20%, 15%, 10%, 10%, 8%, 7%, and 5%, respectively.
- Calculate and display an index of 100 minus weighted damage, rounded to the nearest whole number.
- Withhold the index and category unless at least 50% of component weight is visible.
- Classify calculated damage as Good (<10%), Minor (≤30%), Moderate (≤45%), or Severe (>45%).
- Sum component-level cost estimates for an indicative report-level range.

### 5.5 Report persistence and supporting workflows

- The full web application stores assessments and exposes their history for later review.
- The full web application may enable dataset upload, bounding-box annotation, COCO export, and RF-DETR training workflows.
- The full web application may enable 3D Gaussian Splatting visualization for uploaded room videos. This is a visual aid only and must not alter the assessment score.
- The Streamlit demo keeps results in the active session and offers JSON download; persistent history is not part of its current scope.

## 6. Product requirements and quality attributes

- **Clarity:** distinguish observed evidence, AI interpretation, automated image-analysis hints, calculated values, and user-provided information.
- **Reliability:** validate input and structured AI output; compute derived values in application code rather than trusting model-generated totals.
- **Privacy:** explain what data is sent to external AI or storage providers; avoid collecting information that is not needed for an assessment.
- **Safety:** communicate uncertainty and direct users to a qualified professional for serious or safety-critical concerns.
- **Accessibility:** use clear labels, readable contrast, keyboard-operable controls, and actionable error messages.
- **Deployment:** support local development and external deployment with secrets configured outside source control.
- **Maintainability:** retain a single authoritative definition of assessment weights and scoring behavior per application implementation; update tests and documentation when these rules change.

## 7. Success measures

- Users can complete a photo assessment and understand how to review its report.
- Invalid files and unavailable AI services produce explicit, actionable feedback.
- Every displayed index and category is reproducible from the documented weights and score mapping.
- Report evidence references resolve to the uploaded photo order.
- The Streamlit demo can be deployed independently with configured Python dependencies and provider secrets.
- Serious limitations, including the absence of an in-person inspection, are visible to users.

These measures define intended product behavior; they do not imply that model accuracy or cost-estimate accuracy has been established.

## 8. Constraints and assumptions

- AI assessment requires a configured provider and may incur usage charges.
- Cost estimates are indicative, depend on location and current market conditions, and are not quotations.
- The OpenCV analyzer uses classical image-processing heuristics; it can produce false positives and false negatives.
- The optional trained detector depends on the availability and quality of a locally trained model.
- Full-web production deployment requires suitable persistent database and object-storage configuration. Local files alone may not persist on serverless hosting.
- Dataset and 3D workflows require additional configuration and can incur infrastructure or GPU costs.
- The application currently has no general user-authentication system; deployment must account for this limitation before exposing sensitive or costly functions publicly.
