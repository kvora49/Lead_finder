/**
 * Universal Business Lead Finder - Cloud Functions
 * Zero-Cost Scraping Architecture for College Project
 */

const {onRequest, onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin to bypass bot detection
puppeteer.use(StealthPlugin());

/**
 * Test Function: Scrape Google Maps for Business Leads
 * 
 * Usage: Call from frontend with query like "restaurants in ahmedabad"
 * Returns: Array of business leads with name, address, phone, rating
 */
exports.scrapeMapsTest = onCall({
  timeoutSeconds: 60,
  memory: "512MiB",
  maxInstances: 2,
}, async (request) => {
  const {query} = request.data;

  if (!query) {
    throw new Error("Missing required parameter: query");
  }

  logger.info("Starting Google Maps scrape for:", query);

  let browser;
  try {
    // Launch headless browser with stealth mode
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920x1080",
      ],
    });

    const page = await browser.newPage();

    // Randomize viewport to appear more human-like
    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100),
    });

    // Randomize User-Agent
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUA);

    // Navigate to Google Maps search
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    logger.info("Navigating to:", searchUrl);

    await page.goto(searchUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for results to load
    await page.waitForSelector("div[role='feed']", {timeout: 10000});

    // Human-like delay before scrolling
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));

    // Scroll to load more results
    const feedSelector = "div[role='feed']";
    await page.evaluate(async (selector) => {
      const feed = document.querySelector(selector);
      if (feed) {
        for (let i = 0; i < 5; i++) {
          feed.scrollTop = feed.scrollHeight;
          await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
        }
      }
    }, feedSelector);

    // Extract business data
    const businesses = await page.evaluate(() => {
      const results = [];
      const items = document.querySelectorAll("div[role='feed'] > div > div");

      items.forEach((item) => {
        try {
          const name = item.querySelector("div.fontHeadlineSmall")?.textContent?.trim();
          const rating = item.querySelector("span[role='img']")?.getAttribute("aria-label");
          const address = item.querySelector("div.fontBodyMedium > div:nth-child(2) > div:last-child > span:last-child")?.textContent?.trim();

          if (name) {
            results.push({
              name,
              rating: rating || "No rating",
              address: address || "Address not available",
              source: "Google Maps",
            });
          }
        } catch (e) {
          // Skip malformed entries
        }
      });

      return results;
    });

    logger.info(`Successfully scraped ${businesses.length} businesses`);

    return {
      success: true,
      query,
      resultsCount: businesses.length,
      leads: businesses.slice(0, 50), // Limit to 50 for testing
      scrapedAt: new Date().toISOString(),
      cost: "$0.00",
    };
  } catch (error) {
    logger.error("Scraping error:", error);
    throw new Error(`Scraping failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Original hello world function (keep for testing)
exports.helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

// Simple test function
exports.helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

