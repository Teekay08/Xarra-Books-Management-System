import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (browserInstance) {
    // Verify the existing instance is still usable
    try {
      await browserInstance.version();
    } catch {
      browserInstance = null;
    }
  }
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      userDataDir: undefined, // use a fresh temp dir each launch
    });
  }
  return browserInstance;
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/**
 * Replace relative /uploads/ image URLs with inline base64 data URIs
 * so Puppeteer doesn't need to make HTTP requests back to the server.
 */
async function inlineLocalImages(html: string): Promise<string> {
  const matches = [...html.matchAll(/src="(\/uploads\/[^"]+)"/g)];
  let result = html;
  for (const match of matches) {
    const urlPath = match[1];
    const filePath = path.join(process.cwd(), 'data', urlPath);
    try {
      const buffer = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'image/png';
      const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
      result = result.replace(`src="${urlPath}"`, `src="${dataUri}"`);
    } catch {
      // File not found — leave the URL as-is with absolute fallback
      const baseUrl = `http://localhost:${config.port}`;
      result = result.replace(`src="${urlPath}"`, `src="${baseUrl}${urlPath}"`);
    }
  }
  return result;
}

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const resolved = await inlineLocalImages(html);
    await page.setContent(resolved, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
