const mongoose = require('mongoose');
const UAParser = require('ua-parser-js');

let fetch;
let isConnected = false;

// Import fetch dynamically
const getFetch = async () => {
  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }
  return fetch;
};

// MongoDB connection
const connectDB = async () => {
  if (isConnected) return;
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4,
    });
    isConnected = true;
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

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

const UserData = mongoose.models.UserData || mongoose.model('UserData', userDataSchema);

// Helper functions
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         '127.0.0.1';
}

async function reverseGeocode(lat, lon) {
  if (!lat || !lon) return null;
  
  try {
    const fetchFn = await getFetch();
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;
    const response = await fetchFn(url, {
      headers: {
        'User-Agent': 'LocationTracker/1.0'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    return {
      country: data.address?.country,
      state: data.address?.state || data.address?.province,
      city: data.address?.city || data.address?.town || data.address?.village,
      address: data.display_name,
      postalCode: data.address?.postcode,
      displayName: data.display_name
    };
  } catch (error) {
    console.warn('Reverse geocoding failed:', error.message);
    return null;
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await connectDB();
    
    const { location, device, sessionId } = req.body;
    const userAgent = req.headers['user-agent'];
    const ip = getClientIP(req);
    
    // Parse user agent
    const parser = new UAParser(userAgent);
    const uaResult = parser.getResult();
    
    // Check for duplicate within 24 hours
    if (location?.latitude && location?.longitude) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const existingUser = await UserData.findOne({
        'network.ip': ip,
        timestamp: { $gte: oneDayAgo },
        $expr: {
          $and: [
            { $lte: [{ $abs: { $subtract: ['$location.latitude', location.latitude] }}, 0.001] },
            { $lte: [{ $abs: { $subtract: ['$location.longitude', location.longitude] }}, 0.001] }
          ]
        }
      });
      
      if (existingUser) {
        existingUser.timestamp = new Date();
        await existingUser.save();
        return res.json({ message: 'User data updated', duplicate: true });
      }
    }
    
    // Get location details
    let locationDetails = null;
    if (location?.latitude && location?.longitude) {
      locationDetails = await reverseGeocode(location.latitude, location.longitude);
    }
    
    // Create user data
    const userData = new UserData({
      location: {
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy,
        ...locationDetails
      },
      device: {
        userAgent,
        browser: uaResult.browser?.name,
        browserVersion: uaResult.browser?.version,
        os: uaResult.os?.name,
        osVersion: uaResult.os?.version,
        device: uaResult.device?.type || 'desktop',
        deviceModel: uaResult.device?.model,
        deviceVendor: uaResult.device?.vendor,
        screenResolution: device?.screenResolution,
        language: device?.language,
        timezone: device?.timezone,
        platform: device?.platform
      },
      network: {
        ip,
        connectionType: device?.connectionType
      },
      sessionId
    });
    
    await userData.save();
    res.json({ message: 'Data saved successfully' });
    
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ message: 'Error saving data' });
  }
};
