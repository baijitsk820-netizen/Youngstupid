// YOUNG & STUPID Global App Orchestration
import { getAllProducts, getProductById } from './products.js';
import { 
  getCart, 
  addToCart, 
  openCartDrawer, 
  closeCartDrawer, 
  renderCartDrawer, 
  updateCartBadges,
  formatPrice,
  FREE_SHIPPING_THRESHOLD
} from './cart.js';
import { 
  toggleWishlist, 
  updateWishlistBadges, 
  updateWishlistUI 
} from './wishlist.js';
import { initAuth } from './auth.js';
import { saveLeadToFirestore, extractProductImageUrl, extractSizeLabel, normalizeSizeItem } from './firebase-init.js';

// Global Toast System
window.showToast = function(message, duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-msg bg-[#0B0B0B] text-[#F7F5F0] border-l-4 border-[#C7FF2E] px-4 py-3 shadow-2xl flex items-center gap-3 text-xs tracking-wide uppercase font-semibold';
  toast.innerHTML = `
    <span class="text-[#C7FF2E] font-bold">✓</span>
    <span class="flex-1">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// Quick Add Size Selector Modal
window.openQuickAddModal = async function(productId) {
  const product = await getProductById(productId);
  if (!product) return;

  let modal = document.getElementById('quick-add-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'quick-add-modal';
    modal.className = 'fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
    document.body.appendChild(modal);
  }

  const rawSizes = (Array.isArray(product.sizes) && product.sizes.length > 0)
    ? product.sizes
    : (Array.isArray(product.sizeLabels) && product.sizeLabels.length > 0
      ? product.sizeLabels
      : ['S', 'M', 'L', 'XL', 'XXL']);

  const sizes = rawSizes.map(normalizeSizeItem).filter(Boolean);
  const activeSizes = sizes.length > 0 ? sizes : [
    { label: 'S', value: 'S', available: true },
    { label: 'M', value: 'M', available: true },
    { label: 'L', value: 'L', available: true },
    { label: 'XL', value: 'XL', available: true },
    { label: 'XXL', value: 'XXL', available: true }
  ];
  const firstImg = extractProductImageUrl(Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : (product.thumbnail || product.image || ''));

  modal.innerHTML = `
    <div class="bg-[#F7F5F0] text-[#0B0B0B] w-full max-w-md border border-[#0B0B0B] p-6 shadow-2xl animate-fade-up relative">
      <button id="close-quick-add" class="absolute top-4 right-4 text-sm font-bold text-[#6B6B6B] hover:text-[#0B0B0B]">✕</button>
      <div class="flex gap-4 items-center border-b border-[#E8E6E1] pb-4">
        <div class="w-16 h-20 bg-white border border-[#0B0B0B]/10 overflow-hidden shrink-0 flex items-center justify-center relative">
          ${firstImg ? `
            <img src="${firstImg}" alt="${product.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling?.classList.remove('hidden');" />
            <div class="hidden w-full h-full flex items-center justify-center bg-[#E8E6E1] text-[#6B6B6B]">
              <i class="fa-solid fa-shirt text-[#6B6B6B]"></i>
            </div>
          ` : `<i class="fa-solid fa-shirt text-[#6B6B6B]"></i>`}
        </div>
        <div>
          <span class="text-[10px] uppercase font-bold tracking-widest text-[#6B6B6B]">${product.category || 'Drop'}</span>
          <h3 class="font-editorial text-sm font-bold uppercase tracking-tight">${product.name}</h3>
          <div class="font-editorial font-bold text-base mt-1">
            ${formatPrice(product.price)}
            ${product.compareAtPrice ? `<span class="text-xs line-through text-[#6B6B6B] font-normal ml-1.5">${formatPrice(product.compareAtPrice)}</span>` : ''}
          </div>
        </div>
      </div>
      
      <div class="mt-4">
        <div class="flex justify-between items-center mb-2">
          <label class="block text-xs uppercase font-bold tracking-wider">Select Size: <strong id="quick-add-size-label" class="text-[#6B6B6B] font-normal">Choose size</strong></label>
        </div>
        <div class="grid grid-cols-5 gap-2" id="quick-add-sizes">
          ${activeSizes.map((s) => {
            const cleanLabel = extractSizeLabel(s.label || s.value || s);
            return `
            <button type="button" data-size="${cleanLabel}" class="size-btn border border-[#0B0B0B]/30 py-2 text-xs font-bold hover:border-[#0B0B0B] transition-colors bg-white text-[#0B0B0B] cursor-pointer">
              ${cleanLabel}
            </button>
          `;
          }).join('')}
        </div>
        <div class="text-[11px] text-[#6B6B6B] mt-2 flex justify-between items-center">
          <span>Heavyweight Drop Silhouette</span>
          <span class="text-emerald-800 font-semibold">${product.stock > 0 ? `Stock: ${product.stock} units` : 'In Stock'}</span>
        </div>
      </div>

      <button id="confirm-quick-add" class="w-full mt-6 bg-[#0B0B0B] hover:bg-black text-[#F7F5F0] py-3.5 font-editorial font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer">
        <span>ADD TO BAG</span>
        <span class="text-[#C7FF2E]">→</span>
      </button>
    </div>
  `;

  modal.classList.remove('hidden');

  let selectedSize = '';
  const sizeBtns = modal.querySelectorAll('.size-btn');
  const sizeLabel = modal.querySelector('#quick-add-size-label');
  const sizeContainer = modal.querySelector('#quick-add-sizes');

  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => {
        b.classList.remove('bg-[#0B0B0B]', 'text-[#F7F5F0]', 'border-[#0B0B0B]');
        b.classList.add('bg-white', 'text-[#0B0B0B]', 'border-[#0B0B0B]/30');
      });
      btn.classList.remove('bg-white', 'text-[#0B0B0B]', 'border-[#0B0B0B]/30');
      btn.classList.add('bg-[#0B0B0B]', 'text-[#F7F5F0]', 'border-[#0B0B0B]');
      selectedSize = extractSizeLabel(btn.getAttribute('data-size') || '');
      if (sizeLabel) {
        sizeLabel.textContent = selectedSize;
        sizeLabel.className = 'text-[#0B0B0B] font-bold';
      }
      if (sizeContainer) {
        sizeContainer.classList.remove('ring-2', 'ring-red-500', 'p-1', 'rounded');
      }
    });
  });

  const closeBtn = modal.querySelector('#close-quick-add');
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  const confirmBtn = modal.querySelector('#confirm-quick-add');
  confirmBtn.addEventListener('click', () => {
    if (!selectedSize) {
      if (sizeLabel) {
        sizeLabel.textContent = 'Please select a size';
        sizeLabel.className = 'text-red-600 font-bold animate-pulse';
      }
      if (sizeContainer) {
        sizeContainer.classList.add('ring-2', 'ring-red-500', 'p-1', 'rounded');
      }
      if (window.showToast) window.showToast('Please select a size before adding to bag');
      return;
    }
    const colorVal = Array.isArray(product.colors) && product.colors.length > 0 
      ? (typeof product.colors[0] === 'object' ? product.colors[0].name : product.colors[0])
      : 'Black';
    addToCart(product, selectedSize, colorVal, 1);
    modal.classList.add('hidden');
  });
};

// Announcement Bar Rotator
function initAnnouncementBar() {
  const messages = [
    `FREE SHIPPING ON ORDERS OVER ${formatPrice(FREE_SHIPPING_THRESHOLD)}`,
    "YOUNG & STUPID — NEW DROP ARCHIVE",
    "280-320 GSM HEAVYWEIGHT COMBED COTTON",
    "EASY 7-DAY RETURN & EXCHANGE"
  ];
  const bar = document.getElementById('announcement-text');
  if (!bar) return;

  let currentIdx = 0;
  setInterval(() => {
    bar.style.opacity = '0';
    bar.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      currentIdx = (currentIdx + 1) % messages.length;
      bar.textContent = messages[currentIdx];
      bar.style.transform = 'translateY(8px)';
      setTimeout(() => {
        bar.style.opacity = '1';
        bar.style.transform = 'translateY(0)';
      }, 50);
    }, 250);
  }, 4200);
}

// Sticky Navbar Scroll
function initNavbarScroll() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const handleScroll = () => {
    if (window.scrollY > 30) {
      nav.classList.add('bg-[#F7F5F0]/90', 'glass-nav', 'border-b', 'border-[#0B0B0B]/10', 'shadow-sm');
      nav.classList.remove('bg-transparent');
    } else {
      nav.classList.remove('bg-[#F7F5F0]/90', 'glass-nav', 'border-b', 'border-[#0B0B0B]/10', 'shadow-sm');
      nav.classList.add('bg-transparent');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

// Live Search Overlay Modal querying real Firestore products
function initSearchModal() {
  const searchTriggers = document.querySelectorAll('.search-trigger-btn');
  const searchModal = document.getElementById('search-overlay');
  const searchClose = document.getElementById('search-overlay-close');
  const searchInput = document.getElementById('search-input-field');
  const searchResults = document.getElementById('search-results-container');

  if (!searchModal || !searchInput) return;

  const openSearch = () => {
    searchModal.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 100);
    document.body.classList.add('overflow-hidden');
  };

  const closeSearch = () => {
    searchModal.classList.add('hidden');
    searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';
    document.body.classList.remove('overflow-hidden');
  };

  searchTriggers.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openSearch();
  }));

  if (searchClose) searchClose.addEventListener('click', closeSearch);
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearch();
  });

  searchInput.addEventListener('input', async (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!searchResults) return;

    if (q.length === 0) {
      searchResults.innerHTML = `
        <div class="p-6 text-center text-[#6B6B6B] text-xs uppercase tracking-wider">
          Type to search real store drops, oversized tees, acid wash, minimal cuts...
        </div>
      `;
      return;
    }

    // Query real products from Firestore
    const products = await getAllProducts();

    if (!products || products.length === 0) {
      searchResults.innerHTML = `
        <div class="p-8 text-center text-[#6B6B6B] text-xs uppercase tracking-wider">
          No products available yet in store.
        </div>
      `;
      return;
    }

    const matches = products.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );

    if (matches.length === 0) {
      searchResults.innerHTML = `
        <div class="p-8 text-center text-[#6B6B6B]">
          <p class="font-editorial text-sm font-bold uppercase">No drops matching "${q}"</p>
          <a href="/products.html" class="inline-block mt-3 text-xs underline font-semibold text-[#0B0B0B]">Browse all products →</a>
        </div>
      `;
      return;
    }

    searchResults.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4 max-h-[60vh] overflow-y-auto">
        ${matches.map(p => {
          const img = extractProductImageUrl(Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.thumbnail || p.image || ''));
          return `
            <a href="/product-details.html?id=${p.id}" class="flex gap-3 p-2 bg-white border border-[#E8E6E1] hover:border-[#0B0B0B] transition-colors group">
              <div class="w-16 h-20 bg-[#E8E6E1] overflow-hidden shrink-0 flex items-center justify-center relative">
                ${img ? `
                  <img src="${img}" class="w-full h-full object-cover" alt="${p.name}" onerror="this.style.display='none'; this.nextElementSibling?.classList.remove('hidden');" />
                  <div class="hidden w-full h-full flex items-center justify-center bg-[#E8E6E1] text-[#6B6B6B]">
                    <i class="fa-solid fa-shirt text-[#6B6B6B]"></i>
                  </div>
                ` : `<i class="fa-solid fa-shirt text-[#6B6B6B]"></i>`}
              </div>
              <div class="flex-1 min-w-0 flex flex-col justify-center">
                <span class="text-[10px] text-[#6B6B6B] uppercase font-bold tracking-wider">${p.category}</span>
                <h4 class="font-editorial text-xs font-bold text-[#0B0B0B] truncate group-hover:underline uppercase">${p.name}</h4>
                <span class="font-editorial text-xs font-bold mt-1 text-[#0B0B0B]">${formatPrice(p.price)}</span>
              </div>
            </a>
          `;
        }).join('')}
      </div>
    `;
  });
}

// Global Newsletter / Lead Generation Handler saving to Firestore `leads`
function initNewsletter() {
  const forms = document.querySelectorAll('.newsletter-form');
  forms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const submitBtn = form.querySelector('button[type="submit"]');
      const successMsg = form.parentElement.querySelector('.newsletter-success-msg');

      if (!input || !input.value) return;
      const email = input.value.trim();

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'CONNECTING...';
      }

      await saveLeadToFirestore({
        email,
        name: '',
        source: 'newsletter_footer',
        page: window.location.pathname,
        marketingConsent: true
      });

      if (form) form.classList.add('hidden');
      if (successMsg) {
        successMsg.classList.remove('hidden');
      }

      if (window.showToast) {
        window.showToast("You're on the list. Welcome to YOUNG & STUPID.");
      }
    });
  });
}

// Mobile Menu
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const menu = document.getElementById('mobile-menu');
  const closeBtn = document.getElementById('mobile-menu-close');

  if (!toggleBtn || !menu) return;

  const openMenu = () => {
    menu.classList.remove('translate-x-full');
    document.body.classList.add('overflow-hidden');
  };

  const closeMenu = () => {
    menu.classList.add('translate-x-full');
    document.body.classList.remove('overflow-hidden');
  };

  toggleBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
}

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
  initAnnouncementBar();
  initNavbarScroll();
  initSearchModal();
  initNewsletter();
  initMobileMenu();
  initAuth();

  updateCartBadges();
  updateWishlistBadges();
  renderCartDrawer();
  updateWishlistUI();

  document.querySelectorAll('.cart-drawer-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      renderCartDrawer();
      openCartDrawer();
    });
  });

  const cartCloseBtn = document.getElementById('cart-drawer-close');
  if (cartCloseBtn) {
    cartCloseBtn.addEventListener('click', closeCartDrawer);
  }

  const backdrop = document.getElementById('cart-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeCartDrawer);
  }

  document.addEventListener('click', async (e) => {
    const quickAddBtn = e.target.closest('[data-quick-add-id]');
    if (quickAddBtn) {
      e.preventDefault();
      const pId = quickAddBtn.getAttribute('data-quick-add-id');
      window.openQuickAddModal(pId);
    }

    const wishlistBtn = e.target.closest('[data-wishlist-id]');
    if (wishlistBtn) {
      e.preventDefault();
      const pId = wishlistBtn.getAttribute('data-wishlist-id');
      const product = await getProductById(pId);
      if (product) {
        await toggleWishlist(product);
      }
    }
  });
});
