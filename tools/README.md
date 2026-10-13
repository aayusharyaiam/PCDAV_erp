# Documentation tools

Install and regenerate the Word report from the Markdown source:

```bash
cd tools
npm install
npm run build-school-report
```

The generator reads `school-review-report.md` and writes the valid Office Open XML file at the repository root. Validate it with Microsoft Word automation on Windows or with the ZIP/XML checks documented in `PROGRESS.md`.
