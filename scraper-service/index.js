const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Apply stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT || '{}'
    );
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || 'lead-finder-6b009'
    });
    
    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
  }
}

// Initialize on startup
initializeFirebase();

// Security middleware - Check secret key
function validateSecretKey(req, res, next) {
  const secretKey = req.headers['x-secret-key'];
  const expectedKey = process.env.SECRET_KEY || 'your-secret-key-here';
  
  if (!secretKey || secretKey !== expectedKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing x-secret-key header'
    });
  }
  
  next();
}

// Helper function: Random delay to mimic human behavior
function randomDelay(min = 2000, max = 5000) {
  return new Promise(resolve => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(resolve, delay);
  });
}

// Helper function: Scroll to load more results
async function autoScroll(page) {
  await page.evaluate(async () => {
    const scrollableDiv = document.querySelector('div[role="feed"]');
    if (scrollableDiv) {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = scrollableDiv.scrollHeight;
          scrollableDiv.scrollBy(0, distance);
          totalHeight += distance;

          // Stop after scrolling enough or reached bottom
          if (totalHeight >= scrollHeight || totalHeight >= 10000) {
            clearInterval(timer);
            resolve();
          }
        }, 500);
      });
    }
  });
}

// Main scraping function
async function scrapeGoogleMaps(keyword, location) {
  let browser;
  
  try {
    console.log(`🔍 Starting scrape: "${keyword}" in "${location}"`);
    
    // Launch browser with Render-compatible settings
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Random User-Agent rotation
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    // Set viewport
    await page.setViewport({ 
      width: 1920 + Math.floor(Math.random() * 100), 
      height: 1080 + Math.floor(Math.random() * 100) 
    });

    // Navigate to Google Maps
    const searchQuery = `${keyword} in ${location}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    
    console.log(`📍 Navigating to: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Wait for results to load
    await randomDelay(3000, 5000);
    
    // Check if results exist
    const hasResults = await page.evaluate(() => {
      return document.querySelector('div[role="feed"]') !== null;
    });

    if (!hasResults) {
      throw new Error('No results found for this search');
    }

    // Scroll to load more results (aim for 100+ results)
    console.log('📜 Scrolling to load more results...');
    for (let i = 0; i < 5; i++) {
      await autoScroll(page);
      await randomDelay(2000, 3000);
      console.log(`   Scroll ${i + 1}/5 completed`);
    }

    // Extract business data
    console.log('📊 Extracting business data...');
    const businesses = await page.evaluate(() => {
      const results = [];
      const feed = document.querySelector('div[role="feed"]');
      
      if (!feed) return results;
      
      const businessCards = feed.querySelectorAll('div[role="article"]');
      
      businessCards.forEach((card, index) => {
        try {
          // Business name
          const nameElement = card.querySelector('h3, .fontHeadlineSmall, a[aria-label]');
          const name = nameElement?.textContent?.trim() || 
                      nameElement?.getAttribute('aria-label') || 
                      `Business ${index + 1}`;
          
          // Address
          const addressElements = card.querySelectorAll('span, div');
          let address = '';
          addressElements.forEach(el => {
            const text = el.textContent?.trim() || '';
            if (text.includes('·') || text.length > 20) {
              address = text.split('·')[0]?.trim() || text;
            }
          });
          
          // Phone number
          let phone = '';
          const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}/;
          const allText = card.textContent || '';
          const phoneMatch = allText.match(phoneRegex);
          if (phoneMatch) {
            phone = phoneMatch[0];
          }
          
          // Rating
          let rating = null;
          const ratingElement = card.querySelector('span[role="img"][aria-label*="star"]');
          if (ratingElement) {
            const ariaLabel = ratingElement.getAttribute('aria-label');
            const ratingMatch = ariaLabel?.match(/(\d+\.?\d*)/);
            if (ratingMatch) {
              rating = parseFloat(ratingMatch[1]);
            }
          }
          
          // Review count
          let reviewCount = 0;
          const reviewRegex = /\((\d+(?:,\d+)*)\)/;
          const reviewMatch = allText.match(reviewRegex);
          if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
          }
          
          // Website - Extract from link if available
          let website = null;
          const links = card.querySelectorAll('a[href]');
          links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.includes('google.com') && href.startsWith('http')) {
              website = href;
            }
          });
          
          // Only add if we have at least name and address
          if (name && (address || phone)) {
            results.push({
              displayName: { text: name },
              formattedAddress: address || 'Address not available',
              nationalPhoneNumber: phone || null,
              rating: rating,
              userRatingCount: reviewCount,
              websiteUri: website,
              businessStatus: 'OPERATIONAL',
              id: `business_${Date.now()}_${index}`
            });
          }
        } catch (error) {
          console.error('Error parsing business card:', error);
        }
      });
      
      return results;
    });

    console.log(`✅ Scraped ${businesses.length} businesses`);
    
    await browser.close();
    return businesses;

  } catch (error) {
    console.error('❌ Scraping error:', error.message);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// Save to Firestore
async function saveToFirestore(keyword, location, results, userId = null) {
  try {
    const db = admin.firestore();
    const cacheKey = `${keyword.toLowerCase()}_${location.toLowerCase()}`;
    
    const docRef = db.collection('scraped_leads').doc(cacheKey);
    
    await docRef.set({
      keyword,
      location,
      results,
      resultCount: results.length,
      scrapedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userId: userId || 'anonymous',
      source: 'render-sidecar'
    });
    
    console.log(`💾 Saved ${results.length} results to Firestore`);
    return true;
  } catch (error) {
    console.error('❌ Firestore save error:', error.message);
    return false;
  }
}

// Check cache before scraping
async function checkCache(keyword, location) {
  try {
    const db = admin.firestore();
    const cacheKey = `${keyword.toLowerCase()}_${location.toLowerCase()}`;
    
    const docRef = db.collection('scraped_leads').doc(cacheKey);
    const doc = await docRef.get();
    
    if (doc.exists) {
      const data = doc.data();
      const expiresAt = data.expiresAt?.toDate() || new Date(0);
      
      if (expiresAt > new Date()) {
        console.log('✨ Cache hit! Returning cached results');
        return {
          cached: true,
          results: data.results,
          scrapedAt: data.scrapedAt
        };
      }
    }
    
    return { cached: false };
  } catch (error) {
    console.error('❌ Cache check error:', error.message);
    return { cached: false };
  }
}

// POST /scrape - Main endpoint
app.post('/scrape', validateSecretKey, async (req, res) => {
  try {
    const { keyword, location, userId, forceRefresh } = req.body;
    
    // Validation
    if (!keyword || !location) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Both keyword and location are required'
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Scrape request received:`);
    console.log(`   Keyword: ${keyword}`);
    console.log(`   Location: ${location}`);
    console.log(`   User ID: ${userId || 'anonymous'}`);
    console.log('='.repeat(60) + '\n');
    
    // Check cache unless force refresh
    if (!forceRefresh) {
      const cacheResult = await checkCache(keyword, location);
      if (cacheResult.cached) {
        return res.json({
          success: true,
          cached: true,
          results: cacheResult.results,
          count: cacheResult.results.length,
          scrapedAt: cacheResult.scrapedAt,
          message: 'Results from cache'
        });
      }
    }
    
    // Perform scraping
    const startTime = Date.now();
    const results = await scrapeGoogleMaps(keyword, location);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Save to Firestore
    await saveToFirestore(keyword, location, results, userId);
    
    // Log to analytics if user provided
    if (userId && firebaseInitialized) {
      try {
        const db = admin.firestore();
        await db.collection('searchLogs').add({
          userId,
          keyword,
          location,
          resultCount: results.length,
          success: true,
          source: 'render-sidecar',
          duration: parseFloat(duration),
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.error('❌ Analytics logging error:', error.message);
      }
    }
    
    console.log(`\n✅ Scrape completed in ${duration}s`);
    console.log('='.repeat(60) + '\n');
    
    res.json({
      success: true,
      cached: false,
      results,
      count: results.length,
      duration: `${duration}s`,
      message: 'Fresh scrape completed'
    });
    
  } catch (error) {
    console.error('\n❌ Scrape endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Scraping failed',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    firebase: firebaseInitialized ? 'connected' : 'disconnected',
    service: 'render-sidecar-scraper'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Lead Finder Sidecar Scraper',
    version: '1.0.0',
    endpoints: {
      scrape: 'POST /scrape',
      health: 'GET /health'
    },
    status: 'operational'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Sidecar Scraper Service Started');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔒 Secret key protection: ${process.env.SECRET_KEY ? 'ENABLED' : 'DISABLED (set SECRET_KEY)'}`);
  console.log(`🔥 Firebase: ${firebaseInitialized ? 'Connected' : 'Not initialized (check FIREBASE_SERVICE_ACCOUNT)'}`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
