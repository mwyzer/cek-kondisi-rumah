# Product and Engineering Guardrails

These guardrails apply to the full web application, its Python services, optional model workflows, and the Streamlit demo.

## 0. Language and compatibility

- Keep user-facing interfaces, new AI-generated report text, errors, prompts, and maintained documentation in English.
- Preserve existing database/API field names and status codes unless a versioned migration is explicitly planned; they are compatibility identifiers, not display copy.
- Translate legacy labels at the presentation boundary rather than changing persisted values. Do not imply that previously saved AI-generated report text has been translated.
- Keep examples and exported user-facing summaries in English while preserving any stable machine-readable keys required by existing consumers.

## 1. Assessment safety and user expectations

- Describe every result as a **preliminary, photo-based assessment**, not a professional inspection, engineering report, structural diagnosis, or safety certification.
- Do not claim a home is safe or unsafe solely from a model score. For possible structural failure, exposed electrical hazards, active gas leaks, major movement, or other immediate danger, advise users to avoid the affected area and contact qualified local professionals or emergency services as appropriate.
- Distinguish visible observations from inferred causes. Do not present a suspected leak, crack, mold patch, or defect as confirmed when the photo does not establish it.
- Mark components that are not visible as not assessed; never invent a score or treat missing evidence as a passing result.
- Explain that a low photo-quality rating or incomplete component coverage limits the assessment. Do not imply that image enhancement or a detector removes those limitations.

## 2. Scoring and cost estimates

- Keep the eight component weights and score-to-damage mapping explicit and testable.
- Calculate index, coverage, damage category, and totals in application code; do not rely on AI-generated derived values.
- Exclude invisible components from the weighted calculation and renormalize visible weights. Do not show an index or category below the 50% coverage threshold.
- Preserve valid score bounds (1–5 or null), non-negative costs, ordered minimum/maximum ranges, valid urgency values, and in-range photo references.
- Label repair costs as estimates in Indonesian rupiah. Do not represent them as bids, guarantees, or current verified market quotations.
- When changing scoring thresholds, weights, or estimation presentation, update the implementation, tests, and product documentation together.

## 3. AI and computer-vision behavior

- Treat AI output and heuristic/model detections as fallible. Use image-analysis results only as review hints, not as ground truth.
- Send the AI only the photos and building details needed for the requested assessment. Never send API keys, database credentials, access tokens, or unrelated user data in prompts.
- Require structured output validation and normalize untrusted model values before persistence or display.
- Show failures explicitly. Do not replace provider errors, malformed output, or analyzer failures with success-shaped empty reports.
- Do not execute code, shell commands, URLs, or instructions returned by the model.
- Keep safety guidance clear and consistent in every interface, including the English Streamlit demo.

## 4. Privacy, secrets, and storage

- Keep provider keys, database tokens, object-storage credentials, and worker tokens in environment variables or the deployment platform's secret manager. Never commit real credentials or include them in logs, prompts, downloads, or client-side code.
- Explain before deployment what photos, videos, assessment details, and derived results are sent to external providers and how they are stored.
- Minimize retention and access to uploaded media. Do not add public links or sharing behavior without clearly disclosing who can access the data.
- Treat public object-storage URLs as accessible to anyone who obtains the URL; use private storage and authorization when the use case requires confidentiality.
- Do not enable dataset tools or expensive 3D processing on an unauthenticated public deployment without suitable access controls, rate limits, and cost limits.
- Do not assume local SQLite or filesystem data is durable on ephemeral/serverless hosting. Configure and verify persistent storage before production use.
- Avoid logging raw photos, API keys, full prompts containing user details, or other sensitive assessment content.

## 5. Upload and service security

- Enforce file count, size, media-type, and content validation on the server; client-side checks are supplementary only.
- Handle malformed images, oversized requests, timeouts, provider failures, and unavailable optional services with clear, non-sensitive errors.
- Treat uploaded filenames and metadata as untrusted. Generate storage names and validate paths rather than using user-supplied paths.
- Protect externally reachable analyzer, dataset, blob-upload, and 3D-worker endpoints with appropriate authentication, authorization, and network restrictions.
- Validate remote URLs before server-side fetching; defend against private-network access and other server-side request forgery risks.
- Apply rate and concurrency limits to AI calls and GPU jobs. Set explicit size, duration, and per-user or per-deployment usage limits where practical.
- Return only the information a caller is authorized to access; do not expose secrets or internal stack traces in user-facing errors.

## 6. Dataset and model governance

- Obtain permission and appropriate rights before uploading, storing, labeling, or training on any photo.
- Avoid including identifiable people, addresses, documents, license plates, or other unnecessary personal information in training data.
- Review automated annotation suggestions before accepting them; retain the ability to correct or remove inaccurate boxes.
- Include representative homes, lighting, materials, regions, and damage conditions when building a dataset. Do not treat a small or synthetic-only test set as proof of real-world performance.
- Track the model and dataset version used where operationally feasible, and do not claim validated detector performance without suitable evaluation.
- Respect model licenses and do not deploy weights or components beyond their license terms.

## 7. 3D visualization

- Keep Gaussian Splatting output explicitly visual-only. It must not change component scores, condition index, category, or repair priority.
- Explain upload duration and processing expectations, and disclose external storage, GPU processing, URL access, and cost implications before enabling the workflow.
- Validate video type, duration, size, and remote processing inputs. Enforce job limits and expire or remove temporary media and outputs according to the deployment's retention policy.

## 8. Engineering and release quality

- Preserve existing behavior when adding an interface or deployment target; avoid silently replacing the full web experience with the Streamlit demo.
- Keep business rules and supported behavior documented. Add or update focused tests when changing parsing, normalization, scoring, upload validation, or persistence.
- Run relevant tests, type checks, and lint/build checks for changed code. Do not claim an external AI integration works end-to-end without an explicitly authorized live integration test.
- Keep dependency versions and deployment instructions reproducible. Do not add dependencies or permissions that are not needed for the feature.
- Make optional capabilities opt-in and fail visibly when configuration is incomplete; do not silently expose privileged or expensive features.
- Do not put secrets, real personal data, or sensitive property details in screenshots, fixtures, sample reports, or committed documentation.
