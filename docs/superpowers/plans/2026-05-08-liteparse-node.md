# LiteParse Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single programmatic n8n community node that wraps `@llamaindex/liteparse` to parse documents and generate page screenshots on the n8n server.

**Architecture:** Programmatic `execute()` node (no declarative HTTP routing). No credentials required — LiteParse runs entirely locally. Two operations: `Parse` (extract text or structured JSON) and `Screenshot` (render pages as PNG files on disk).

**Tech Stack:** TypeScript, `@llamaindex/liteparse@^1.5.3`, Node.js `fs`/`path`, n8n-workflow types.

---

## Key Type Reference

These are the actual types from `@llamaindex/liteparse` — use them exactly:

```typescript
// LiteParseConfig (constructor, all optional via Partial<>)
{
  ocrEnabled: boolean;        // default true
  ocrLanguage: string;        // default "en"
  dpi: number;                // default 150
  outputFormat: "json"|"text";// default "json"
  targetPages?: string;       // e.g. "1-5,10" — parse only
  password?: string;
  maxPages: number;           // default 1000
}

// ParseResult (returned by parse())
{
  text: string;               // always present
  pages: ParsedPage[];        // always present
  json?: ParseResultJson;     // only when outputFormat === "json"
}

// ParseResultJson.pages[]
{ page: number; width: number; height: number; text: string; textItems: JsonTextItem[]; }

// ScreenshotResult (each element of screenshot() return array)
{ pageNum: number; width: number; height: number; imageBuffer: Buffer; imagePath?: string; }

// screenshot() signature:
screenshot(input: LiteParseInput, pageNumbers?: number[], quiet?: boolean): Promise<ScreenshotResult[]>
// NOTE: pageNumbers is number[], not a string range — must parse "1-3,5" → [1,2,3,5]
```

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Add runtime dep + register node |
| Create | `nodes/LiteParse/LiteParse.node.ts` | Full node implementation |
| Create | `nodes/LiteParse/LiteParse.node.json` | Codex metadata |
| Create | `nodes/LiteParse/liteparse.svg` | Node icon |

---

## Task 1: Add Dependency and Register Node

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the runtime dependency**

```bash
npm install @llamaindex/liteparse
```

Expected: `package-lock.json` updated, `@llamaindex/liteparse` appears in `node_modules/`.

- [ ] **Step 2: Add runtime dependency and register node in package.json**

Open `package.json`. Make two changes:

Add a `"dependencies"` block (between `"devDependencies"` and `"peerDependencies"`):
```json
"dependencies": {
  "@llamaindex/liteparse": "^1.5.3"
},
```

Add the node path to the `"n8n"."nodes"` array:
```json
"nodes": [
  "dist/nodes/GithubIssues/GithubIssues.node.js",
  "dist/nodes/Example/Example.node.js",
  "dist/nodes/LiteParse/LiteParse.node.js"
]
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @llamaindex/liteparse dependency and register LiteParse node"
```

---

## Task 2: Create Node Icon

**Files:**
- Create: `nodes/LiteParse/liteparse.svg`

- [ ] **Step 1: Create the SVG icon**

Create `nodes/LiteParse/liteparse.svg` with this content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <rect x="8" y="4" width="36" height="46" rx="3" fill="#6366f1"/>
  <rect x="8" y="4" width="36" height="46" rx="3" fill="none" stroke="#4f46e5" stroke-width="1.5"/>
  <path d="M38 4v12h10L38 4z" fill="#4f46e5"/>
  <rect x="14" y="22" width="20" height="2.5" rx="1.2" fill="white" opacity="0.9"/>
  <rect x="14" y="28" width="24" height="2.5" rx="1.2" fill="white" opacity="0.9"/>
  <rect x="14" y="34" width="18" height="2.5" rx="1.2" fill="white" opacity="0.9"/>
  <rect x="14" y="40" width="22" height="2.5" rx="1.2" fill="white" opacity="0.9"/>
  <circle cx="46" cy="46" r="12" fill="#10b981"/>
  <path d="M40 46l4 4 8-8" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add nodes/LiteParse/liteparse.svg
git commit -m "feat: add LiteParse node icon"
```

---

## Task 3: Create Node Metadata File

**Files:**
- Create: `nodes/LiteParse/LiteParse.node.json`

- [ ] **Step 1: Create the codex metadata file**

Create `nodes/LiteParse/LiteParse.node.json`:

```json
{
  "node": "n8n-nodes-liteparse",
  "nodeVersion": "1.0",
  "codexVersion": "1.0",
  "categories": ["AI", "Developer Tools"],
  "resources": {
    "primaryDocumentation": [
      {
        "url": "https://github.com/run-llama/liteparse"
      }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add nodes/LiteParse/LiteParse.node.json
git commit -m "feat: add LiteParse node metadata"
```

---

## Task 4: Implement LiteParse Node — Parse Operation

**Files:**
- Create: `nodes/LiteParse/LiteParse.node.ts`

- [ ] **Step 1: Create the node file with Parse operation**

Create `nodes/LiteParse/LiteParse.node.ts`:

```typescript
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { LiteParse } from '@llamaindex/liteparse';
import * as fs from 'fs';
import * as path from 'path';

function parsePageRange(range: string): number[] {
  const numbers: number[] = [];
  for (const part of range.split(',')) {
    const trimmed = part.trim();
    const dashIndex = trimmed.indexOf('-');
    if (dashIndex === -1) {
      numbers.push(parseInt(trimmed, 10));
    } else {
      const start = parseInt(trimmed.slice(0, dashIndex), 10);
      const end = parseInt(trimmed.slice(dashIndex + 1), 10);
      for (let i = start; i <= end; i++) {
        numbers.push(i);
      }
    }
  }
  return numbers;
}

export class LiteParseNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'LiteParse',
    name: 'liteParse',
    icon: 'file:liteparse.svg',
    group: ['transform'],
    version: 1,
    description: 'Parse documents and generate page screenshots using LiteParse (local, no API key required)',
    defaults: {
      name: 'LiteParse',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Parse',
            value: 'parse',
            description: 'Extract text or structured JSON from a document',
            action: 'Parse a document',
          },
          {
            name: 'Screenshot',
            value: 'screenshot',
            description: 'Render document pages as PNG image files',
            action: 'Screenshot a document',
          },
        ],
        default: 'parse',
      },

      // ── Shared ──────────────────────────────────────────────────────────
      {
        displayName: 'File Path',
        name: 'filePath',
        type: 'string',
        default: '',
        required: true,
        placeholder: '/home/user/documents/report.pdf',
        description: 'Absolute path to the document file on the server',
      },

      // ── Parse options ────────────────────────────────────────────────────
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          { name: 'Text', value: 'text', description: 'Plain text with layout preserved' },
          { name: 'JSON', value: 'json', description: 'Structured JSON with per-page text items and coordinates' },
        ],
        default: 'text',
        displayOptions: { show: { operation: ['parse'] } },
        description: 'Format of the parsed output',
      },
      {
        displayName: 'OCR Enabled',
        name: 'ocrEnabled',
        type: 'boolean',
        default: true,
        displayOptions: { show: { operation: ['parse'] } },
        description: 'Whether to run OCR on pages with little or no native text',
      },
      {
        displayName: 'Target Pages',
        name: 'targetPages',
        type: 'string',
        default: '',
        placeholder: '1-5,10',
        description: 'Comma-separated page numbers and ranges to parse. Leave empty to parse all pages.',
        displayOptions: { show: { operation: ['parse'] } },
      },
      {
        displayName: 'OCR Language',
        name: 'ocrLanguage',
        type: 'string',
        default: 'en',
        displayOptions: { show: { operation: ['parse'] } },
        description: 'ISO 639-1 language code for OCR (e.g. en, fr, de)',
      },
      {
        displayName: 'DPI',
        name: 'dpi',
        type: 'number',
        default: 150,
        displayOptions: { show: { operation: ['parse'] } },
        description: 'Rendering resolution. Higher values improve OCR accuracy but increase processing time.',
      },
      {
        displayName: 'Password',
        name: 'password',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        displayOptions: { show: { operation: ['parse'] } },
        description: 'Password for encrypted or protected documents',
      },

      // ── Screenshot options ───────────────────────────────────────────────
      {
        displayName: 'Output Directory',
        name: 'outputDirectory',
        type: 'string',
        default: '',
        required: true,
        placeholder: '/home/user/screenshots',
        description: 'Absolute path to the directory where PNG files will be saved. Must already exist.',
        displayOptions: { show: { operation: ['screenshot'] } },
      },
      {
        displayName: 'Target Pages',
        name: 'screenshotTargetPages',
        type: 'string',
        default: '',
        placeholder: '1-3,5',
        description: 'Comma-separated page numbers and ranges to screenshot. Leave empty for all pages.',
        displayOptions: { show: { operation: ['screenshot'] } },
      },
      {
        displayName: 'DPI',
        name: 'screenshotDpi',
        type: 'number',
        default: 150,
        displayOptions: { show: { operation: ['screenshot'] } },
        description: 'Rendering resolution for screenshots.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        const filePath = this.getNodeParameter('filePath', i) as string;

        if (!fs.existsSync(filePath)) {
          throw new NodeOperationError(this.getNode(), `File not found: ${filePath}`, { itemIndex: i });
        }

        if (operation === 'parse') {
          const outputFormat = this.getNodeParameter('outputFormat', i) as 'text' | 'json';
          const ocrEnabled = this.getNodeParameter('ocrEnabled', i) as boolean;
          const targetPages = this.getNodeParameter('targetPages', i) as string;
          const ocrLanguage = this.getNodeParameter('ocrLanguage', i) as string;
          const dpi = this.getNodeParameter('dpi', i) as number;
          const password = this.getNodeParameter('password', i) as string;

          const parser = new LiteParse({
            ocrEnabled,
            outputFormat,
            ocrLanguage,
            dpi,
            ...(targetPages ? { targetPages } : {}),
            ...(password ? { password } : {}),
          });

          const result = await parser.parse(filePath, true);

          const json =
            outputFormat === 'json'
              ? { text: result.text, pages: result.json?.pages ?? [] }
              : { text: result.text };

          returnData.push({ json });
        } else if (operation === 'screenshot') {
          const outputDirectory = this.getNodeParameter('outputDirectory', i) as string;
          const screenshotTargetPages = this.getNodeParameter('screenshotTargetPages', i) as string;
          const screenshotDpi = this.getNodeParameter('screenshotDpi', i) as number;

          if (!fs.existsSync(outputDirectory)) {
            throw new NodeOperationError(
              this.getNode(),
              `Output directory does not exist: ${outputDirectory}. Please create it first.`,
              { itemIndex: i },
            );
          }

          const pageNumbers = screenshotTargetPages ? parsePageRange(screenshotTargetPages) : undefined;

          const parser = new LiteParse({ dpi: screenshotDpi });
          const screenshots = await parser.screenshot(filePath, pageNumbers, true);

          const savedScreenshots = [];
          for (const shot of screenshots) {
            const imagePath = path.join(outputDirectory, `page_${shot.pageNum}.png`);
            fs.writeFileSync(imagePath, shot.imageBuffer);
            savedScreenshots.push({
              pageNum: shot.pageNum,
              width: shot.width,
              height: shot.height,
              imagePath,
            });
          }

          returnData.push({ json: { screenshots: savedScreenshots } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: this.getInputData(i)[0].json,
            error: error as Error,
            pairedItem: i,
          });
        } else {
          if ((error as { context?: unknown }).context) {
            (error as { context: { itemIndex: number } }).context.itemIndex = i;
            throw error;
          }
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
        }
      }
    }

    return [returnData];
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
npm run build
```

Expected: Output ends with no errors. `dist/nodes/LiteParse/LiteParse.node.js` is created.

If you see `error TS...` lines, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add nodes/LiteParse/LiteParse.node.ts
git commit -m "feat: implement LiteParse node with parse and screenshot operations"
```

---

## Task 5: Verify Full Build and Smoke Test

**Files:** None created, build output verified.

- [ ] **Step 1: Run a clean build**

```bash
npm run build
```

Expected: `dist/nodes/LiteParse/LiteParse.node.js` exists. No TypeScript errors.

- [ ] **Step 2: Confirm the node is in the dist output**

```bash
ls dist/nodes/LiteParse/
```

Expected output:
```
LiteParse.node.d.ts
LiteParse.node.js
LiteParse.node.js.map
liteparse.svg
```

- [ ] **Step 3: Smoke test Parse (text mode)**

Create a test script `/tmp/test-liteparse.mjs` and run it to verify the library works before wiring it into n8n:

```js
import { LiteParse } from '@llamaindex/liteparse';
import { writeFileSync } from 'fs';

// Create a minimal 1-page PDF for testing
// Download a sample PDF
const resp = await fetch('https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf');
const buf = Buffer.from(await resp.arrayBuffer());
writeFileSync('/tmp/test.pdf', buf);

const parser = new LiteParse({ outputFormat: 'text', ocrEnabled: false });
const result = await parser.parse('/tmp/test.pdf', true);
console.log('TEXT OUTPUT:', result.text.slice(0, 200));
console.log('PAGES:', result.pages.length);
```

```bash
node /tmp/test-liteparse.mjs
```

Expected: Prints extracted text and page count. No exceptions.

- [ ] **Step 4: Smoke test Screenshot**

```js
import { LiteParse } from '@llamaindex/liteparse';
import { mkdirSync } from 'fs';

mkdirSync('/tmp/liteparse-screenshots', { recursive: true });

const parser = new LiteParse({ dpi: 72 });
const shots = await parser.screenshot('/tmp/test.pdf', [1], true);
console.log('Screenshots:', shots.length, 'Width:', shots[0].width, 'Height:', shots[0].height);
```

Save as `/tmp/test-screenshot.mjs` and run:

```bash
node /tmp/test-screenshot.mjs
```

Expected: Prints screenshot count and dimensions. No exceptions.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: complete LiteParse node implementation"
```

---

## Self-Review Against Spec

| Spec Requirement | Covered By |
|---|---|
| Programmatic node, no credentials | Task 4 — `execute()` method, no credentials block |
| Parse operation with text/json format | Task 4 — `outputFormat` param, parse branch |
| Parse options: OCR enabled, target pages, language, DPI, password | Task 4 — all params present |
| Screenshot operation with output dir, target pages, DPI | Task 4 — screenshot branch |
| File not found error | Task 4 — `fs.existsSync` check |
| Output dir not found error | Task 4 — `fs.existsSync` check on outputDirectory |
| Library errors wrapped in NodeOperationError | Task 4 — catch block |
| Buffers written to disk, paths returned | Task 4 — `fs.writeFileSync` + imagePath in output |
| `@llamaindex/liteparse` as runtime dep | Task 1 |
| Node registered in package.json | Task 1 |
| SVG icon | Task 2 |
| Node metadata JSON | Task 3 |
