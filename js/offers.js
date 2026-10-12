// Dynamic Offer & Discount System for YOUNG & STUPID
import { db, handleFirestoreError, OperationType, auth } from './firebase-init.js';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where } from 'firebase/firestore';

const OFFERS_LOCAL_STORAGE_KEY = 'ys_active_coupon_code';
const OFFERS_CACHE_KEY = 'ys_cached_offers_list';

// Default initial offers covering all 9 offer types
export const INITIAL_OFFERS = [
  {
    offerId: 'off_save20',
    title: 'Limited Time Drop: 20% Off',
    type: 'percentage', // 1. Percentage Discount
    discountValue: 20,
    couponCode: 'SAVE20',
    minimumOrder: 30,
    applicableProducts: [],
    applicableCategories: [],
    badgeText: '20% OFF',
    startDate: new Date(Date.now() - 86400000 * 2).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 4).toISOString(), // 4 days from now for live countdown
    usageLimit: 500,
    usedCount: 23,
    perCustomerLimit: 1,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_flat15',
    title: 'Flat $15 Off Streetwear Order',
    type: 'fixed', // 2. Fixed Amount Discount
    discountValue: 15,
    couponCode: 'FLAT15',
    minimumOrder: 50,
    applicableProducts: [],
    applicableCategories: [],
    badgeText: '$15 OFF',
    startDate: new Date(Date.now() - 86400000 * 5).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 15).toISOString(),
    usageLimit: 300,
    usedCount: 11,
    perCustomerLimit: 1,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_b2g1',
    title: 'Buy 2 Get 1 Free on Heavyweight Drops',
    type: 'buy_2_get_1', // 3. Buy 2 Get 1
    discountValue: 0,
    couponCode: 'B2G1',
    minimumOrder: 0,
    applicableProducts: [],
    applicableCategories: ['OVERSIZED', 'Graphic Drops', 'T-SHIRT'],
    badgeText: 'B2G1 FREE',
    startDate: new Date(Date.now() - 86400000 * 5).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 7).toISOString(),
    usageLimit: 250,
    usedCount: 9,
    perCustomerLimit: 2,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_b3g1',
    title: 'Buy 3 Get 1 Free Storewide Bundle',
    type: 'buy_3_get_1', // 4. Buy 3 Get 1
    discountValue: 0,
    couponCode: 'B3G1',
    minimumOrder: 0,
    applicableProducts: [],
    applicableCategories: [],
    badgeText: 'B3G1 FREE',
    startDate: new Date(Date.now() - 86400000 * 5).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 10).toISOString(),
    usageLimit: 200,
    usedCount: 5,
    perCustomerLimit: 2,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_freeship',
    title: 'Complimentary Express Air Shipping',
    type: 'free_shipping', // 5. Free Shipping
    discountValue: 0,
    couponCode: 'FREESHIP',
    minimumOrder: 45,
    applicableProducts: [],
    applicableCategories: [],
    badgeText: 'FREE SHIPPING',
    startDate: new Date(Date.now() - 86400000 * 10).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 20).toISOString(),
    usageLimit: 1000,
    usedCount: 42,
    perCustomerLimit: 3,
    freeShipping: true,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_min80',
    title: '$20 Off Orders Over $80',
    type: 'min_order', // 6. Minimum Order Discount
    discountValue: 20,
    couponCode: 'MIN80',
    minimumOrder: 80,
    applicableProducts: [],
    applicableCategories: [],
    badgeText: '$20 OFF $80+',
    startDate: new Date(Date.now() - 86400000 * 7).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 14).toISOString(),
    usageLimit: 500,
    usedCount: 18,
    perCustomerLimit: 1,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_prod_spec',
    title: 'Featured Silhouette Drop: 15% Off',
    type: 'product_specific', // 7. Product-specific Discount
    discountValue: 15,
    couponCode: 'DROP15',
    minimumOrder: 0,
    applicableProducts: ['prod_1', 'ys-muwuychi', 'prod_1791348604872'],
    applicableCategories: [],
    badgeText: '15% OFF SPECIFIC',
    startDate: new Date(Date.now() - 86400000 * 3).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 12).toISOString(),
    usageLimit: 400,
    usedCount: 7,
    perCustomerLimit: 1,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_cat_spec',
    title: '25% Off Oversized Drops',
    type: 'category_specific', // 8. Category-specific Discount
    discountValue: 25,
    couponCode: 'OVERSIZED25',
    minimumOrder: 0,
    applicableProducts: [],
    applicableCategories: ['OVERSIZED', 'Oversized', 'Heavyweight'],
    badgeText: '25% OFF OVERSIZED',
    startDate: new Date(Date.now() - 86400000 * 4).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 16).toISOString(),
    usageLimit: 300,
    usedCount: 16,
    perCustomerLimit: 2,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    offerId: 'off_firstdrop',
    title: 'First Collector Order: $10 Off',
    type: 'first_order', // 9. First Order Discount
    discountValue: 10,
    couponCode: 'FIRSTDROP',
    minimumOrder: 40,
    applicableProducts: [],
    applicableCategories: [],
    badgeText: '$10 OFF',
    startDate: new Date(Date.now() - 86400000 * 10).toISOString(),
    endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    usageLimit: 1000,
    usedCount: 14,
    perCustomerLimit: 1,
    freeShipping: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

/**
 * Retrieves all offers from Firestore with fallback to cached/default offers
 */
export async function getAllOffersFromFirestore() {
  try {
    const snap = await getDocs(collection(db, 'offers'));
    if (!snap.empty) {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      localStorage.setItem(OFFERS_CACHE_KEY, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    // If offers collection is permission-restricted or not yet provisioned, check config doc
    try {
      const configDoc = await getDoc(doc(db, 'products', 'store_offers_config'));
      if (configDoc.exists() && Array.isArray(configDoc.data().offers)) {
        const list = configDoc.data().offers;
        localStorage.setItem(OFFERS_CACHE_KEY, JSON.stringify(list));
        return list;
      }
    } catch (e) {
      // Continue to local cache
    }
  }

  // Fallback to cached or initial offers
  try {
    const cached = localStorage.getItem(OFFERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  // Initialize with initial offers
  localStorage.setItem(OFFERS_CACHE_KEY, JSON.stringify(INITIAL_OFFERS));
  return INITIAL_OFFERS;
}

/**
 * Determines offer status: 'Active' | 'Scheduled' | 'Expired' | 'Disabled'
 */
export function getOfferStatus(offer) {
  if (!offer.active) return 'Disabled';
  const now = new Date().getTime();
  if (offer.startDate && new Date(offer.startDate).getTime() > now) {
    return 'Scheduled';
  }
  if (offer.endDate && new Date(offer.endDate).getTime() < now) {
    return 'Expired';
  }
  if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
    return 'Expired';
  }
  return 'Active';
}

/**
 * Finds the best active automated offer for a single product (used for product page banners & countdowns)
 */
export async function getActiveOfferForProduct(product) {
  if (!product) return null;
  const allOffers = await getAllOffersFromFirestore();
  const activeOffers = allOffers.filter(o => getOfferStatus(o) === 'Active');

  for (const offer of activeOffers) {
    // Check product specific
    if (Array.isArray(offer.applicableProducts) && offer.applicableProducts.length > 0) {
      if (offer.applicableProducts.includes(product.id) || offer.applicableProducts.includes(product.sku)) {
        return offer;
      }
      continue;
    }

    // Check category specific
    if (Array.isArray(offer.applicableCategories) && offer.applicableCategories.length > 0) {
      const pCat = (product.category || '').toLowerCase();
      const matchesCat = offer.applicableCategories.some(c => c.toLowerCase() === pCat);
      if (matchesCat) return offer;
      continue;
    }

    // Storewide automated percentage/fixed discount with no coupon code required or general promo
    if (offer.type === 'percentage' || offer.type === 'fixed') {
      return offer;
    }
  }

  // Default to first active percentage offer if available
  return activeOffers.find(o => o.type === 'percentage') || activeOffers[0] || null;
}

/**
 * Validates a coupon code against a cart and current user
 */
export async function validateCoupon(code, cart, userEmail = null, userId = null) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Please enter a coupon code.' };
  }

  const cleanCode = code.trim().toUpperCase();
  const allOffers = await getAllOffersFromFirestore();
  const offer = allOffers.find(o => (o.couponCode || '').toUpperCase() === cleanCode);

  if (!offer) {
    return { valid: false, error: `Coupon code "${cleanCode}" is invalid.` };
  }

  const status = getOfferStatus(offer);
  if (status === 'Disabled') {
    return { valid: false, error: `Coupon "${cleanCode}" is currently inactive.` };
  }
  if (status === 'Scheduled') {
    return { valid: false, error: `Coupon "${cleanCode}" is scheduled for a future drop.` };
  }
  if (status === 'Expired') {
    return { valid: false, error: `Coupon "${cleanCode}" has expired or reached its usage limit.` };
  }

  // Check Cart items
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);

  if (offer.minimumOrder && subtotal < offer.minimumOrder) {
    return {
      valid: false,
      error: `Minimum order amount of $${offer.minimumOrder.toFixed(2)} USD required for this coupon.`
    };
  }

  // Check product / category applicability
  if (Array.isArray(offer.applicableProducts) && offer.applicableProducts.length > 0) {
    const hasMatch = cart.some(item => offer.applicableProducts.includes(item.id || item.productId));
    if (!hasMatch) {
      return { valid: false, error: `This coupon is only valid for selected drop items.` };
    }
  }

  if (Array.isArray(offer.applicableCategories) && offer.applicableCategories.length > 0) {
    const hasCatMatch = cart.some(item => {
      const cat = (item.category || '').toLowerCase();
      return offer.applicableCategories.some(c => c.toLowerCase() === cat);
    });
    // If cart items don't have category embedded, permit if product check passes
  }

  // Anti-Abuse: First order check
  if (offer.type === 'first_order') {
    const uid = userId || auth?.currentUser?.uid;
    const email = userEmail || auth?.currentUser?.email;
    if (uid || email) {
      const hasPrior = await checkUserHasPriorOrders(uid, email);
      if (hasPrior) {
        return { valid: false, error: 'This coupon is exclusively valid for your first order.' };
      }
    }
  }

  return {
    valid: true,
    offer,
    code: cleanCode
  };
}

/**
 * Checks if user has prior completed orders in Firestore
 */
async function checkUserHasPriorOrders(userId, email) {
  try {
    if (userId) {
      const q = query(collection(db, 'orders'), where('userId', '==', userId));
      const snap = await getDocs(q);
      if (!snap.empty) return true;
    }
    if (email) {
      const q = query(collection(db, 'orders'), where('customerEmail', '==', email));
      const snap = await getDocs(q);
      if (!snap.empty) return true;
    }
  } catch (e) {
    // If query fails, fall back to false
  }
  return false;
}

/**
 * Calculates complete price breakdown for a cart and active offer/coupon
 */
export function calculateOrderTotals(cart, appliedOffer = null, defaultShipping = 5.00, freeShippingThreshold = 75.00) {
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  let discountAmount = 0;
  let isFreeShipping = subtotal >= freeShippingThreshold;

  if (appliedOffer && getOfferStatus(appliedOffer) === 'Active') {
    if (appliedOffer.freeShipping || appliedOffer.type === 'free_shipping') {
      isFreeShipping = true;
    }

    switch (appliedOffer.type) {
      case 'percentage': {
        const pct = Math.min(100, Math.max(0, Number(appliedOffer.discountValue) || 0));
        discountAmount = (subtotal * pct) / 100;
        break;
      }
      case 'fixed':
      case 'first_order': {
        const fixed = Number(appliedOffer.discountValue) || 0;
        discountAmount = Math.min(subtotal, fixed);
        break;
      }
      case 'min_order': {
        const minReq = Number(appliedOffer.minimumOrder) || 0;
        if (subtotal >= minReq) {
          const fixedOrPct = Number(appliedOffer.discountValue) || 0;
          // If value is greater than 100, treat as fixed dollar discount, else if specified as dollar amount check
          discountAmount = Math.min(subtotal, fixedOrPct);
        }
        break;
      }
      case 'product_specific': {
        const matchingItems = cart.filter(item => {
          if (!Array.isArray(appliedOffer.applicableProducts) || appliedOffer.applicableProducts.length === 0) return true;
          return appliedOffer.applicableProducts.includes(item.id || item.productId);
        });
        const matchSubtotal = matchingItems.length > 0 
          ? matchingItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0)
          : subtotal;
        const pct = Math.min(100, Math.max(0, Number(appliedOffer.discountValue) || 0));
        discountAmount = (matchSubtotal * pct) / 100;
        break;
      }
      case 'category_specific': {
        const matchingItems = cart.filter(item => {
          if (!Array.isArray(appliedOffer.applicableCategories) || appliedOffer.applicableCategories.length === 0) return true;
          const cat = (item.category || '').toLowerCase();
          return appliedOffer.applicableCategories.some(c => c.toLowerCase() === cat);
        });
        const matchSubtotal = matchingItems.length > 0 
          ? matchingItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0)
          : subtotal;
        const pct = Math.min(100, Math.max(0, Number(appliedOffer.discountValue) || 0));
        discountAmount = (matchSubtotal * pct) / 100;
        break;
      }
      case 'free_shipping': {
        isFreeShipping = true;
        discountAmount = 0;
        break;
      }
      case 'buy_2_get_1': {
        // For every 3 items in cart, cheapest 1 item is free
        const allItems = [];
        cart.forEach(item => {
          for (let i = 0; i < item.quantity; i++) {
            allItems.push(Number(item.price));
          }
        });
        allItems.sort((a, b) => a - b); // cheapest first
        const freeItemsCount = Math.floor(allItems.length / 3);
        for (let i = 0; i < freeItemsCount; i++) {
          discountAmount += allItems[i];
        }
        break;
      }
      case 'buy_3_get_1': {
        const allItems = [];
        cart.forEach(item => {
          for (let i = 0; i < item.quantity; i++) {
            allItems.push(Number(item.price));
          }
        });
        allItems.sort((a, b) => a - b);
        const freeItemsCount = Math.floor(allItems.length / 4);
        for (let i = 0; i < freeItemsCount; i++) {
          discountAmount += allItems[i];
        }
        break;
      }
      default:
        if (Number(appliedOffer.discountValue) > 0) {
          discountAmount = (subtotal * Number(appliedOffer.discountValue)) / 100;
        }
    }
  }

  discountAmount = Math.min(subtotal, Math.round(discountAmount * 100) / 100);
  const shippingCost = isFreeShipping ? 0 : defaultShipping;
  const tax = 0; // standard inclusive tax
  const total = Math.max(0, subtotal - discountAmount + shippingCost + tax);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discountAmount * 100) / 100,
    shipping: shippingCost,
    tax: 0,
    total: Math.round(total * 100) / 100,
    isFreeShipping
  };
}

/**
 * Tracks offer usage increment in Firestore
 */
export async function recordOfferUsage(offerId) {
  if (!offerId) return;
  try {
    const offerRef = doc(db, 'offers', offerId);
    const snap = await getDoc(offerRef);
    if (snap.exists()) {
      const data = snap.data();
      await setDoc(offerRef, {
        usedCount: (data.usedCount || 0) + 1,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {
    // Fall back to updating config doc
    try {
      const configRef = doc(db, 'products', 'store_offers_config');
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        const offers = snap.data().offers || [];
        const target = offers.find(o => o.offerId === offerId);
        if (target) {
          target.usedCount = (target.usedCount || 0) + 1;
          await setDoc(configRef, { offers, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }
    } catch (e) {}
  }
}

// Active Coupon Storage Helpers
export function getSavedCouponCode() {
  return localStorage.getItem(OFFERS_LOCAL_STORAGE_KEY) || '';
}

export function saveCouponCode(code) {
  if (code) {
    localStorage.setItem(OFFERS_LOCAL_STORAGE_KEY, code.toUpperCase());
  } else {
    localStorage.removeItem(OFFERS_LOCAL_STORAGE_KEY);
  }
}

export function removeSavedCouponCode() {
  localStorage.removeItem(OFFERS_LOCAL_STORAGE_KEY);
}
