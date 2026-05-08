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
            error: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i }),
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
