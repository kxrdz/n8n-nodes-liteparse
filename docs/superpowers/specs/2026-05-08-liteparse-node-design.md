# LiteParse n8n Node — Design Spec

**Date:** 2026-05-08
**Status:** Approved

---

## Overview

Build a single n8n community node (`LiteParse`) that wraps the `@llamaindex/liteparse` local document parsing library. The node runs entirely on the n8n server — no external API, no credentials required.

---

## Architecture

**Node type:** Programmatic (`execute()` method). No declarative HTTP routing — the library is called directly in TypeScript.

**No credentials file** — LiteParse is a local library with zero authentication.

### File Structure

```
nodes/LiteParse/
  LiteParse.node.ts       # Main node implementation
  LiteParse.node.json     # Node display metadata
  liteparse.svg           # Node icon
```

**Dependency:** Add `@llamaindex/liteparse` to `package.json` as a runtime dependency.

Update `package.json` `n8n.nodes` array to include `dist/nodes/LiteParse/LiteParse.node.js`.

---

## Operations

The node exposes a single **Operation** dropdown with two values: `Parse` and `Screenshot`.

### Parse

Extracts text (or structured JSON with bounding boxes) from a document file on the server.

**Properties:**

| Property | Type | Required | Default | Notes |
|---|---|---|---|---|
| File Path | string | yes | — | Absolute path to document on server |
| Output Format | options | yes | `text` | `text` or `json` |
| OCR Enabled | boolean | no | `true` | Enable Tesseract.js OCR |
| Target Pages | string | no | — | Page range, e.g. `1-5,10` |
| OCR Language | string | no | `en` | Language code for OCR |
| DPI | number | no | `150` | Rendering resolution |
| Password | string (password) | no | — | For encrypted documents |

**Output (text format):**
```json
{ "text": "extracted text content" }
```

**Output (json format):**
```json
{
  "text": "extracted text content",
  "pages": [
    {
      "pageNum": 1,
      "textItems": [
        { "text": "item text", "bbox": [x1, y1, x2, y2] }
      ]
    }
  ]
}
```

### Screenshot

Renders document pages as PNG images saved to a directory on the server.

**Properties:**

| Property | Type | Required | Default | Notes |
|---|---|---|---|---|
| File Path | string | yes | — | Absolute path to document on server |
| Output Directory | string | yes | — | Directory to write PNG files into |
| Target Pages | string | no | — | Page range, e.g. `1-3` |
| DPI | number | no | `150` | Rendering resolution |

**Output:**
```json
{
  "screenshots": [
    { "pageNum": 1, "width": 1240, "height": 1754, "imagePath": "/output/page_1.png" }
  ]
}
```

Image buffers are written to disk; only file paths are returned in the n8n item (buffers are too large for item payloads).

---

## Data Flow

### Parse

1. Read `filePath` + options from node parameters
2. Instantiate `new LiteParse({ ocrEnabled, ocrLanguage, dpi, outputFormat, targetPages, password })`
3. Call `liteParse.parse(filePath)`
4. Return result as n8n item JSON

### Screenshot

1. Read `filePath`, `outputDirectory`, and options from node parameters
2. Instantiate `new LiteParse({ dpi, targetPages })`
3. Call `liteParse.screenshot(filePath)` — returns `Array<{ pageNum, width, height, imageBuffer }>`
4. Write each `imageBuffer` to `<outputDirectory>/page_<pageNum>.png`
5. Return `{ screenshots: [{ pageNum, width, height, imagePath }] }`

---

## Error Handling

| Scenario | Response |
|---|---|
| File not found | Throw `NodeOperationError` with message: `File not found: <path>` |
| Parse library error | Wrap in `NodeOperationError` with original message |
| Output directory does not exist | Throw `NodeOperationError`: `Output directory does not exist: <path>. Please create it first.` |
| Screenshot write failure | Wrap fs error in `NodeOperationError` |

---

## Out of Scope

- Binary data input from previous nodes (file path only)
- Batch processing of multiple files in one execution (run node in a loop instead)
- Custom OCR server configuration (can be added later)
