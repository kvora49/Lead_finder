# Gmail App Password Setup - Step-by-Step Guide

## Part 1: Enable 2-Factor Authentication (2FA)

### Step 1: Go to Google Security Settings
1. Open your browser
2. Go to: **https://myaccount.google.com/security**
3. Sign in with your Gmail account if prompted

### Step 2: Find 2-Step Verification
1. Scroll down to the section **"How you sign in to Google"**
2. Look for **"2-Step Verification"** (it might say "OFF" or "Not set up")
3. Click on **"2-Step Verification"**

### Step 3: Start Setup
1. Click the **"Get Started"** or **"Turn On"** button
2. Google will ask you to sign in again for security - enter your password

### Step 4: Add Your Phone Number
1. Enter your phone number (include country code)
2. Choose how you want to get codes:
   - **Text message (SMS)** - recommended
   - **Phone call**
3. Click **"Next"**

### Step 5: Verify Your Phone
1. Google will send you a 6-digit code via SMS or call
2. Enter the code in the box
3. Click **"Next"**

### Step 6: Confirm Activation
1. Click **"Turn On"** to activate 2-Step Verification
2. You'll see a confirmation message: "2-Step Verification is on"
3. ✅ 2FA is now enabled!

---

## Part 2: Generate App Password

### Step 1: Go to App Passwords Page
1. Go to: **https://myaccount.google.com/apppasswords**
2. **Or** navigate manually:
   - Go to https://myaccount.google.com/
   - Click **"Security"** in left sidebar
   - Scroll to "How you sign in to Google"
   - Click **"2-Step Verification"**
   - Scroll down to bottom
   - Click **"App passwords"**

### Step 2: Sign In Again
1. Google will ask you to enter your password again
2. Enter your Gmail password
3. Click **"Next"**

### Step 3: Select App and Device
1. You'll see **"Select app"** dropdown:
   - Click the dropdown
   - Select **"Mail"**

2. You'll see **"Select device"** dropdown:
   - Click the dropdown
   - Select **"Other (Custom name)"**

3. Enter a name for this app password:
   - Type: **"Lead Finder"** or **"Lead Finder SMTP"**
   - Click **"Generate"**

### Step 4: Copy Your App Password
1. Google will show a **16-character password** in a yellow box
2. It looks like: `abcd efgh ijkl mnop` (4 groups of 4 characters)
3. **Copy this password** - you can only see it once!
4. Click **"Done"**

### Step 5: Add to Your .env File
1. Open your project folder
2. Open the **`.env`** file
3. Find these lines:
   ```env
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password-here
   ```

4. Replace with your actual details:
   ```env
   SMTP_USER=youractualemail@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop
   ```
   
   **Note:** You can include or remove spaces - both work:
   - With spaces: `abcd efgh ijkl mnop` ✅
   - Without spaces: `abcdefghijklmnop` ✅

5. Save the file (Ctrl+S or Cmd+S)

---

## Part 3: Test Your Setup

### Step 1: Start the Backend Server
1. Open a terminal in your project folder
2. Run:
   ```bash
   npm run server
   ```

3. You should see:
   ```
   ✅ SMTP Server ready to send emails
   🚀 Email verification server running on http://localhost:3001
   ```

### Step 2: Start the Frontend
1. Open **another terminal** (keep the first one running)
2. Run:
   ```bash
   npm run dev
   ```

### Step 3: Test Registration
1. Open browser: http://localhost:3000
2. Click **"Create Account"** or go to Register page
3. Fill in the form:
   - Name: Test User
   - Email: **your-test-email@gmail.com**
   - Password: TestPassword123
4. Click **"Create Account"**

5. Check your email inbox - you should receive:
   - **From:** Lead Finder
   - **Subject:** Verify Your Email - Lead Finder
   - **Body:** 6-digit verification code

6. Enter the code on the verification screen
7. Click **"Verify Email"**
8. ✅ Account created successfully!

---

## Troubleshooting

### ❌ Can't find "2-Step Verification" option
- **Solution:** Your organization might have disabled it. Use a personal Gmail account instead.

### ❌ Can't find "App passwords" option
- **Cause:** 2FA is not enabled
- **Solution:** Complete Part 1 first to enable 2FA

### ❌ "App passwords" page says "not available"
- **Possible reasons:**
  1. 2FA is not turned on → Enable it first
  2. Using Google Workspace account → Ask admin to enable it
  3. Using account under 18 years old → Not supported

### ❌ Backend shows "SMTP connection error"
- **Check these:**
  1. SMTP_USER is correct (your full Gmail address)
  2. SMTP_PASS is correct (the 16-character App Password)
  3. No extra spaces or quotes in .env file
  4. You're using App Password, not regular Gmail password

### ❌ Email not received
1. **Check spam folder** - first-time emails often go there
2. **Wait 1-2 minutes** - sometimes delayed
3. **Check backend terminal** - should show "✅ Verification code sent to ..."
4. **Try with another email** - some providers block automated emails

### ❌ "Authentication failed" error
- **Solution:** Regenerate App Password:
  1. Go to https://myaccount.google.com/apppasswords
  2. Find "Lead Finder" in the list
  3. Click the ❌ (delete icon)
  4. Create a new App Password
  5. Update .env file with new password
  6. Restart backend server

---

## Security Tips

### ✅ DO:
- Keep your App Password secret (like a regular password)
- Use different App Passwords for different applications
- Delete unused App Passwords periodically
- Store .env file securely (never commit to GitHub)

### ❌ DON'T:
- Share your App Password with anyone
- Use your regular Gmail password in code
- Commit .env file to version control
- Use the same App Password across multiple projects

---

## Alternative Email Providers (If Gmail doesn't work)

### SendGrid (Recommended for Production)
1. Sign up: https://sendgrid.com/
2. Free tier: 100 emails/day
3. Get API key
4. Update .env:
   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=your-sendgrid-api-key
   ```

### Outlook/Hotmail
1. No App Password needed for personal accounts
2. Update .env:
   ```env
   SMTP_HOST=smtp-mail.outlook.com
   SMTP_PORT=587
   SMTP_USER=your-email@outlook.com
   SMTP_PASS=your-regular-password
   ```

---

## Quick Reference

### Gmail SMTP Settings:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youremail@gmail.com
SMTP_PASS=your-16-char-app-password
```

### Required Steps:
1. ✅ Enable 2FA on Google Account
2. ✅ Generate App Password
3. ✅ Add credentials to .env file
4. ✅ Run backend server
5. ✅ Test registration

### Important Links:
- Enable 2FA: https://myaccount.google.com/security
- App Passwords: https://myaccount.google.com/apppasswords
- Google Account: https://myaccount.google.com/

---

Need more help? Check the backend terminal logs for detailed error messages!
