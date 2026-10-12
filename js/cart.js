// Cart management and sliding drawer controller for YOUNG & STUPID
import { auth, db, handleFirestoreError, OperationType, verifyCartItemsFromFirestore, extractProductImageUrl, extractSizeLabel } from './firebase-init.js';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { 
  getSavedCouponCode, 
  validateCoupon, 
  calculateOrderTotals, 
  saveCouponCode, 
  removeSavedCouponCode 
} from './offers.js';

const CART_STORAGE_KEY = 'young_stupid_cart';
export const FREE_SHIPPING_THRESHOLD = 75.00;

export function formatPrice(amount) {
  const num = Number(amount) || 0;
  return `$${num.toFixed(2)}`;
}

export function getCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveCart(cart) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartBadges();
    syncCartToFirestore(cart);
  } catch (e) {
    console.error('Failed to save cart:', e);
  }
}

async function syncCartToFirestore(cart) {
  if (auth?.currentUser) {
    try {
      const userCartRef = doc(db, 'users', auth.currentUser.uid, 'cart', 'current');
      await setDoc(userCartRef, { items: cart, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser.uid}/cart/current`);
    }
  }
}

export async function syncCartFromFirestore() {
  if (auth?.currentUser) {
    try {
      const userCartRef = doc(db, 'users', auth.currentUser.uid, 'cart', 'current');
      const snap = await getDoc(userCartRef);
      if (snap.exists() && Array.isArray(snap.data().items)) {
        const cloudItems = snap.data().items;
        if (cloudItems.length > 0) {
          saveCart(cloudItems);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${auth.currentUser.uid}/cart/current`);
    }
  }
}

export function addToCart(product, size = '', color = null, quantity = 1, customImage = null) {
  const cleanSize = extractSizeLabel(size);
  const requiresSize = (Array.isArray(product.sizes) && product.sizes.length > 0) || 
                       (Array.isArray(product.sizeLabels) && product.sizeLabels.length > 0);

  if (requiresSize && !cleanSize) {
    if (window.showToast) {
      window.showToast('Please select a size before adding to bag');
    }
    return false;
  }

  const finalSize = cleanSize || (requiresSize ? 'L' : 'One Size');
  const cart = getCart();
  const selectedColor = color || (Array.isArray(product.colors) && product.colors.length > 0 
    ? (typeof product.colors[0] === 'object' ? product.colors[0].name : product.colors[0]) 
    : 'Black');
  
  const existingIdx = cart.findIndex(
    item => (item.id === product.id || item.productId === product.id) && 
            (extractSizeLabel(item.size || item.selectedSize) === finalSize) && 
            (item.color === selectedColor || item.selectedColor === selectedColor)
  );

  const priceNum = Number(product.price) || 0;
  const originalPriceNum = product.compareAtPrice ? Number(product.compareAtPrice) : (product.originalPrice ? Number(product.originalPrice) : priceNum);
  const rawCandidate = customImage || (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : (product.thumbnail || product.image || ''));
  const imgUrl = extractProductImageUrl(rawCandidate);

  if (existingIdx > -1) {
    cart[existingIdx].quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      productId: product.id,
      name: product.name,
      productName: product.name,
      price: priceNum,
      compareAtPrice: originalPriceNum,
      size: finalSize,
      selectedSize: finalSize,
      color: selectedColor,
      selectedColor: selectedColor,
      image: imgUrl,
      productImage: imgUrl,
      quantity: quantity,
      category: product.category || ''
    });
  }

  saveCart(cart);
  renderCartDrawer();
  openCartDrawer();
  
  if (window.showToast) {
    window.showToast(`Added to your bag (${selectedColor} • ${finalSize})`);
  }
  return true;
}

export function updateQuantity(index, delta) {
  const cart = getCart();
  if (!cart[index]) return;

  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCart(cart);
  renderCartDrawer();
  if (typeof window.renderCartPage === 'function') {
    window.renderCartPage();
  }
}

export function removeFromCart(index) {
  const cart = getCart();
  if (!cart[index]) return;
  cart.splice(index, 1);
  saveCart(cart);
  renderCartDrawer();
  if (typeof window.renderCartPage === 'function') {
    window.renderCartPage();
  }
  if (window.showToast) {
    window.showToast(`Removed from bag`);
  }
}

export function getCartTotal() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
}

export function getCartCount() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function updateCartBadges() {
  const count = getCartCount();
  const badges = document.querySelectorAll('.cart-count-badge');
  badges.forEach(b => {
    b.textContent = count;
    if (count > 0) {
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }
  });
}

// Drawer animations
export function openCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-backdrop');
  if (drawer && backdrop) {
    backdrop.classList.remove('hidden');
    setTimeout(() => {
      backdrop.classList.remove('opacity-0');
      backdrop.classList.add('opacity-100');
      drawer.classList.remove('translate-x-full');
      drawer.classList.add('translate-x-0');
    }, 10);
    document.body.classList.add('overflow-hidden');
  }
}

export function closeCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-backdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('translate-x-0');
    drawer.classList.add('translate-x-full');
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    setTimeout(() => {
      backdrop.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }, 350);
  }
}

export function renderCartDrawer() {
  const container = document.getElementById('cart-drawer-items');
  const subtotalEl = document.getElementById('cart-drawer-subtotal');
  const shippingMsgEl = document.getElementById('free-shipping-msg');
  const shippingBarEl = document.getElementById('free-shipping-progress');
  const checkoutBtn = document.getElementById('cart-drawer-checkout-btn');
  const emptyState = document.getElementById('cart-drawer-empty');

  if (!container) return;

  const cart = getCart();
  const subtotal = getCartTotal();

  if (cart.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    if (subtotalEl) subtotalEl.textContent = formatPrice(0);
    if (checkoutBtn) checkoutBtn.classList.add('opacity-50', 'pointer-events-none');
    
    if (shippingMsgEl) {
      shippingMsgEl.innerHTML = `Add items worth <strong>${formatPrice(FREE_SHIPPING_THRESHOLD)}</strong> for Free Express Delivery`;
    }
    if (shippingBarEl) {
      shippingBarEl.style.width = '0%';
    }
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (checkoutBtn) checkoutBtn.classList.remove('opacity-50', 'pointer-events-none');

  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

  // Free shipping progress logic (USD)
  const diff = FREE_SHIPPING_THRESHOLD - subtotal;
  const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  if (diff <= 0) {
    if (shippingMsgEl) {
      shippingMsgEl.innerHTML = `<span class="text-[#0B0B0B] font-bold tracking-wider">🎉 CONGRATS! YOU UNLOCKED FREE US EXPRESS SHIPPING</span>`;
    }
    if (shippingBarEl) {
      shippingBarEl.style.width = '100%';
      shippingBarEl.classList.remove('bg-[#0B0B0B]');
      shippingBarEl.classList.add('bg-[#C7FF2E]');
    }
  } else {
    if (shippingMsgEl) {
      shippingMsgEl.innerHTML = `Add <strong class="text-[#0B0B0B]">${formatPrice(diff)}</strong> more for <strong>FREE EXPRESS SHIPPING</strong>`;
    }
    if (shippingBarEl) {
      shippingBarEl.style.width = `${pct}%`;
      shippingBarEl.classList.add('bg-[#0B0B0B]');
      shippingBarEl.classList.remove('bg-[#C7FF2E]');
    }
  }

  // Render line items
  container.innerHTML = cart.map((item, idx) => {
    const itemImg = extractProductImageUrl(item.image || item.productImage || item.thumbnail);
    return `
    <div class="flex gap-4 py-4 border-b border-[#E8E6E1] items-start animate-fade-up">
      <div class="w-20 h-24 bg-[#E8E6E1] shrink-0 border border-[#0B0B0B]/10 overflow-hidden flex items-center justify-center relative">
        ${itemImg ? `
          <img src="${itemImg}" alt="${item.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling?.classList.remove('hidden');" />
          <div class="hidden w-full h-full flex items-center justify-center bg-[#E8E6E1] text-[#6B6B6B]">
            <i class="fa-solid fa-shirt text-[#6B6B6B]"></i>
          </div>
        ` : `<i class="fa-solid fa-shirt text-[#6B6B6B]"></i>`}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-start gap-2">
          <h4 class="font-editorial text-xs font-bold uppercase tracking-tight text-[#0B0B0B] truncate">${item.name}</h4>
          <button data-remove-idx="${idx}" class="text-[#6B6B6B] hover:text-[#0B0B0B] p-1 text-xs transition-colors" title="Remove item">
            ✕
          </button>
        </div>
        <div class="text-[11px] text-[#6B6B6B] mt-1 space-x-2">
          <span>Size: <strong class="text-[#0B0B0B]">${extractSizeLabel(item.selectedSize || item.size) || 'Standard'}</strong></span>
          <span>•</span>
          <span>Color: <strong class="text-[#0B0B0B]">${item.selectedColor || item.color}</strong></span>
        </div>
        <div class="flex justify-between items-center mt-3">
          <div class="inline-flex items-center border border-[#0B0B0B] bg-white">
            <button data-qty-delta="-1" data-idx="${idx}" class="w-6 h-6 flex items-center justify-center text-xs hover:bg-[#F7F5F0] text-[#0B0B0B]">-</button>
            <span class="w-8 text-center text-xs font-bold text-[#0B0B0B]">${item.quantity}</span>
            <button data-qty-delta="1" data-idx="${idx}" class="w-6 h-6 flex items-center justify-center text-xs hover:bg-[#F7F5F0] text-[#0B0B0B]">+</button>
          </div>
          <div class="text-right">
            <span class="font-editorial font-bold text-sm text-[#0B0B0B]">${formatPrice(Number(item.price) * item.quantity)}</span>
          </div>
        </div>
      </div>
    </div>
    `;
  }).join('');

  container.querySelectorAll('[data-qty-delta]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      const delta = parseInt(btn.getAttribute('data-qty-delta'));
      updateQuantity(idx, delta);
    });
  });

  container.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-remove-idx'));
      removeFromCart(idx);
    });
  });
}
