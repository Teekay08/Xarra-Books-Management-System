import puppeteer from 'puppeteer';
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

/**
 * Rewrites relative URLs (e.g. /uploads/logo.png) in the HTML
 * to absolute URLs so Puppeteer can load them via setContent.
 */
function resolveRelativeUrls(html: string): string {
  const baseUrl = `http://localhost:${config.port}`;
  return html.replace(/src="(\/[^"]+)"/g, `src="${baseUrl}$1"`);
}

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const resolved = resolveRelativeUrls(html);
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
