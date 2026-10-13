# Documentation tools

**Documentation revision:** 0.4 — 13 October 2026. The management report now describes the tested Level 4 staging slice and the remaining financial release gates, without presenting it as production-ready.

Install dependencies, regenerate the Word report, and validate the package from the repository root:

```bash
npm --prefix tools install
npm --prefix tools run build-school-report
python3 tools/validate-school-report.py
```

The generator reads `school-review-report.md` and writes `PCDAV_school_ERP_school_review_report.docx`. Edit the Markdown source first, then regenerate and commit both files together. The report contains no live credentials or student records. It is a management artifact, not the application's payment receipt PDF feature (which remains unimplemented).

`validate-school-report.py` uses Python's standard library to check ZIP integrity, required Office Open XML parts, XML parsing, internal relationship targets and the presence of every non-formatting source-text fragment. It does not establish visual rendering, pagination or printer readiness. Open the result in Word/LibreOffice for visual approval when that application is available; do not treat an earlier Word-opening check as validation of a newly generated revision.

Application verification and the next implementation task are recorded in `PROGRESS.md`. Root PRD/design/TRD/roadmap documents describe target requirements alongside explicit staging coverage; the historical legacy audit and observed reference values remain distinct evidence.
