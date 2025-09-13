const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

let isConnected = false;
const JWT_SECRET = process.env.SESSION_SECRET || 'your-super-secret-key';

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

// Authentication middleware
function authenticate(req) {
  const cookies = req.headers.cookie;
  let token = null;
  
  if (cookies) {
    const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth-token='));
    if (authCookie) {
      token = authCookie.split('=')[1];
    }
  }
  
  if (!token) return false;
  
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Check authentication
  if (!authenticate(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    await connectDB();
    
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
          { 'location.state': { $regex: search, $options: 'i' } },
          { 'location.city': { $regex: search, $options: 'i' } },
          { 'device.browser': { $regex: search, $options: 'i' } },
          { 'device.os': { $regex: search, $options: 'i' } },
          { 'network.ip': { $regex: search, $options: 'i' } },
          { 'sessionId': { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const total = await UserData.countDocuments(searchQuery);
    const data = await UserData.find(searchQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      data,
      page,
      totalPages,
      total,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });
    
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Error fetching data' });
  }
};
