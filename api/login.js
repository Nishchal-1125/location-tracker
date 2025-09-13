// Note: Vercel serverless functions are stateless, so we'll use JWT tokens instead of sessions
const jwt = require('jsonwebtoken');

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

const JWT_SECRET = process.env.SESSION_SECRET || 'your-super-secret-key';

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
    const { username, password } = req.body;
    
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      // Create JWT token
      const token = jwt.sign(
        { user: username, authenticated: true },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      // Set HTTP-only cookie
      res.setHeader('Set-Cookie', `auth-token=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`);
      
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
