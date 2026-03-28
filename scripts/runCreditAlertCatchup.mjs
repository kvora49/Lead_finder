import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import fs from 'fs';

const getSecret = async (key) => {
  const { execSync } = await import('child_process');
  return execSync(`firebase functions:secrets:access ${key}`, { encoding: 'utf8' }).trim();
};

const parseEmails = (raw) => {
  const normalized = String(raw || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)].filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
};

const parseLimit = (raw) => {
  if (raw === 'unlimited') return { isUnlimited: true, limitUsd: Infinity };
  const n = Number.parseFloat(raw);
  return { isUnlimited: false, limitUsd: Number.isFinite(n) ? Math.max(0, n) : 0 };
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim().toLowerCase());

const formatFrom = (smtpFrom, smtpUser) => {
  const fallbackEmail = String(smtpUser || '').trim().replace(/[<>\s]/g, '');
  const rawFrom = String(smtpFrom || '').trim();

  if (!rawFrom) {
    return `"Lead Finder" <${fallbackEmail}>`;
  }

  const emailMatch = rawFrom.match(/<([^>]+)>/);
  const parsedEmail = String(emailMatch?.[1] || rawFrom).trim().replace(/[<>\s]/g, '');

  let displayName = 'Lead Finder';
  if (emailMatch) {
    displayName = rawFrom.slice(0, emailMatch.index).trim();
  } else if (!rawFrom.includes('@')) {
    displayName = rawFrom;
  }

  displayName = displayName
    .replace(/^"+|"+$/g, '')
    .replace(/[<>]/g, '')
    .replace(/>+$/g, '')
    .trim();

  if (!displayName) displayName = 'Lead Finder';

  return `"${displayName}" <${parsedEmail || fallbackEmail}>`;
};

const formatAlertTimestamp = (date = new Date()) => {
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date).replace(/\//g, '-');

  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  return `${datePart} & Time-${timePart}`;
};

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

async function main() {
  const svc = JSON.parse(fs.readFileSync('./lead-finder-6b009-firebase-adminsdk-fbsvc-e44143234f.json', 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }
  const db = admin.firestore();

  const smtpHost = await getSecret('SMTP_HOST');
  const smtpPort = await getSecret('SMTP_PORT');
  const smtpSecure = await getSecret('SMTP_SECURE');
  const smtpUser = await getSecret('SMTP_USER');
  const smtpPass = await getSecret('SMTP_PASS');
  let smtpFrom = '';
  try {
    smtpFrom = await getSecret('SMTP_FROM');
  } catch {
    smtpFrom = '';
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost.trim(),
    port: parseInt(smtpPort || '587', 10),
    secure: String(smtpSecure || 'false').trim() === 'true',
    auth: {
      user: smtpUser.trim(),
      pass: smtpPass.trim(),
    },
  });

  const settingsSnap = await db.doc('systemConfig/globalSettings').get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const enabled = (settings.emailNotificationsEnabled ?? true) && (settings.sendCreditAlerts ?? true);
  if (!enabled) {
    console.log('Catch-up skipped: email alerts are disabled in settings');
    return;
  }

  const parsedThreshold = Number.parseInt(settings.creditAlertThreshold, 10);
  const thresholdPct = Number.isFinite(parsedThreshold)
    ? Math.min(Math.max(parsedThreshold, 1), 100)
    : 80;
  const admins = parseEmails(settings.adminNotificationEmail || '');

  const mk = monthKey();
  const usersSnap = await db.collection('users').get();

  let scanned = 0;
  let eligible = 0;
  let sent = 0;
  let skippedTracked = 0;
  let skippedNoRecipient = 0;
  let errors = 0;

  for (const userDoc of usersSnap.docs) {
    scanned++;
    const d = userDoc.data() || {};
    const userEmail = String(d.email || '').trim().toLowerCase();
    if (!isValidEmail(userEmail)) continue;

    const { isUnlimited, limitUsd } = parseLimit(d.creditLimit);
    if (isUnlimited || !Number.isFinite(limitUsd) || limitUsd <= 0) continue;
    if (d.creditMonth !== mk) continue;

    const cost = Math.max(0, Number.parseFloat(d.userMonthlyApiCost ?? 0) || 0);
    const pct = (cost / Math.max(limitUsd, 0.0001)) * 100;
    if (pct < thresholdPct) continue;

    eligible++;

    const trackingId = `${userDoc.id}_${mk}_${thresholdPct}`;
    const trackingRef = db.collection('credit_alert_tracking').doc(trackingId);
    const trackingSnap = await trackingRef.get();
    if (trackingSnap.exists) {
      skippedTracked++;
      continue;
    }

    const recipients = [...new Set([...admins, userEmail])].filter(isValidEmail);
    if (recipients.length === 0) {
      skippedNoRecipient++;
      continue;
    }

    const remainingUsd = Math.max(0, +(limitUsd - cost).toFixed(2));
    const usagePct = +Math.min(pct, 100).toFixed(1);
    const sentAt = formatAlertTimestamp();

    try {
      await transporter.sendMail({
        from: formatFrom(smtpFrom, smtpUser),
        to: recipients.join(', '),
        subject: `Credit Alert: ${userEmail}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#0f172a;">
            <h2 style="margin-bottom:8px;">Credit Usage Alert (Catch-up)</h2>
            <p><strong>User:</strong> ${userEmail}</p>
            <p><strong>Usage (%):</strong> ${usagePct}</p>
            <p><strong>Remaining (USD):</strong> ${remainingUsd.toFixed(2)}</p>
            <p><strong>Monthly Used (USD):</strong> ${cost.toFixed(2)}</p>
            <p><strong>Monthly Limit (USD):</strong> ${limitUsd.toFixed(2)}</p>
            <p><strong>Reason:</strong> Low credits</p>
            <p><strong>Timestamp:</strong> ${sentAt}</p>
          </div>
        `,
      });

      await trackingRef.set({
        userId: userDoc.id,
        userEmail,
        monthKey: mk,
        thresholdPct,
        usagePct,
        recipients,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'catchup-manual',
      });

      sent++;
      console.log(`Sent catch-up alert: ${userEmail} (${usagePct}%)`);
    } catch (err) {
      errors++;
      console.error(`Failed catch-up alert: ${userEmail}`, err?.message || err);
    }
  }

  console.log(JSON.stringify({ monthKey: mk, thresholdPct, scanned, eligible, sent, skippedTracked, skippedNoRecipient, errors }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
