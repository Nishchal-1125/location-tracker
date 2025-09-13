const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const UAParser = require('ua-parser-js');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/locationtracker',
    touchAfter: 24 * 3600, // lazy session update
    ttl: 24 * 60 * 60 // 24 hours session expiry
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  },
  name: 'sessionId' // Don't use default session name
}));

app.use(express.static(path.join(__dirname, 'client/build')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/locationtracker';
console.log('Connecting to MongoDB at:', MONGODB_URI);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  family: 4, // force IPv4
}).catch(err => {
  console.log('MongoDB connection failed. Running without database. Error:', err.message);
});

const db = mongoose.connection;
db.on('error', (err) => {
  console.log('MongoDB connection error:', err.message);
  console.log('App will continue to run without database functionality');
});
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// User Data Schema
const userDataSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    country: String,
    state: String,
    city: String,
    address: String,
    postalCode: String,
    displayName: String
  },
  device: {
    userAgent: String,
    browser: String,
    browserVersion: String,
    os: String,
    osVersion: String,
    device: String,
    deviceModel: String,
    deviceVendor: String,
    screenResolution: String,
    language: String,
    timezone: String,
    platform: String
  },
  network: {
    ip: String,
    connectionType: String
  },
  sessionId: String
});

const UserData = mongoose.model('UserData', userDataSchema);

// Admin Credentials (Change these for production!)
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    return res.status(401).json({ message: 'Authentication required' });
  }
}

// Helper function to get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
}

// Reverse geocoding function
async function reverseGeocode(lat, lon) {
  if (!lat || !lon || !fetch) return null;
  
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LocationTracker/1.0'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const addr = data.address || {};
    
    return {
      country: addr.country || null,
      state: addr.state || addr.province || null,
      city: addr.city || addr.town || addr.village || null,
      address: data.display_name || null,
      postalCode: addr.postcode || null,
      displayName: data.display_name || null
    };
  } catch (error) {
    console.warn('Reverse geocoding failed:', error.message);
    return null;
  }
}

// Authentication Routes
// Login route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    req.session.authenticated = true;
    req.session.user = username;
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logout successful' });
  });
});

// Check authentication status
app.get('/api/auth-status', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// API Routes
app.post('/api/track', async (req, res) => {
  try {
    const { location, device, sessionId } = req.body;
    const userAgent = req.headers['user-agent'];
    const ip = getClientIP(req);
    
    // Parse user agent
    const parser = new UAParser(userAgent);
    const uaResult = parser.getResult();
    
    // Get location details through reverse geocoding
    let locationData = location || {};
    if (location?.latitude && location?.longitude) {
      const geoData = await reverseGeocode(location.latitude, location.longitude);
      if (geoData) {
        locationData = {
          ...locationData,
          country: geoData.country,
          state: geoData.state,
          city: geoData.city,
          address: geoData.address,
          postalCode: geoData.postalCode,
          displayName: geoData.displayName
        };
      }
    }
    
    // Check for duplicate entries from same location (within 100m radius) and same IP in last 24 hours
    if (mongoose.connection.readyState === 1 && location?.latitude && location?.longitude) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingEntry = await UserData.findOne({
        'network.ip': ip,
        timestamp: { $gte: yesterday },
        'location.latitude': { $gte: location.latitude - 0.001, $lte: location.latitude + 0.001 },
        'location.longitude': { $gte: location.longitude - 0.001, $lte: location.longitude + 0.001 }
      });
      
      if (existingEntry) {
        // Update the timestamp of existing entry instead of creating new one
        existingEntry.timestamp = new Date();
        await existingEntry.save();
        return res.status(200).json({ 
          success: true, 
          message: 'Visit updated',
          duplicate: true
        });
      }
    }
    
    const userData = {
      location: locationData,
      device: {
        userAgent,
        browser: uaResult.browser.name || 'Unknown',
        browserVersion: uaResult.browser.version || 'Unknown',
        os: uaResult.os.name || 'Unknown',
        osVersion: uaResult.os.version || 'Unknown',
        device: uaResult.device.type || 'desktop',
        deviceModel: uaResult.device.model || 'Unknown',
        deviceVendor: uaResult.device.vendor || 'Unknown',
        screenResolution: device?.screenResolution || 'Unknown',
        language: device?.language || 'Unknown',
        timezone: device?.timezone || 'Unknown',
        platform: device?.platform || 'Unknown'
      },
      network: {
        ip,
        connectionType: device?.connectionType || 'Unknown'
      },
      sessionId: sessionId || 'anonymous',
      timestamp: new Date()
    };

    // Try to save to database if connected
    if (mongoose.connection.readyState === 1) {
      const userDataDoc = new UserData(userData);
      await userDataDoc.save();
      console.log('New visitor data saved:', userData);
      res.status(200).json({ 
        success: true, 
        message: 'Data saved successfully',
        id: userDataDoc._id 
      });
    } else {
      // Log to console if database is not available
      console.log('Database not available. Data collected:', JSON.stringify(userData, null, 2));
      res.status(200).json({ 
        success: true, 
        message: 'Data processed successfully',
        note: 'Database not connected - data logged to console'
      });
    }
  } catch (error) {
    console.error('Error processing user data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing data' 
    });
  }
});

// Get all tracked data with pagination and search
app.get('/api/data', requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ data: [], total: 0, page: 1, totalPages: 0 });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { 'location.country': { $regex: search, $options: 'i' } },
          { 'location.city': { $regex: search, $options: 'i' } },
          { 'location.state': { $regex: search, $options: 'i' } },
          { 'device.browser': { $regex: search, $options: 'i' } },
          { 'device.os': { $regex: search, $options: 'i' } },
          { 'network.ip': { $regex: search, $options: 'i' } },
          { 'sessionId': { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Get total count for pagination
    const total = await UserData.countDocuments(searchQuery);
    const totalPages = Math.ceil(total / limit);

    // Get paginated data
    const data = await UserData.find(searchQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      data,
      total,
      page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Error fetching data' });
  }
});

// Simple API for basic data (backward compatibility)
app.get('/api/simple-data', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const data = await UserData.find().sort({ timestamp: -1 }).limit(50);
      res.json(data);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Error fetching data' });
  }
});

// Serve admin page (protected)
app.get('/admin', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'admin.html'));
  } else {
    res.redirect('/login');
  }
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
