// Wishlist management with Cloud Firestore as primary persistence
import { 
  auth, 
  getWishlistFromFirestore, 
  addToWishlistInFirestore, 
  removeFromWishlistInFirestore 
} from './firebase-init.js';

// In-memory cache synced with Firestore
let cachedWishlist = [];
const WISHLIST_LOCAL_BACKUP = 'young_stupid_guest_wishlist_cache';

// Initialize cache from session backup
try {
  const stored = localStorage.getItem(WISHLIST_LOCAL_BACKUP);
  if (stored) cachedWishlist = JSON.parse(stored);
} catch (e) {
  cachedWishlist = [];
}

export function getWishlist() {
  return cachedWishlist;
}

export function isInWishlist(productId) {
  return cachedWishlist.some(item => item.id === productId);
}

// Fetch directly from Firestore when user is authenticated
export async function loadWishlistFromFirestore() {
  if (auth?.currentUser) {
    const cloudItems = await getWishlistFromFirestore(auth.currentUser.uid);
    // If there were any guest items prior to login, migrate them to Firestore
    if (cachedWishlist.length > 0) {
      for (const item of cachedWishlist) {
        if (!cloudItems.some(ci => ci.id === item.id)) {
          await addToWishlistInFirestore(auth.currentUser.uid, item);
          cloudItems.push(item);
        }
      }
    }
    cachedWishlist = cloudItems;
    updateWishlistUI();
  }
}

export async function toggleWishlist(product) {
  const existingIdx = cachedWishlist.findIndex(item => item.id === product.id);
  let isNowSaved = false;

  if (existingIdx > -1) {
    // Remove from in-memory cache
    cachedWishlist.splice(existingIdx, 1);
    // Remove from Cloud Firestore
    if (auth?.currentUser) {
      await removeFromWishlistInFirestore(auth.currentUser.uid, product.id);
    }
    if (window.showToast) window.showToast('Removed from your wishlist');
  } else {
    // Add to in-memory cache
    const itemData = {
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice || product.price,
      category: product.category,
      badge: product.badge || '',
      images: product.images || [],
      rating: product.rating,
      reviews: product.reviews
    };
    cachedWishlist.push(itemData);
    isNowSaved = true;

    // Persist to Cloud Firestore
    if (auth?.currentUser) {
      await addToWishlistInFirestore(auth.currentUser.uid, itemData);
    }
    if (window.showToast) window.showToast('Saved to Cloud Wishlist');
  }

  // Backup cache for smooth guest experience
  try {
    localStorage.setItem(WISHLIST_LOCAL_BACKUP, JSON.stringify(cachedWishlist));
  } catch (e) {}

  updateWishlistUI();
  return isNowSaved;
}

export function updateWishlistBadges() {
  const count = cachedWishlist.length;
  const badges = document.querySelectorAll('.wishlist-count-badge');
  badges.forEach(b => {
    b.textContent = count;
    if (count > 0) {
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }
  });
}

export function updateWishlistUI() {
  updateWishlistBadges();
  
  // Update heart buttons icons across current page
  document.querySelectorAll('[data-wishlist-id]').forEach(btn => {
    const id = btn.getAttribute('data-wishlist-id');
    const isSaved = cachedWishlist.some(p => p.id === id);
    const icon = btn.querySelector('i') || btn;
    if (isSaved) {
      btn.classList.add('text-[#0B0B0B]', 'bg-[#C7FF2E]');
      btn.classList.remove('text-[#6B6B6B]', 'bg-white');
      if (icon.tagName === 'I') {
        icon.className = 'fa-solid fa-heart text-xs';
      }
    } else {
      btn.classList.remove('text-[#0B0B0B]', 'bg-[#C7FF2E]');
      btn.classList.add('text-[#6B6B6B]', 'bg-white');
      if (icon.tagName === 'I') {
        icon.className = 'fa-regular fa-heart text-xs';
      }
    }
  });

  if (typeof window.renderWishlistPage === 'function') {
    window.renderWishlistPage();
  }
}
