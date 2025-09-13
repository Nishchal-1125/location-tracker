const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SESSION_SECRET || 'your-super-secret-key';

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

  try {
    // Get token from cookie
    const cookies = req.headers.cookie;
    let token = null;
    
    if (cookies) {
      const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth-token='));
      if (authCookie) {
        token = authCookie.split('=')[1];
      }
    }
    
    if (!token) {
      return res.json({ authenticated: false });
    }
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, user: decoded.user });
    
  } catch (error) {
    console.error('Auth status error:', error);
    res.json({ authenticated: false });
  }
};
