import type { Browser } from "puppeteer-core";

const globalForPuppeteer = globalThis as unknown as {
  puppeteerBrowser: Promise<Browser> | undefined;
};

/**
 * Vercel's serverless functions can't run the full ~280MB Chromium that
 * `puppeteer` bundles, so production launches via `puppeteer-core` +
 * `@sparticuz/chromium` (a build made to fit that environment) instead.
 * Locally, `@sparticuz/chromium`'s Linux-only binary won't run on a dev
 * machine, so dev keeps using full `puppeteer`. `process.env.VERCEL` is
 * set automatically by Vercel's build/runtime, not something we set.
 */
async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const [{ default: chromium }, puppeteerCore] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const puppeteer = await import("puppeteer");
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }) as unknown as Promise<Browser>;
}

function getBrowser(): Promise<Browser> {
  if (!globalForPuppeteer.puppeteerBrowser) {
    globalForPuppeteer.puppeteerBrowser = launchBrowser();
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
