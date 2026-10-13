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
    if (user && !user.isAnonymous) {
      currentUser = user;
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
      currentUser = null;
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

export const AUTHORIZED_ADMIN_EMAIL = 'baijitsk860@gmail.com';

export function updateAuthUI(user, profile) {
  const accountLinks = document.querySelectorAll('.auth-account-link');
  const isAdmin = user && (user.email || '').toLowerCase().trim() === AUTHORIZED_ADMIN_EMAIL.toLowerCase();
  
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

  // Handle Admin Panel link in website footer or account menu
  const existingAdminLinks = document.querySelectorAll('.admin-portal-link');
  if (isAdmin) {
    if (existingAdminLinks.length === 0) {
      // 1. Inject into footers
      document.querySelectorAll('footer').forEach(footer => {
        const linksContainer = footer.querySelector('div:last-child') || footer.querySelector('nav') || footer.querySelector('.max-w-7xl');
        if (linksContainer) {
          const adminLink = document.createElement('a');
          adminLink.href = '/admin';
          adminLink.className = 'admin-portal-link inline-flex items-center gap-1.5 font-bold uppercase text-[#0B0B0B] bg-[#C7FF2E] px-2.5 py-1 border border-[#0B0B0B] hover:bg-white hover:text-[#0B0B0B] transition-colors ml-4 text-[11px]';
          adminLink.innerHTML = '<i class="fa-solid fa-shield-halved text-[10px]"></i> ADMIN PANEL';
          linksContainer.appendChild(adminLink);
        }
      });

      // 2. Inject into header navigation
      document.querySelectorAll('header nav').forEach(nav => {
        if (!nav.querySelector('.admin-portal-link')) {
          const navAdminLink = document.createElement('a');
          navAdminLink.href = '/admin';
          navAdminLink.className = 'admin-portal-link font-editorial font-bold text-xs uppercase tracking-wider text-[#0B0B0B] bg-[#C7FF2E] px-2 py-1 border border-[#0B0B0B] hover:bg-[#0B0B0B] hover:text-[#F7F5F0] transition-colors flex items-center gap-1';
          navAdminLink.innerHTML = '<i class="fa-solid fa-lock text-[10px]"></i> ADMIN';
          nav.appendChild(navAdminLink);
        }
      });

      // 3. Inject into mobile menu if present
      const mobileMenu = document.getElementById('mobile-menu');
      if (mobileMenu && !mobileMenu.querySelector('.admin-portal-link')) {
        const mobAdminLink = document.createElement('a');
        mobAdminLink.href = '/admin';
        mobAdminLink.className = 'admin-portal-link block font-editorial font-bold text-sm uppercase tracking-wider text-[#0B0B0B] bg-[#C7FF2E] p-3 border border-[#0B0B0B] mt-4 text-center';
        mobAdminLink.innerHTML = '<i class="fa-solid fa-shield-halved mr-2"></i> ENTER ADMIN PANEL';
        mobileMenu.appendChild(mobAdminLink);
      }
    } else {
      existingAdminLinks.forEach(el => el.classList.remove('hidden'));
    }
  } else {
    existingAdminLinks.forEach(el => el.remove());
  }
}
