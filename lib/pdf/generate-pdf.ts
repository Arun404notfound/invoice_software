import puppeteer, { type Browser } from "puppeteer";

const globalForPuppeteer = globalThis as unknown as {
  puppeteerBrowser: Promise<Browser> | undefined;
};

function getBrowser(): Promise<Browser> {
  if (!globalForPuppeteer.puppeteerBrowser) {
    globalForPuppeteer.puppeteerBrowser = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return globalForPuppeteer.puppeteerBrowser;
}

/**
 * Renders an HTML string to a PDF buffer via a shared, lazily-launched
 * Chromium instance (reused across requests — relaunching per request is
 * slow and unnecessary). No JS runs on the page beyond default browser
 * behavior, and the HTML itself contains no timestamps/randomness, so
 * output is deterministic for a given input.
 */
export async function generatePdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
