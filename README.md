# n8n-nodes-liteparse

This is an n8n community node. It lets you use [LiteParse](https://github.com/run-llama/liteparse) in your n8n workflows.

LiteParse is a local document parsing library by LlamaIndex that extracts text and structured data from PDFs — no API key or external service required. It runs entirely on your n8n server.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Search for `n8n-nodes-liteparse` in the community nodes panel.

## Operations

### Parse

Extracts text or structured JSON from a document file on the server.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| File Path | string | — | Absolute path to the document on the server |
| Output Format | `text` / `json` | `text` | `text` returns plain text; `json` returns per-page text items with coordinates |
| OCR Enabled | boolean | `true` | Run OCR on pages with little or no native text |
| Target Pages | string | all | Page range to parse, e.g. `1-5,10` |
| OCR Language | string | `en` | ISO 639-1 language code for OCR |
| DPI | number | `150` | Rendering resolution — higher improves OCR accuracy |
| Password | string | — | Password for encrypted documents |

**Output (text format):**
```json
{ "text": "Full extracted text..." }
```

**Output (json format):**
```json
{
  "text": "Full extracted text...",
  "pages": [
    { "page": 1, "width": 612, "height": 792, "text": "...", "textItems": [...] }
  ]
}
```

---

### Screenshot

Renders document pages as PNG files saved to a directory on the server.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| File Path | string | — | Absolute path to the document on the server |
| Output Directory | string | — | Absolute path to an existing directory for PNG output |
| Target Pages | string | all | Page range to screenshot, e.g. `1-3,5` |
| DPI | number | `150` | Rendering resolution for the PNG images |

**Output:**
```json
{
  "screenshots": [
    { "pageNum": 1, "width": 918, "height": 1188, "imagePath": "/path/to/page_1.png" }
  ]
}
```

## Compatibility

- Requires n8n v1.0 or higher
- Tested against n8n v1.x
- No credentials required — LiteParse runs locally on the n8n server

## Usage

### Parsing a PDF to text

1. Add a **LiteParse** node to your workflow
2. Set **Operation** to `Parse`
3. Set **File Path** to the absolute path of a PDF on your server (e.g. `/home/user/report.pdf`)
4. Leave **Output Format** as `text`
5. The node outputs `{ text: "..." }` — wire it to a downstream node

### Extracting structured data (JSON format)

Set **Output Format** to `json` to get per-page text items with bounding box coordinates. Useful for table extraction or layout-aware processing.

### Generating page screenshots

1. Set **Operation** to `Screenshot`
2. Set **File Path** to your document
3. Set **Output Directory** to an existing directory (create it first if needed)
4. The node saves `page_1.png`, `page_2.png`, etc. and returns their paths

> **Note:** The output directory must already exist. The node will throw an error if it does not.

### Parsing only specific pages

Use the **Target Pages** field with a range string:
- `1` — first page only
- `1-5` — pages 1 through 5
- `1-3,7,10-12` — pages 1–3, 7, and 10–12

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [LiteParse GitHub repository](https://github.com/run-llama/liteparse)
- [LlamaIndex documentation](https://docs.llamaindex.ai/)
