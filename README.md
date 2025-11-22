# Universal Business Lead Finder

A modern React application built with Vite for finding business leads using Google Places API. Search for wholesalers, retailers, manufacturers, and service providers worldwide.

## Features

- 🔍 Search businesses by keyword, category, and location
- 📱 Responsive design for mobile and desktop
- 📞 Filter by phone number availability
- 📊 Export results to CSV
- 🎨 Modern UI with Tailwind CSS
- ⚡ Fast performance with Vite

## Project Structure

```
Information extracter/
├── src/
│   ├── components/
│   │   └── LeadCard.jsx          # Business card component
│   ├── services/
│   │   └── placesApi.js          # Google Places API integration
│   ├── App.jsx                   # Main application component
│   ├── main.jsx                  # React entry point
│   ├── config.js                 # API key configuration
│   └── index.css                 # Global styles
├── index.html                    # HTML template
├── package.json                  # Dependencies
├── vite.config.js               # Vite configuration
├── tailwind.config.js           # Tailwind CSS configuration
└── postcss.config.js            # PostCSS configuration
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Places API (New)**
4. Create an API key
5. Open `src/config.js` and replace `PASTE_YOUR_API_KEY_HERE` with your API key

**Important:** Restrict your API key in Google Cloud Console:
- Set HTTP referrer restrictions
- Limit to Places API only

### 3. Run Development Server

```bash
npm run dev
```

The application will open at `http://localhost:3000`

### 4. Build for Production

```bash
npm run build
```

## Usage

1. **Select Category**: Choose from Custom, Wholesaler, Retailer, Manufacturer, or Service Provider
2. **Enter Keyword**: Type what you're looking for (e.g., "Kurti", "Electronics")
3. **Enter Location**: Specify the location (e.g., "Mumbai", "New York")
4. **Toggle Phone Filter**: Optionally require phone numbers
5. **Click Search**: Results will appear below
6. **Export to CSV**: Download results with the "Download CSV" button

## Technologies Used

- **React 18** - UI library
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Google Places API (New)** - Business data

## API Information

This application uses the Google Places API (New) with the following fields:
- displayName
- formattedAddress
- nationalPhoneNumber
- websiteUri
- businessStatus

## License

MIT

## Support

For issues or questions, please create an issue in the repository.
