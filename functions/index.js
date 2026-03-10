/**
 * Universal Business Lead Finder - Cloud Functions
 */

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger  = require("firebase-functions/logger");
const admin   = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto  = require("crypto");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// ── Firebase Admin SDK ───────────────────────────────────────────────────────
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── SMTP transport (configured via functions/.env) ───────────────────────────
// Required env vars: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
// Optional:          SMTP_FROM  (defaults to SMTP_USER)
// Set these in functions/.env for local dev, or Firebase Secrets for production.
const createTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT  || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const APP_URL    = "https://lead-finder-6b009.web.app";
const INVITE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

// ════════════════════════════════════════════════════════════════════════════
// sendAdminInvite
// Callable by owner / super_admin.
// Generates a secure random invite token, stores it in admin_invites/{token},
// and sends an invitation email via SMTP.
// ════════════════════════════════════════════════════════════════════════════
exports.sendAdminInvite = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

  // Verify caller role from Firestore (cannot trust client-side claim)
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  if (!callerSnap.exists) throw new HttpsError("not-found", "Caller profile not found.");
  const callerRole = callerSnap.data().role;
  if (!["owner", "super_admin"].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Only owner or super_admin can send invites.");
  }

  const { email, role } = request.data;
  if (!email || !role)  throw new HttpsError("invalid-argument", "email and role are required.");

  // Role constraint: super_admin can only invite 'admin'; owner can invite 'admin' or 'super_admin'
  const allowedRoles = callerRole === "owner" ? ["admin", "super_admin"] : ["admin"];
  if (!allowedRoles.includes(role)) {
    throw new HttpsError("permission-denied", `Not allowed to assign role '${role}'.`);
  }

  // Invalidate any existing unused invite for this email+role
  const existing = await db.collection("admin_invites")
    .where("email", "==", email)
    .where("used", "==", false)
    .get();
  const batch = db.batch();
  existing.forEach(d => batch.update(d.ref, { used: true, supersededAt: admin.firestore.FieldValue.serverTimestamp() }));
  await batch.commit();

  // Create new invite token
  const token      = crypto.randomBytes(32).toString("hex");
  const expiresAt  = new Date(Date.now() + INVITE_TTL);
  const roleLabel  = role === "super_admin" ? "Super Admin" : "Admin";

  await db.collection("admin_invites").doc(token).set({
    email,
    role,
    invitedBy:    request.auth.token.email || request.auth.uid,
    invitedByUid: request.auth.uid,
    invitedAt:    admin.firestore.FieldValue.serverTimestamp(),
    expiresAt:    admin.firestore.Timestamp.fromDate(expiresAt),
    used:         false,
  });

  logger.info(`Admin invite created for ${email} as ${role} by ${request.auth.uid}`);

  // Send email via SMTP
  const inviteUrl = `${APP_URL}/admin?token=${token}`;

  // Only attempt email if SMTP credentials are configured
  const smtpReady = process.env.SMTP_USER && process.env.SMTP_USER !== "your-email@gmail.com"
                 && process.env.SMTP_PASS && process.env.SMTP_PASS !== "your-16-char-app-password";

  if (!smtpReady) {
    logger.warn(`SMTP not configured — invite created but email NOT sent. Share this link manually: ${inviteUrl}`);
    return { success: true, emailSent: false, inviteUrl, expiresAt: expiresAt.toISOString() };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from:    `"Lead Finder" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:      email,
    subject: `You're invited as ${roleLabel} on Lead Finder`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:0;">
        <div style="max-width:520px;margin:40px auto;background:#1e293b;border:1px solid #334155;
          border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">
            <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;
              margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;">🛡️</div>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Admin Invitation</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Lead Finder Platform</p>
          </div>
          <div style="padding:36px 40px;">
            <p style="margin:0 0 16px;color:#94a3b8;font-size:14px;line-height:1.6;">
              You have been invited by <strong style="color:#e2e8f0;">${request.auth.token.email || "an admin"}</strong>
              to join the Lead Finder admin team as <strong style="color:#a78bfa;">${roleLabel}</strong>.
            </p>
            <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
              Click the button below to accept your invitation. This link expires in <strong style="color:#e2e8f0;">24 hours</strong>.
            </p>
            <a href="${inviteUrl}"
               style="display:block;text-align:center;background:linear-gradient(135deg,#4f46e5,#7c3aed);
               color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:600;
               font-size:15px;letter-spacing:0.01em;">
              Accept Invitation
            </a>
            <p style="margin:24px 0 0;color:#475569;font-size:12px;line-height:1.5;">
              If you can't click the button, copy this URL into your browser:<br/>
              <span style="color:#6366f1;word-break:break-all;">${inviteUrl}</span>
            </p>
          </div>
          <div style="padding:16px 40px;border-top:1px solid #1e293b;background:#0f172a;text-align:center;">
            <p style="margin:0;color:#334155;font-size:11px;">Lead Finder · Admin Portal · Unauthorized access is prohibited</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  logger.info(`Invite email sent to ${email}`);
  return { success: true, emailSent: true, expiresAt: expiresAt.toISOString() };
});

// ════════════════════════════════════════════════════════════════════════════
// acceptAdminInvite
// Callable by any authenticated user.
// Validates the token, elevates the caller's role in Firestore, marks invite used.
// ════════════════════════════════════════════════════════════════════════════
exports.acceptAdminInvite = onCall({ timeoutSeconds: 20 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in to accept an invite.");

  const { token } = request.data;
  if (!token) throw new HttpsError("invalid-argument", "Token is required.");

  const inviteRef  = db.collection("admin_invites").doc(token);
  const inviteSnap = await inviteRef.get();

  if (!inviteSnap.exists) {
    throw new HttpsError("not-found", "Invite not found. It may have already been used or never existed.");
  }

  const invite = inviteSnap.data();

  if (invite.used) {
    throw new HttpsError("already-exists", "This invite link has already been used.");
  }
  if (invite.expiresAt.toDate() < new Date()) {
    throw new HttpsError("deadline-exceeded", "This invite has expired. Ask an admin to send a new one.");
  }

  const callerEmail = request.auth.token.email;
  if (invite.email !== callerEmail) {
    throw new HttpsError(
      "permission-denied",
      `This invite was sent to ${invite.email}. You are signed in as ${callerEmail}.`
    );
  }

  // Elevate role
  await db.collection("users").doc(request.auth.uid).update({
    role:                 invite.role,
    admin_request_status: "approved",
    promotedAt:           admin.firestore.FieldValue.serverTimestamp(),
    promotedBy:           invite.invitedBy,
  });

  // Mark invite as used (atomic)
  await inviteRef.update({
    used:             true,
    acceptedAt:       admin.firestore.FieldValue.serverTimestamp(),
    acceptedByUid:    request.auth.uid,
    acceptedByEmail:  callerEmail,
  });

  logger.info(`Invite accepted: ${callerEmail} → role:${invite.role}`);
  return { success: true, role: invite.role };
});

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

