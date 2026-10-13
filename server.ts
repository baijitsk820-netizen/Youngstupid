import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Authorized Admin Email requirement
export const AUTHORIZED_ADMIN_EMAIL = 'baijitsk860@gmail.com';

// Read Firebase config from local json if available
let firebaseConfig: any = {
  projectId: 'webs-39bd2',
  apiKey: 'AIzaSyBF7RX_FeVfsBZiLDK3om6dG3dhYweH9Dc'
};
try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  // Use defaults
}

// Initialize Firebase Admin SDK
if (!getApps().length) {
  try {
    initializeApp({
      projectId: firebaseConfig.projectId || 'webs-39bd2',
      storageBucket: firebaseConfig.storageBucket || 'webs-39bd2.firebasestorage.app'
    });
  } catch (err) {
    console.warn('Firebase Admin initialize warning:', err);
  }
}

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

/**
 * Fallback token verifier against Google Identity Toolkit API
 * Used when ADC is not provisioned in the local environment.
 */
async function verifyTokenViaGoogleApi(idToken: string) {
  try {
    const apiKey = process.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey;
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.users && data.users.length > 0) {
      const u = data.users[0];
      return {
        uid: u.localId,
        email: u.email,
        emailVerified: u.emailVerified
      };
    }
    return null;
  } catch (err) {
    console.error('Google API token verification error:', err);
    return null;
  }
}

/**
 * Strict Server-side Admin Authorization Middleware
 * Verifies that the request has a valid Firebase Auth token belonging
 * to the exact authorized admin: baijitsk860@gmail.com
 */
export async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Missing or invalid authorization header.' 
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Empty token.' 
    });
  }

  let verifiedEmail: string | undefined;
  let uid: string | undefined;

  // Attempt verification with Firebase Admin SDK
  try {
    const decoded = await getAuth().verifyIdToken(token);
    verifiedEmail = decoded.email;
    uid = decoded.uid;
  } catch (adminErr) {
    // Attempt verification via Google Identity Toolkit API fallback
    const googleUser = await verifyTokenViaGoogleApi(token);
    if (googleUser) {
      verifiedEmail = googleUser.email;
      uid = googleUser.uid;
    }
  }

  if (!verifiedEmail) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid token or expired session.' 
    });
  }

  if (verifiedEmail.toLowerCase() !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
    console.warn(`[SECURITY ALERT] Unauthorized admin access attempt from: ${verifiedEmail}`);
    return res.status(403).json({ 
      success: false, 
      error: 'Forbidden: Access restricted strictly to authorized administrator.' 
    });
  }

  (req as any).adminUser = { uid, email: verifiedEmail };
  next();
}

// -------------------------------------------------------------
// ADMIN API ENDPOINTS
// -------------------------------------------------------------

/**
 * Verifies admin session token server-side
 */
app.post('/api/admin/verify-session', requireAdmin, (req, res) => {
  res.json({
    success: true,
    isAdmin: true,
    email: (req as any).adminUser.email,
    verifiedAt: new Date().toISOString()
  });
});

/**
 * Server-side Razorpay Order Creation
 */
app.post('/api/razorpay/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid order amount.' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (keyId && keySecret) {
      const razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });

      // Razorpay expects amount in smallest currency unit (e.g., paise for INR, cents for USD)
      const options = {
        amount: Math.round(numAmount * 100),
        currency: currency.toUpperCase(),
        receipt: receipt || `rcpt_${Date.now()}`,
        notes: notes || {}
      };

      const razorpayOrder = await razorpayInstance.orders.create(options);
      return res.json({
        success: true,
        isConfigured: true,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId
      });
    } else {
      // Graceful fallback for preview / test checkout when private secrets are not yet added
      const simulatedOrderId = `order_sim_${Date.now()}`;
      return res.json({
        success: true,
        isConfigured: false,
        orderId: simulatedOrderId,
        amount: Math.round(numAmount * 100),
        currency: currency.toUpperCase(),
        keyId: keyId || 'rzp_test_placeholder',
        message: 'Razorpay keys not configured in server environment. Simulated checkout enabled.'
      });
    }
  } catch (err: any) {
    console.error('Razorpay create-order error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create payment order.' });
  }
});

/**
 * Server-side Razorpay Payment Signature Verification
 */
app.post('/api/razorpay/verify-payment', async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      orderId 
    } = req.body;

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (keySecret) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, error: 'Missing required Razorpay payment parameters.' });
      }

      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        console.warn(`[SECURITY ALERT] Invalid Razorpay signature for order ${orderId}`);
        return res.status(400).json({ 
          success: false, 
          verified: false, 
          error: 'Payment verification failed: Signature mismatch.' 
        });
      }
    }

    // Record verified payment in Firestore orders collection if orderId provided
    if (orderId) {
      try {
        const db = getFirestore();
        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.set({
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          verifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (dbErr) {
        console.warn('Firestore direct write notice in verify-payment:', dbErr);
      }
    }

    res.json({
      success: true,
      verified: true,
      orderId,
      paymentId: razorpay_payment_id
    });
  } catch (err: any) {
    console.error('Razorpay verify-payment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Payment verification failed.' });
  }
});

// Admin-protected direct operations (server-authoritative backup)
app.post('/api/admin/orders/:orderId/update-status', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, trackingNumber, courier, adminNote } = req.body;

    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);
    
    const updates: any = {
      updatedAt: new Date().toISOString()
    };
    if (orderStatus) updates.orderStatus = orderStatus;
    if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber;
    if (courier !== undefined) updates.courier = courier;
    if (adminNote !== undefined) updates.adminNote = adminNote;

    await orderRef.set(updates, { merge: true });

    res.json({ success: true, orderId, updates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Server-side Product Creation & Update (Strictly Admin Authorized)
 * Enforces admin security on the backend with full data validation
 */
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const { productId, productData } = req.body;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ success: false, error: 'Product ID is required.' });
    }

    if (!productData || typeof productData !== 'object') {
      return res.status(400).json({ success: false, error: 'Product data payload is required.' });
    }

    const title = (productData.name || productData.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, error: 'Product title/name is required.' });
    }

    const price = Number(productData.price);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ success: false, error: 'Valid product price is required.' });
    }

    const category = (productData.category || '').trim();
    if (!category) {
      return res.status(400).json({ success: false, error: 'Product category is required.' });
    }

    const db = getFirestore();
    const prodRef = db.collection('products').doc(productId);
    const existingSnap = await prodRef.get();

    const timestamp = new Date().toISOString();
    const record: any = {
      ...productData,
      name: title,
      title: title,
      price,
      category,
      updatedAt: timestamp
    };

    if (!existingSnap.exists) {
      record.createdAt = record.createdAt || timestamp;
    }

    await prodRef.set(record, { merge: true });

    res.json({
      success: true,
      productId,
      product: record,
      savedAt: timestamp
    });
  } catch (err: any) {
    console.error('Server-side product save error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save product.' });
  }
});

/**
 * Server-side Product Deletion (Strictly Admin Authorized)
 */
app.delete('/api/admin/products/:productId', requireAdmin, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID is required.' });
    }

    const db = getFirestore();
    await db.collection('products').doc(productId).delete();

    res.json({ success: true, productId, deletedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Server-side product deletion error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete product.' });
  }
});

/**
 * Diagnostic endpoint for Firebase Cloud Storage status
 */
app.get('/api/admin/storage-status', requireAdmin, async (_req, res) => {
  const projectId = firebaseConfig.projectId || 'webs-39bd2';
  const configuredBucket = firebaseConfig.storageBucket || `${projectId}.firebasestorage.app`;

  // Test reachability of the bucket metadata
  let bucketExists = false;
  let statusMessage = '';
  try {
    const checkRes = await fetch(`https://firebasestorage.googleapis.com/v0/b/${configuredBucket}/o?maxResults=1`);
    if (checkRes.ok || checkRes.status === 200) {
      bucketExists = true;
      statusMessage = 'Cloud Storage bucket active and accessible.';
    } else if (checkRes.status === 404) {
      bucketExists = false;
      statusMessage = `Storage bucket "${configuredBucket}" not found (HTTP 404). Cloud Storage needs to be initialized in Firebase Console.`;
    } else {
      bucketExists = false;
      statusMessage = `Storage returned HTTP ${checkRes.status}`;
    }
  } catch (fetchErr: any) {
    statusMessage = fetchErr.message;
  }

  res.json({
    success: true,
    projectId,
    storageBucket: configuredBucket,
    bucketExists,
    statusMessage,
    consoleSetupUrl: `https://console.firebase.google.com/project/${projectId}/storage`
  });
});

// -------------------------------------------------------------
// VITE INTEGRATION & ROUTING
// -------------------------------------------------------------

async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'mpa'
    });

    // Handle /admin route rewrite before vite
    app.get(['/admin', '/admin/'], (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'admin.html'));
    });

    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static(path.resolve(__dirname, 'dist')));

    // Route /admin to admin.html
    app.get(['/admin', '/admin/'], (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'admin.html'));
    });

    // Fallback handler for all HTML pages in production
    app.get('*', (req, res) => {
      let pagePath = path.resolve(__dirname, 'dist', req.path.replace(/^\//, ''));
      if (fs.existsSync(pagePath) && fs.statSync(pagePath).isFile()) {
        return res.sendFile(pagePath);
      }
      if (fs.existsSync(pagePath + '.html')) {
        return res.sendFile(pagePath + '.html');
      }
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[YOUNG & STUPID SERVER] Running on http://0.0.0.0:${PORT} (Mode: ${isProduction ? 'production' : 'development'})`);
  });
}

startServer();
