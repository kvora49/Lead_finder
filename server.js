import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

dotenv.config();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
try {
  const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.warn('⚠️ Firebase Admin not initialized - verification codes will use in-memory fallback');
  console.warn('To enable persistent storage, add serviceAccountKey.json file');
}

const db = admin.firestore ? admin.firestore() : null;

// Fallback in-memory store if Firestore is not available
const verificationCodes = new Map();

// Create transporter using SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // Your email
    pass: process.env.SMTP_PASS, // Your app password (for Gmail, use App Password)
  },
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('✅ SMTP Server ready to send emails');
  }
});

// Generate 6-digit verification code
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send verification email
app.post('/api/send-verification', async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Generate verification code
    const code = generateCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Store code in Firestore (persistent) or memory (fallback)
    if (db) {
      await db.collection('verificationCodes').doc(email).set({
        code,
        expiresAt,
        createdAt: Date.now(),
        email
      });
      console.log(`✅ Verification code stored in Firestore for ${email}`);
    } else {
      verificationCodes.set(email, { code, expiresAt });
      console.log(`⚠️ Verification code stored in memory for ${email} (will be lost on restart)`);
    }

    // Send email
    await transporter.sendMail({
      from: `"Lead Finder" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify Your Email - Lead Finder',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px; color: #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔍 Lead Finder</h1>
              <p>Email Verification</p>
            </div>
            <div class="content">
              <h2>Hi ${name || 'there'}! 👋</h2>
              <p>Thank you for signing up for Lead Finder. To complete your registration, please verify your email address using the code below:</p>
              
              <div class="code">${code}</div>
              
              <p><strong>This code will expire in 15 minutes.</strong></p>
              
              <p>If you didn't create an account with Lead Finder, you can safely ignore this email.</p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <p style="color: #666; font-size: 14px;">Need help? Contact us at support@leadfinder.com</p>
            </div>
            <div class="footer">
              <p>© 2025 Lead Finder. All rights reserved.</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`✅ Verification code sent to ${email}`);
    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Verify code
app.post('/api/verify-code', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required' });
  }

  try {
    let stored;
    
    // Try Firestore first, fallback to memory
    if (db) {
      const docRef = db.collection('verificationCodes').doc(email);
      const doc = await docRef.get();
      
      if (doc.exists) {
        stored = doc.data();
      }
    } else {
      stored = verificationCodes.get(email);
    }

    if (!stored) {
      return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
    }

    if (Date.now() > stored.expiresAt) {
      // Clean up expired code
      if (db) {
        await db.collection('verificationCodes').doc(email).delete();
      } else {
        verificationCodes.delete(email);
      }
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Code is valid - remove it
    if (db) {
      await db.collection('verificationCodes').doc(email).delete();
    } else {
      verificationCodes.delete(email);
    }
    console.log(`✅ Email verified: ${email}`);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Email verification server running on http://localhost:${PORT}`);
});
