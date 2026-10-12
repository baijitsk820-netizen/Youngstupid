// User Authentication & Cloud Firestore profile sync
import { 
  auth, 
  loginWithGoogle, 
  logoutUser, 
  getUserProfile, 
  updateUserProfile,
  getUserOrdersFromFirestore 
} from './firebase-init.js';
import { onAuthStateChanged } from 'firebase/auth';
import { loadWishlistFromFirestore } from './wishlist.js';
import { syncCartFromFirestore } from './cart.js';

let currentUser = null;
let currentProfile = null;

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentProfile() {
  return currentProfile;
}

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      // 1. Fetch Cloud Firestore User Profile
      currentProfile = await getUserProfile(user.uid);
      if (!currentProfile) {
        currentProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'Collector',
          phone: user.phoneNumber || '',
          shippingAddress: ''
        };
      }

      // 2. Sync Cloud Firestore Wishlist
      await loadWishlistFromFirestore();

      // 3. Sync Cloud Firestore Cart
      await syncCartFromFirestore();

      updateAuthUI(user, currentProfile);

      // 4. Render Profile and Order History if on login page
      if (typeof window.renderAccountDashboard === 'function') {
        const orders = await getUserOrdersFromFirestore(user.uid);
        window.renderAccountDashboard(user, currentProfile, orders);
      }
    } else {
      currentProfile = null;
      updateAuthUI(null, null);
      if (typeof window.renderAccountDashboard === 'function') {
        window.renderAccountDashboard(null, null, []);
      }
    }
  });

  // Attach Google Sign-in trigger
  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      try {
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<span class="inline-block animate-spin mr-2">◌</span> Connecting to Google...';
        await loginWithGoogle();
        if (window.showToast) window.showToast('Signed in successfully via Google');
      } catch (err) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-4 h-4 mr-3" alt="Google"> Continue with Google`;
        alert('Authentication Notice: ' + (err.message || 'Could not complete login'));
      }
    });
  }

  // Handle logout buttons
  document.querySelectorAll('.logout-trigger-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logoutUser();
      if (window.showToast) window.showToast('Signed out of account');
      setTimeout(() => {
        window.location.reload();
      }, 400);
    });
  });
}

export function updateAuthUI(user, profile) {
  const accountLinks = document.querySelectorAll('.auth-account-link');
  
  if (user) {
    accountLinks.forEach(link => {
      link.setAttribute('href', '/login.html');
      link.setAttribute('title', `Logged in as ${profile?.displayName || user.displayName || user.email}`);
      const icon = link.querySelector('i');
      if (icon) {
        icon.className = 'fa-solid fa-user-check text-xs text-[#0B0B0B]';
      }
    });
  } else {
    accountLinks.forEach(link => {
      link.setAttribute('href', '/login.html');
      link.setAttribute('title', 'Sign In / Register');
      const icon = link.querySelector('i');
      if (icon) {
        icon.className = 'fa-regular fa-user text-xs';
      }
    });
  }
}
