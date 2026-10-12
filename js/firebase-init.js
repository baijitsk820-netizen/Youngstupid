import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc,
  onSnapshot,
  query, 
  where,
  orderBy,
  limit,
  getDocFromServer
} from 'firebase/firestore';
import { getStorage, ref, getDownloadURL, uploadBytes } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyBF7RX_FeVfsBZiLDK3om6dG3dhYweH9Dc",
  authDomain: "webs-39bd2.firebaseapp.com",
  projectId: "webs-39bd2",
  storageBucket: "webs-39bd2.firebasestorage.app",
  messagingSenderId: "312273897490",
  appId: "1:312273897490:web:d0bfac34205709e0b070cb",
  measurementId: "G-8KSFRL0ENE"
};

// Initialize Firebase SDK reusing existing initialization if possible
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Error handler conforming to FirestoreErrorInfo spec
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(p => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error Info:', JSON.stringify(errInfo));
  return errInfo;
}

// Test connection on boot per Firebase guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client offline or connecting.");
    }
  }
}
testConnection();

// ==================== AUTHENTICATION ====================

// 1. Google Sign-In
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Save / update user profile in Firestore: users/{uid}
    try {
      const userRef = doc(db, 'users', user.uid);
      const existing = await getDoc(userRef);
      if (!existing.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          name: user.displayName || 'Collector',
          email: user.email,
          phone: user.phoneNumber || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } else {
        await setDoc(userRef, {
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.WRITE, `users/${user.uid}`);
    }
    return user;
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}

// 2. Email / Password Sign In
export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    
    // Ensure user profile document exists in users/{uid}
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          name: user.displayName || email.split('@')[0],
          email: user.email,
          phone: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
    return user;
  } catch (error) {
    console.error('Email Login Error:', error);
    throw error;
  }
}

// 3. Email / Password Sign Up
export async function registerWithEmail(name, email, password, phone = '') {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    // Update Auth displayName
    if (name) {
      try {
        await updateProfile(user, { displayName: name });
      } catch (e) {}
    }

    // Create user profile in Firestore: users/{uid}
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        name: name || 'Collector',
        email: email,
        phone: phone || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
    return user;
  } catch (error) {
    console.error('Email Signup Error:', error);
    throw error;
  }
}

// 4. Password Reset
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return true;
  } catch (error) {
    console.error('Password Reset Error:', error);
    throw error;
  }
}

// 5. Logout
export async function logoutUser() {
  return fbSignOut(auth);
}

// ==================== USER PROFILE IN FIRESTORE ====================

export async function getUserProfile(userId) {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

export async function updateUserProfile(userId, profileData) {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      ...profileData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

// ==================== REAL FIRESTORE PRODUCTS ====================

export function getColorHex(name) {
  if (!name || typeof name !== 'string') return '#0B0B0B';
  const clean = name.trim();
  if (/^#([0-9A-F]{3}){1,2}$/i.test(clean)) return clean;
  
  const map = {
    'black': '#0B0B0B',
    'midnight black': '#0B0B0B',
    'charcoal': '#242424',
    'onyx': '#121212',
    'white': '#FFFFFF',
    'color 1': '#FFFFFF',
    'off-white': '#FAF9F6',
    'natural': '#F4F1EA',
    'cream': '#F5F2EB',
    'navy': '#1B2A4A',
    'color 2': '#0B0B0B',
    'deep navy': '#0A192F',
    'grey': '#8E8E93',
    'gray': '#8E8E93',
    'heather grey': '#9E9E9E',
    'ash': '#C7C7CC',
    'red': '#D32F2F',
    'crimson': '#B71C1C',
    'maroon': '#880E4F',
    'green': '#2E5A36',
    'forest green': '#1B4D3E',
    'olive': '#556B2F',
    'sage': '#9CAF88',
    'brown': '#6D4C41',
    'mocha': '#4E342E',
    'sand': '#C2B280',
    'beige': '#D7CCC8',
    'volt': '#C7FF2E',
    'neon': '#C7FF2E',
    'yellow': '#FBC02D',
    'blue': '#1976D2',
    'orange': '#E65100',
    'purple': '#5E35B1',
    'pink': '#D81B60'
  };

  const lower = clean.toLowerCase();
  for (const key of Object.keys(map)) {
    if (lower === key || lower.includes(key)) {
      return map[key];
    }
  }
  return '#171717';
}

/**
 * Safely extracts a human-readable size label from any supported size schema:
 * - String: "S", "M", "L", "XL", "XXL"
 * - Object: { size: "S" }, { label: "M", value: "M" }, { name: "L" }, { value: "XL" }, { sizeName: "XXL" }, { code: "S" }
 * - Guards against "[object Object]" corruption, null, undefined, or nested object formats
 */
export function extractSizeLabel(item) {
  if (item == null) return '';
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed === '[object Object]' || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
      return '';
    }
    return trimmed;
  }
  if (typeof item === 'number') {
    return String(item);
  }
  if (typeof item === 'object') {
    const candidates = [
      item.label,
      item.size,
      item.value,
      item.name,
      item.sizeName,
      item.code,
      item.title,
      item.option,
      item.text,
      item.val,
      item.tag
    ];
    for (const cand of candidates) {
      if (typeof cand === 'string') {
        const trimmed = cand.trim();
        if (trimmed && trimmed !== '[object Object]' && trimmed.toLowerCase() !== 'undefined' && trimmed.toLowerCase() !== 'null') {
          return trimmed;
        }
      } else if (typeof cand === 'number') {
        return String(cand);
      } else if (typeof cand === 'object' && cand !== null && cand !== item) {
        const nested = extractSizeLabel(cand);
        if (nested) return nested;
      }
    }
    if (typeof item.toString === 'function') {
      const str = item.toString();
      if (str && str !== '[object Object]' && str.toLowerCase() !== 'undefined' && str.toLowerCase() !== 'null') {
        return str.trim();
      }
    }
  }
  return '';
}

/**
 * Normalizes a size item into a clean structured object:
 * { label: "M", value: "M", available: true }
 */
export function normalizeSizeItem(item) {
  const label = extractSizeLabel(item);
  if (!label) {
    return null;
  }
  let available = true;
  if (typeof item === 'object' && item !== null) {
    if (item.isAvailable === false || item.available === false || item.inStock === false) {
      available = false;
    }
    if (item.stock !== undefined && Number(item.stock) <= 0) {
      available = false;
    }
  }
  return {
    label,
    value: label,
    available
  };
}

function normalizeColorItem(item, defaultImages = [], allRawImages = []) {
  if (typeof item === 'string') {
    const colorName = item;
    let colorImages = [];
    if (Array.isArray(allRawImages)) {
      colorImages = allRawImages
        .filter(img => typeof img === 'object' && img !== null && img.color && img.color.toLowerCase() === colorName.toLowerCase())
        .map(img => extractProductImageUrl(img))
        .filter(Boolean);
    }
    return {
      name: colorName,
      hex: getColorHex(colorName),
      images: colorImages.length > 0 ? colorImages : defaultImages,
      available: true,
      sku: '',
      price: null,
      stock: 15
    };
  }
  if (typeof item === 'object' && item !== null) {
    const name = item.name || item.color || 'Color';
    const hex = item.hex || getColorHex(name);
    let colorImages = [];
    if (Array.isArray(item.images) && item.images.length > 0) {
      colorImages = item.images.map(img => extractProductImageUrl(img)).filter(Boolean);
    } else if (Array.isArray(allRawImages)) {
      colorImages = allRawImages
        .filter(img => typeof img === 'object' && img !== null && img.color && img.color.toLowerCase() === name.toLowerCase())
        .map(img => extractProductImageUrl(img))
        .filter(Boolean);
    }
    return {
      name,
      hex,
      images: colorImages.length > 0 ? colorImages : defaultImages,
      available: item.available !== false && (item.stock === undefined || Number(item.stock) > 0),
      sku: item.sku || '',
      price: item.price ? Number(item.price) : null,
      stock: item.stock !== undefined ? Number(item.stock) : 15
    };
  }
  return {
    name: 'Black',
    hex: '#0B0B0B',
    images: defaultImages,
    available: true,
    sku: '',
    price: null,
    stock: 15
  };
}

/**
 * Safely extracts a clean image URL string from any supported product image schema:
 * - Direct string URL ("https://...")
 * - Object with url, downloadURL, downloadUrl, src, storageUrl, imageUrl, uri
 * - Avoids "[object Object]" corruption
 */
export function extractProductImageUrl(item) {
  if (!item) return '';
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed && trimmed !== '[object Object]') {
      return trimmed;
    }
    return '';
  }
  if (typeof item === 'object' && item !== null) {
    const candidate = item.url ||
      item.downloadURL ||
      item.downloadUrl ||
      item.src ||
      item.storageUrl ||
      item.imageUrl ||
      item.photoUrl ||
      item.pathUrl ||
      item.uri ||
      '';
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed && trimmed !== '[object Object]') {
        return trimmed;
      }
    }
  }
  return '';
}

/**
 * Resolves all product image URLs from Firestore document data,
 * preserving primary image priority, image gallery, and raw metadata objects.
 */
export function extractAllProductImages(data) {
  if (!data || typeof data !== 'object') {
    return { images: [], thumbnail: '', primaryImage: '', rawImages: [] };
  }

  const urls = [];
  const rawList = [];
  let primaryUrl = '';

  const recordImage = (item, isExplicitPrimary = false) => {
    if (!item) return;
    const url = extractProductImageUrl(item);
    if (!url) return;

    if (!urls.includes(url)) {
      if (isExplicitPrimary && !primaryUrl) {
        primaryUrl = url;
        urls.unshift(url);
        rawList.unshift(item);
      } else {
        urls.push(url);
        rawList.push(item);
      }
    } else if (isExplicitPrimary && !primaryUrl) {
      primaryUrl = url;
      const existingIdx = urls.indexOf(url);
      if (existingIdx > 0) {
        urls.splice(existingIdx, 1);
        urls.unshift(url);
      }
    }
  };

  // 1. Explicit primary / thumbnail fields
  if (data.primaryImage) {
    const prim = extractProductImageUrl(data.primaryImage);
    if (prim) {
      primaryUrl = prim;
      recordImage(data.primaryImage, true);
    }
  }
  if (data.thumbnail) {
    recordImage(data.thumbnail, !primaryUrl);
  }

  // 2. data.images array or single image
  if (Array.isArray(data.images)) {
    // Process items marked isPrimary first
    data.images.forEach(img => {
      const isPrim = typeof img === 'object' && img !== null && (img.isPrimary === true || img.viewType === 'front');
      if (isPrim) recordImage(img, true);
    });
    // Then process remaining images
    data.images.forEach(img => {
      const isPrim = typeof img === 'object' && img !== null && (img.isPrimary === true || img.viewType === 'front');
      if (!isPrim) recordImage(img, false);
    });
  } else if (data.images) {
    recordImage(data.images);
  }

  // 3. Alternative/legacy fields
  if (data.image) recordImage(data.image);
  if (data.imageUrl) recordImage(data.imageUrl);
  if (Array.isArray(data.imageUrls)) {
    data.imageUrls.forEach(img => recordImage(img));
  }
  if (Array.isArray(data.photos)) {
    data.photos.forEach(img => recordImage(img));
  }
  if (Array.isArray(data.gallery)) {
    data.gallery.forEach(img => recordImage(img));
  }
  if (Array.isArray(data.media)) {
    data.media.forEach(img => recordImage(img));
  }
  if (data.featuredImage) recordImage(data.featuredImage);
  if (data.coverImage) recordImage(data.coverImage);

  const thumbnail = primaryUrl || urls[0] || '';
  if (thumbnail && urls[0] !== thumbnail) {
    const idx = urls.indexOf(thumbnail);
    if (idx > -1) {
      urls.splice(idx, 1);
    }
    urls.unshift(thumbnail);
  }

  return {
    images: urls,
    thumbnail,
    primaryImage: thumbnail,
    rawImages: rawList
  };
}

export function mapFirestoreProductDoc(docSnap) {
  const data = docSnap.data() || {};
  
  const { images: validImages, thumbnail, primaryImage, rawImages } = extractAllProductImages(data);

  const compareVal = data.compareAtPrice ?? data.comparePrice ?? data.originalPrice;
  const compareAtPrice = (compareVal != null && Number(compareVal) > 0) ? Number(compareVal) : null;

  const rawColors = Array.isArray(data.colors) && data.colors.length > 0 ? data.colors : ['Black'];
  const colors = rawColors.map(c => normalizeColorItem(c, validImages, Array.isArray(data.images) ? data.images : []));

  const resolvedName = data.name || data.title || data.productName || 'Untitled T-Shirt';

  let rawSizes = [];
  if (Array.isArray(data.sizes) && data.sizes.length > 0) {
    rawSizes = data.sizes;
  } else if (typeof data.sizes === 'string' && data.sizes.trim()) {
    rawSizes = data.sizes.split(',').map(s => s.trim()).filter(Boolean);
  } else if (typeof data.sizes === 'object' && data.sizes !== null) {
    const keys = Object.keys(data.sizes);
    const isNumericKeys = keys.every(k => !isNaN(Number(k)));
    if (isNumericKeys) {
      rawSizes = Object.values(data.sizes);
    } else {
      rawSizes = keys.filter(k => data.sizes[k] !== false);
    }
  } else if (Array.isArray(data.availableSizes) && data.availableSizes.length > 0) {
    rawSizes = data.availableSizes;
  } else if (Array.isArray(data.sizeOptions) && data.sizeOptions.length > 0) {
    rawSizes = data.sizeOptions;
  }

  const normalizedSizes = (rawSizes.length > 0 ? rawSizes : ['S', 'M', 'L', 'XL', 'XXL'])
    .map(normalizeSizeItem)
    .filter(s => Boolean(s && s.label));

  const sizes = normalizedSizes.length > 0 ? normalizedSizes : [
    { label: 'S', value: 'S', available: true },
    { label: 'M', value: 'M', available: true },
    { label: 'L', value: 'L', available: true },
    { label: 'XL', value: 'XL', available: true },
    { label: 'XXL', value: 'XXL', available: true }
  ];

  return {
    id: docSnap.id,
    name: resolvedName,
    title: data.title || resolvedName,
    slug: data.slug || docSnap.id,
    description: data.description || '',
    shortDescription: data.shortDescription || '',
    material: data.material || '',
    sizeChart: data.sizeChart || '',
    price: Number(data.price) || 0,
    compareAtPrice,
    category: data.category || 'Graphic Tees',
    sizes,
    sizeLabels: sizes.map(s => s.label),
    colors,
    images: validImages,
    thumbnail,
    primaryImage,
    rawImages,
    stock: typeof data.stock === 'number' ? data.stock : 15,
    sku: data.sku || docSnap.id,
    badge: data.badge || (data.newArrival || data.isNewArrival ? 'NEW DROP' : (data.isBestSeller ? 'BEST SELLER' : '')),
    rating: Number(data.rating) || 5.0,
    reviewCount: Number(data.reviewCount) || 0,
    active: data.active !== false && data.status !== 'archived',
    isBestSeller: Boolean(data.isBestSeller),
    isNewArrival: Boolean(data.isNewArrival || data.newArrival),
    isFeatured: Boolean(data.isFeatured),
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || ''
  };
}

/**
 * Evaluates whether a product is intended for public display on the customer storefront.
 * Respects all existing publication and visibility fields.
 */
export function isProductPublic(data) {
  if (!data) return false;
  if (!data.name && !data.title && !data.productName) return false;
  if (data.active === false) return false;
  if (data.published === false) return false;
  if (data.isDraft === true || data.draft === true) return false;
  if (data.isArchived === true || data.archived === true) return false;
  if (typeof data.status === 'string' && ['draft', 'archived', 'inactive', 'unlisted', 'hidden'].includes(data.status.toLowerCase().trim())) return false;
  if (typeof data.visibility === 'string' && ['hidden', 'private', 'draft', 'archived'].includes(data.visibility.toLowerCase().trim())) return false;
  return true;
}

/**
 * Fetches real products from Cloud Firestore collection `products`.
 * Returns actual documents stored in the database.
 */
export async function fetchProductsFromFirestore() {
  const path = 'products';
  try {
    const snap = await getDocs(collection(db, 'products'));
    const products = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!isProductPublic(data)) return;
      products.push(mapFirestoreProductDoc(docSnap));
    });
    return products;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Subscribes to real-time updates for public products in Firestore `products` collection.
 * Automatically pushes updates when admin adds, updates, activates, deactivates or deletes products.
 */
export function subscribeToProductsFromFirestore(callback) {
  const path = 'products';
  try {
    return onSnapshot(collection(db, 'products'), (snap) => {
      const products = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!isProductPublic(data)) return;
        products.push(mapFirestoreProductDoc(docSnap));
      });
      callback(products);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
      callback([]);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return () => {};
  }
}

/**
 * Fetches a single real product document by ID from Firestore: products/{productId}
 */
export async function fetchProductByIdFromFirestore(productId) {
  const path = `products/${productId}`;
  try {
    const docSnap = await getDoc(doc(db, 'products', productId));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (!isProductPublic(data)) return null;
      return mapFirestoreProductDoc(docSnap);
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Subscribes to real-time updates for a single product document in Firestore: products/{productId}
 */
export function subscribeToProductByIdFromFirestore(productId, callback) {
  const path = `products/${productId}`;
  try {
    return onSnapshot(doc(db, 'products', productId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!isProductPublic(data)) {
          callback(null);
        } else {
          callback(mapFirestoreProductDoc(docSnap));
        }
      } else {
        callback(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      callback(null);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return () => {};
  }
}

/**
 * Uploads a product image directly to Firebase Storage and returns
 * a structured image object compatible with the product schema.
 */
export async function uploadProductImageToStorage(file, productId, options = {}) {
  if (!file) throw new Error('No file provided');
  const timestamp = Date.now();
  const cleanName = (file.name || 'image.jpg').replace(/[^a-zA-Z0-9.]/g, '_');
  const storagePath = `products/${productId}/images/${timestamp}_${cleanName}`;
  const fileRef = ref(storage, storagePath);
  const snap = await uploadBytes(fileRef, file);
  const downloadUrl = await getDownloadURL(snap.ref);
  return {
    id: `img_${timestamp}`,
    name: file.name || cleanName,
    url: downloadUrl,
    downloadURL: downloadUrl,
    storagePath,
    viewType: options.viewType || 'front',
    isPrimary: options.isPrimary ?? (options.viewType === 'front'),
    color: options.color || ''
  };
}

/**
 * Saves or updates a product document in Cloud Firestore `products/{productId}`.
 * Merges new fields while preserving existing document data and timestamps.
 */
export async function saveProductToFirestore(productId, productData) {
  const path = `products/${productId}`;
  try {
    const prodRef = doc(db, 'products', productId);
    const existingSnap = await getDoc(prodRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    const updated = {
      ...existingData,
      ...productData,
      updatedAt: new Date().toISOString()
    };
    if (!existingSnap.exists() && !updated.createdAt) {
      updated.createdAt = new Date().toISOString();
    }
    await setDoc(prodRef, updated, { merge: true });
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

// ==================== REAL FIRESTORE WISHLIST ====================
// users/{uid}/wishlist/{productId}

export async function getWishlistFromFirestore(userId) {
  const path = `users/${userId}/wishlist`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'wishlist'));
    const items = [];
    snap.forEach(docSnap => {
      items.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function addToWishlistInFirestore(userId, product) {
  const path = `users/${userId}/wishlist/${product.id}`;
  try {
    const wishDoc = doc(db, 'users', userId, 'wishlist', product.id);
    await setDoc(wishDoc, {
      productId: product.id,
      name: product.name,
      price: product.price,
      compareAtPrice: product.compareAtPrice || null,
      category: product.category || '',
      badge: product.badge || '',
      images: product.images || [],
      thumbnail: product.thumbnail || (product.images && product.images[0]) || '',
      rating: product.rating || 5.0,
      reviewCount: product.reviewCount || 0,
      addedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

export async function removeFromWishlistInFirestore(userId, productId) {
  const path = `users/${userId}/wishlist/${productId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'wishlist', productId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

// ==================== REAL FIRESTORE CART SYNC ====================

export async function getCartFromFirestore(userId) {
  const path = `users/${userId}/cart/current`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'cart', 'current'));
    if (snap.exists() && Array.isArray(snap.data().items)) {
      return snap.data().items;
    }
    return [];
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}

export async function saveCartToFirestore(userId, items) {
  const path = `users/${userId}/cart/current`;
  try {
    await setDoc(doc(db, 'users', userId, 'cart', 'current'), {
      items,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

/**
 * Validates cart items against real Firestore product documents before checkout.
 * Always fetches the latest product price and stock from Firestore.
 */
export async function verifyCartItemsFromFirestore(cartItems) {
  const verifiedItems = [];
  for (const item of cartItems) {
    try {
      const prodDoc = await getDoc(doc(db, 'products', item.id));
      const cleanSize = extractSizeLabel(item.size || item.selectedSize) || 'Standard';
      if (prodDoc.exists()) {
        const liveData = prodDoc.data();
        verifiedItems.push({
          ...item,
          size: cleanSize,
          selectedSize: cleanSize,
          name: liveData.name || item.name,
          price: Number(liveData.price) || item.price,
          availableStock: typeof liveData.stock === 'number' ? liveData.stock : 99,
          inStock: (typeof liveData.stock === 'number' ? liveData.stock : 99) >= item.quantity
        });
      } else {
        // Product no longer exists in Firestore
        verifiedItems.push({
          ...item,
          size: cleanSize,
          selectedSize: cleanSize,
          inStock: false
        });
      }
    } catch (err) {
      verifiedItems.push({ 
        ...item, 
        size: extractSizeLabel(item.size || item.selectedSize) || 'Standard',
        selectedSize: extractSizeLabel(item.selectedSize || item.size) || 'Standard',
        inStock: true 
      });
    }
  }
  return verifiedItems;
}

// ==================== REAL FIRESTORE ORDERS ====================
// orders/{orderId}

export async function createOrderInFirestore(orderData) {
  const path = `orders/${orderData.orderId}`;
  try {
    const orderRef = doc(db, 'orders', orderData.orderId);
    await setDoc(orderRef, {
      orderId: orderData.orderId,
      userId: orderData.userId || 'guest',
      items: orderData.items || [],
      subtotal: Number(orderData.subtotal) || 0,
      shipping: Number(orderData.shipping) || 0,
      discount: Number(orderData.discount) || 0,
      tax: Number(orderData.tax) || 0,
      total: Number(orderData.total) || 0,
      paymentStatus: orderData.paymentStatus || 'PENDING',
      orderStatus: orderData.orderStatus || 'CONFIRMED',
      shippingAddress: orderData.shippingAddress || {},
      customerEmail: orderData.customerEmail || '',
      customerPhone: orderData.customerPhone || '',
      customerName: orderData.customerName || '',
      trackingNumber: orderData.trackingNumber || '',
      courier: orderData.courier || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    return false;
  }
}

export async function getOrderFromFirestore(orderId) {
  const path = `orders/${orderId}`;
  try {
    const snap = await getDoc(doc(db, 'orders', orderId));
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

export async function getUserOrdersFromFirestore(userId) {
  const path = 'orders';
  try {
    const q = query(collection(db, 'orders'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(docSnap => {
      orders.push(docSnap.data());
    });
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return orders;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// ==================== REAL FIRESTORE REVIEWS ====================

/**
 * Uploads a local File object to Firebase Storage and returns download URL
 */
export async function uploadFileToStorage(file, folder = 'uploads') {
  if (!file) throw new Error('No file provided');
  const timestamp = Date.now();
  const cleanName = (file.name || 'image.jpg').replace(/[^a-zA-Z0-9.]/g, '_');
  const storagePath = `${folder}/${timestamp}_${cleanName}`;
  const fileRef = ref(storage, storagePath);
  const snap = await uploadBytes(fileRef, file);
  return await getDownloadURL(snap.ref);
}

/**
 * Checks if current user has an existing order containing the productId in Firestore
 */
export async function checkVerifiedPurchase(userId, productId, customerEmail = null) {
  if (!productId) return false;
  try {
    if (userId) {
      const q = query(collection(db, 'orders'), where('userId', '==', userId));
      const snap = await getDocs(q);
      let verified = false;
      snap.forEach(docSnap => {
        const order = docSnap.data();
        if (Array.isArray(order.items)) {
          if (order.items.some(item => (item.id === productId || item.productId === productId))) {
            verified = true;
          }
        }
      });
      if (verified) return true;
    }

    const email = customerEmail || auth?.currentUser?.email;
    if (email) {
      const q = query(collection(db, 'orders'), where('customerEmail', '==', email));
      const snap = await getDocs(q);
      let verified = false;
      snap.forEach(docSnap => {
        const order = docSnap.data();
        if (Array.isArray(order.items)) {
          if (order.items.some(item => (item.id === productId || item.productId === productId))) {
            verified = true;
          }
        }
      });
      if (verified) return true;
    }

    return false;
  } catch (err) {
    console.warn('Error checking verified purchase:', err);
    return false;
  }
}

/**
 * Submits a new review to Firestore in 'pending' state
 */
export async function submitProductReview({ productId, rating, title = '', comment, customerName = '', images = [] }) {
  if (!auth.currentUser) {
    throw new Error('Please sign in to write a review.');
  }
  const userId = auth.currentUser.uid;
  const isVerified = await checkVerifiedPurchase(userId, productId);
  const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `reviews/${reviewId}`;

  const reviewDoc = {
    id: reviewId,
    productId,
    userId,
    customerName: customerName.trim() || auth.currentUser.displayName || 'Collector',
    rating: Number(rating) || 5,
    title: title.trim(),
    comment: comment.trim(),
    images: Array.isArray(images) ? images : [],
    verifiedPurchase: isVerified,
    status: 'pending', // Pending review moderation
    helpfulVotes: 0,
    unhelpfulVotes: 0,
    voters: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'reviews', reviewId), reviewDoc);
    return reviewDoc;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    throw err;
  }
}

/**
 * Fetches all approved reviews for a given product
 */
export async function getApprovedProductReviews(productId) {
  if (!productId) return { reviews: [], breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, averageRating: 5.0, totalCount: 0 };
  const path = 'reviews';
  try {
    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', productId),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);
    const reviews = [];
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;

    snap.forEach(d => {
      const data = d.data();
      const r = Math.round(Number(data.rating)) || 5;
      if (breakdown[r] !== undefined) breakdown[r]++;
      ratingSum += (Number(data.rating) || 5);
      reviews.push({ id: d.id, ...data });
    });

    reviews.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const totalCount = reviews.length;
    const averageRating = totalCount > 0 ? (ratingSum / totalCount).toFixed(1) : '5.0';

    return {
      reviews,
      breakdown,
      averageRating: parseFloat(averageRating),
      totalCount
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return { reviews: [], breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, averageRating: 5.0, totalCount: 0 };
  }
}

/**
 * Handles helpful/unhelpful votes safely
 */
export async function voteReview(reviewId, voteType = 'yes') {
  if (!auth.currentUser) throw new Error('Please sign in to vote.');
  const userId = auth.currentUser.uid;
  const reviewRef = doc(db, 'reviews', reviewId);
  const snap = await getDoc(reviewRef);
  if (!snap.exists()) throw new Error('Review not found');

  const data = snap.data();
  const voters = data.voters || {};
  const currentVote = voters[userId];

  let helpfulVotes = data.helpfulVotes || 0;
  let unhelpfulVotes = data.unhelpfulVotes || 0;

  if (currentVote === voteType) {
    return { helpfulVotes, unhelpfulVotes };
  }

  if (currentVote === 'yes') helpfulVotes = Math.max(0, helpfulVotes - 1);
  if (currentVote === 'no') unhelpfulVotes = Math.max(0, unhelpfulVotes - 1);

  if (voteType === 'yes') helpfulVotes++;
  if (voteType === 'no') unhelpfulVotes++;
  voters[userId] = voteType;

  await setDoc(reviewRef, {
    helpfulVotes,
    unhelpfulVotes,
    voters,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  return { helpfulVotes, unhelpfulVotes };
}


/**
 * Recalculates product rating from approved reviews and updates product doc
 */
export async function recalculateProductRating(productId) {
  if (!productId) return;
  try {
    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', productId),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);
    let total = 0;
    let count = 0;
    snap.forEach(d => {
      total += (Number(d.data().rating) || 5);
      count++;
    });

    const rating = count > 0 ? parseFloat((total / count).toFixed(1)) : 5.0;
    const reviewCount = count;

    await setDoc(doc(db, 'products', productId), {
      rating,
      reviewCount,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return { rating, reviewCount };
  } catch (err) {
    console.warn('Error recalculating product rating:', err);
  }
}

// Legacy review fetcher kept for compatibility
export async function getReviewsFromFirestore(productId = null) {
  const path = 'reviews';
  try {
    let q;
    if (productId) {
      q = query(collection(db, 'reviews'), where('productId', '==', productId));
    } else {
      q = collection(db, 'reviews');
    }
    const snap = await getDocs(q);
    const reviews = [];
    snap.forEach(d => reviews.push({ id: d.id, ...d.data() }));
    return reviews;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// ==================== REAL RETURN & REFUND REQUESTS ====================

/**
 * Submits a new return request for an order
 */
export async function submitReturnRequest({ orderId, productId, productName = '', reason, description, images = [] }) {
  if (!orderId || !reason || !description) {
    throw new Error('Order ID, reason, and problem description are required.');
  }

  // Prevent multiple return requests for same order & product
  const existing = await getReturnRequestsForOrder(orderId);
  const alreadyRequested = existing.find(r => !productId || r.productId === productId);
  if (alreadyRequested) {
    throw new Error(`A return request (${alreadyRequested.returnRequestId}) is already on file for this order. Status: ${alreadyRequested.status}`);
  }

  const returnRequestId = `RET-${Date.now()}`;
  const path = `returnRequests/${returnRequestId}`;

  const requestDoc = {
    returnRequestId,
    orderId,
    userId: auth.currentUser?.uid || 'guest',
    customerName: auth.currentUser?.displayName || 'Customer',
    customerEmail: auth.currentUser?.email || '',
    productId: productId || '',
    productName: productName || 'Drop Apparel',
    reason,
    description: description.trim(),
    imageUrls: Array.isArray(images) ? images : [],
    status: 'Return Requested',
    adminNote: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'returnRequests', returnRequestId), requestDoc);
    return requestDoc;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    throw err;
  }
}

export async function getReturnRequestsForOrder(orderId) {
  if (!orderId) return [];
  const path = 'returnRequests';
  try {
    const q = query(collection(db, 'returnRequests'), where('orderId', '==', orderId));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function getReturnRequestsForUser(userId) {
  if (!userId) return [];
  const path = 'returnRequests';
  try {
    const q = query(collection(db, 'returnRequests'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// ==================== REAL FIRESTORE LEADS ====================
// leads/{leadId}

export async function saveLeadToFirestore({ email, name = '', source = 'website', page = 'homepage', marketingConsent = true }) {
  if (!email) return false;
  const sanitizedId = email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
  const path = `leads/${sanitizedId}`;
  try {
    const leadRef = doc(db, 'leads', sanitizedId);
    await setDoc(leadRef, {
      email,
      name,
      source,
      page,
      marketingConsent: marketingConsent !== false,
      createdAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

// ==================== SUPPORT TICKETS ====================
// Collection: supportTickets/{ticketId}

export async function createSupportTicket({
  name,
  email,
  orderId = '',
  category = 'Order Issue',
  subject,
  message,
  attachmentUrls = []
}) {
  if (!name || !email || !subject || !message) {
    throw new Error('Please fill out all required ticket fields.');
  }

  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const ticketId = `TKT-${randomSuffix}`;
  const path = `supportTickets/${ticketId}`;

  try {
    const ticketDoc = {
      ticketId,
      userId: auth.currentUser?.uid || null,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      orderId: (orderId || '').trim(),
      category: category || 'Order Issue',
      subject: subject.trim(),
      message: message.trim(),
      attachmentUrls: Array.isArray(attachmentUrls) ? attachmentUrls : (attachmentUrls ? [attachmentUrls] : []),
      status: 'Open', // 'Open' | 'In Progress' | 'Waiting for Customer' | 'Resolved' | 'Closed'
      adminReply: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'supportTickets', ticketId), ticketDoc);
    return ticketDoc;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    throw err;
  }
}

export async function getSupportTickets({ status, category, searchQuery, userId } = {}) {
  const path = 'supportTickets';
  try {
    const snap = await getDocs(collection(db, 'supportTickets'));
    let items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));

    if (userId) {
      items = items.filter(t => t.userId === userId || t.email?.toLowerCase() === auth.currentUser?.email?.toLowerCase());
    }

    if (status && status !== 'all') {
      items = items.filter(t => (t.status || '').toLowerCase() === status.toLowerCase());
    }

    if (category && category !== 'all') {
      items = items.filter(t => (t.category || '').toLowerCase() === category.toLowerCase());
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(t => 
        (t.ticketId || '').toLowerCase().includes(q) ||
        (t.name || '').toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        (t.orderId || '').toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q) ||
        (t.message || '').toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function getSupportTicketById(ticketId) {
  if (!ticketId) return null;
  const path = `supportTickets/${ticketId}`;
  try {
    const snap = await getDoc(doc(db, 'supportTickets', ticketId));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

export async function updateSupportTicket(ticketId, updates) {
  if (!ticketId) return false;
  const path = `supportTickets/${ticketId}`;
  try {
    const dataToUpdate = {
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'supportTickets', ticketId), dataToUpdate, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

// ==================== FAQS (FREQUENTLY ASKED QUESTIONS) ====================
// Collection: faqs/{faqId}

export const INITIAL_FAQS = [
  // Orders
  {
    faqId: 'faq-ord-1',
    category: 'Orders',
    question: 'How do I place an order?',
    answer: 'Select your drop from the Catalog, choose your preferred oversized fit and color swatch, then click Add to Bag or Buy Now. Follow our checkout with Cards, UPI, Net Banking, or Cash on Delivery.',
    order: 1,
    active: true
  },
  {
    faqId: 'faq-ord-2',
    category: 'Orders',
    question: 'Can I cancel my order?',
    answer: 'Orders can be cancelled within 1 hour of placement before dispatch processing starts. Contact our support team via Contact Support or use our live Order Tracking portal to request instant cancellation.',
    order: 2,
    active: true
  },
  {
    faqId: 'faq-ord-3',
    category: 'Orders',
    question: 'How can I track my order?',
    answer: 'Visit the Track Order page located in our top bar and footer. Simply enter your Order ID (e.g., YS-82914) or registered email address to see live courier tracking and AWB status updates.',
    order: 3,
    active: true
  },
  // Products
  {
    faqId: 'faq-prd-1',
    category: 'Products',
    question: 'What sizes are available?',
    answer: 'We craft our streetwear silhouettes from XS to XXL. All pieces are tailored in our signature relaxed boxy cut with dropped shoulders and ribbed crew necks.',
    order: 4,
    active: true
  },
  {
    faqId: 'faq-prd-2',
    category: 'Products',
    question: 'How do I choose my size?',
    answer: 'Our fits are intentionally oversized. If you prefer a loose streetwear look, order your true standard size. For a more conventional or regular fit, we recommend sizing down one size.',
    order: 5,
    active: true
  },
  {
    faqId: 'faq-prd-3',
    category: 'Products',
    question: 'What is the fabric quality?',
    answer: 'Every garment is milled from 100% combed heavyweight cotton (280 to 320 GSM), treated with bio-wash and silicone softening for zero collar sag, deep color fastness, and lasting durability.',
    order: 6,
    active: true
  },
  // Shipping
  {
    faqId: 'faq-shp-1',
    category: 'Shipping',
    question: 'Where do you ship?',
    answer: 'We ship nationwide to all serviceable postal codes across India and select international destinations. Orders of $75.00 and above automatically receive complimentary Free Express Shipping.',
    order: 7,
    active: true
  },
  {
    faqId: 'faq-shp-2',
    category: 'Shipping',
    question: 'How long does delivery take?',
    answer: 'Orders in major metro hubs are typically delivered within 2-4 business days. Regional and tier-2/3 destinations arrive in 4-6 business days with real-time SMS and email updates.',
    order: 8,
    active: true
  },
  {
    faqId: 'faq-shp-3',
    category: 'Shipping',
    question: 'How can I track my package?',
    answer: 'When your order leaves our apparel lab, an automated dispatch notification with your AWB tracking link is sent via email and SMS. You can also paste your Order ID into our Track Order page at any time.',
    order: 9,
    active: true
  },
  // Returns
  {
    faqId: 'faq-ret-1',
    category: 'Returns',
    question: 'Can I return a damaged product?',
    answer: 'Absolutely. If you receive a damaged or defective item, file a return claim on our Return & Refund Policy page or Contact Support within 7 days of delivery. We will replace or refund it immediately.',
    order: 10,
    active: true
  },
  {
    faqId: 'faq-ret-2',
    category: 'Returns',
    question: 'What if I receive the wrong product?',
    answer: 'Notify us right away via Contact Support with a photo of the received piece. We will immediately arrange a doorstep reverse pickup and dispatch the correct garment at zero additional cost.',
    order: 11,
    active: true
  },
  {
    faqId: 'faq-ret-3',
    category: 'Returns',
    question: 'How do I request a refund?',
    answer: 'Initiate a return request on our Return & Refund Policy page with your Order ID and photo evidence. Once received and inspected at our warehouse, your refund is credited to your original payment method in 3-5 business days.',
    order: 12,
    active: true
  },
  // Payment
  {
    faqId: 'faq-pay-1',
    category: 'Payment',
    question: 'What payment methods are supported?',
    answer: 'We support all major Credit and Debit Cards (Visa, MasterCard, RuPay, Amex), UPI (Google Pay, PhonePe, Paytm, BHIM), Net Banking across 50+ financial institutions, and Cash on Delivery (COD).',
    order: 13,
    active: true
  },
  {
    faqId: 'faq-pay-2',
    category: 'Payment',
    question: 'Is checkout secure?',
    answer: 'Yes. All payments are encrypted with end-to-end 256-bit SSL protocols and processed through PCI-DSS Level 1 certified gateways. We do not store sensitive payment credentials or CVV numbers.',
    order: 14,
    active: true
  },
  // Coupons
  {
    faqId: 'faq-cpn-1',
    category: 'Coupons',
    question: 'How do I use a coupon?',
    answer: 'In your Cart or during Checkout, find the "Have a promo code?" input box. Enter your code (e.g. SAVE20, FIRST10, or B2G1) and click Apply. Your price breakdown will recalculate automatically.',
    order: 15,
    active: true
  },
  {
    faqId: 'faq-cpn-2',
    category: 'Coupons',
    question: 'Why isn\'t my coupon working?',
    answer: 'Coupons may require a minimum subtotal (such as $80.00 for MIN80), may have reached their customer usage limit, or may have expired. Verify the promo conditions in our active banner offers or Contact Support.',
    order: 16,
    active: true
  }
];

export async function getFaqsFromFirestore() {
  const path = 'faqs';
  try {
    const snap = await getDocs(collection(db, 'faqs'));
    let items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));

    if (items.length === 0) {
      for (const faq of INITIAL_FAQS) {
        try {
          await setDoc(doc(db, 'faqs', faq.faqId), {
            ...faq,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          // ignore seeding write error
        }
      }
      return INITIAL_FAQS;
    }

    items.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return INITIAL_FAQS;
  }
}

export async function saveFaqToFirestore(faqData) {
  const faqId = faqData.faqId || `faq_${Date.now()}`;
  const path = `faqs/${faqId}`;
  try {
    const docData = {
      faqId,
      category: faqData.category || 'Orders',
      question: faqData.question.trim(),
      answer: faqData.answer.trim(),
      order: Number(faqData.order) || 1,
      active: faqData.active !== false,
      updatedAt: new Date().toISOString()
    };
    if (!faqData.createdAt) {
      docData.createdAt = new Date().toISOString();
    }
    await setDoc(doc(db, 'faqs', faqId), docData, { merge: true });
    return docData;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteFaqFromFirestore(faqId) {
  if (!faqId) return false;
  const path = `faqs/${faqId}`;
  try {
    await deleteDoc(doc(db, 'faqs', faqId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}
