# Email Verification Setup Guide

## SMTP Configuration for Gmail

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account: https://myaccount.google.com/
2. Click **Security** in the left sidebar
3. Under "How you sign in to Google", enable **2-Step Verification**

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Enter "Lead Finder" as the name
5. Click **Generate**
6. Copy the 16-character password (looks like: `xxxx xxxx xxxx xxxx`)

### Step 3: Update .env File
1. Open `.env` file in your project root
2. Update these values:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-actual-email@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx
   ```

## For Other Email Providers

### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

### Yahoo
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
```

### SendGrid (Production Recommended)
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

## Running the Application

### Development Mode
```bash
# Terminal 1 - Start backend server
npm run server

# Terminal 2 - Start frontend
npm run dev
```

### Or run both together
```bash
npm run dev:all
```

## How It Works

1. **User Registration**:
   - User fills registration form
   - System sends 6-digit code to email via SMTP
   - User enters code to verify

2. **Email Verification**:
   - Code is valid for 15 minutes
   - User can resend code if needed
   - After verification, Firebase account is created

3. **Security**:
   - Codes stored in memory (use Redis/database in production)
   - Each code expires after 15 minutes
   - Codes deleted after successful verification

## Production Deployment

For production, consider:
1. **Use SendGrid or AWS SES** (better deliverability, no limits)
2. **Store codes in Redis** (for multi-server deployments)
3. **Add rate limiting** (prevent spam)
4. **Deploy backend separately** (e.g., Heroku, Railway, Render)

## Troubleshooting

### "Connection refused" error
- Make sure backend server is running on port 3001
- Check if another process is using port 3001

### "Authentication failed" error
- Verify SMTP credentials in `.env`
- For Gmail, use App Password (not regular password)
- Check if 2FA is enabled (required for App Passwords)

### Email not received
- Check spam folder
- Verify SMTP_USER email is correct
- Test SMTP connection: `npm run server` should show "✅ SMTP Server ready"

### "Invalid verification code"
- Code expires after 15 minutes
- Click "Resend Code" to get a new one
- Codes are case-sensitive (6 digits only)
