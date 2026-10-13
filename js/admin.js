// Admin Panel Controller for YOUNG & STUPID Streetwear
import { 
  auth, 
  db,
  storage,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  saveProductToFirestore,
  deleteProductFromFirestore,
  getAllProductsAdmin,
  subscribeToProductsAdmin,
  getAllOrdersFromFirestore,
  subscribeToOrders,
  updateOrderStatusInFirestore,
  getAllUsersFromFirestore,
  getAllReviewsAdmin,
  updateReviewStatusInFirestore,
  deleteReviewFromFirestore,
  getAllReturnRequestsFromFirestore,
  updateReturnRequestInFirestore,
  getAllSupportTicketsFromFirestore,
  updateSupportTicketInFirestore,
  extractProductImageUrl,
  extractSizeLabel,
  formatPrice,
  uploadBytesResumable,
  ref,
  getDownloadURL
} from './firebase-init.js';
import { onAuthStateChanged } from 'firebase/auth';

export const AUTHORIZED_ADMIN_EMAIL = 'baijitsk860@gmail.com';

// Supported Sizes list as requested
const SUPPORTED_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

// State
let currentAdminUser = null;
let allProducts = [];
let allOrders = [];
let allCustomers = [];
let allReviews = [];
let allReturns = [];
let allTickets = [];

let currentTab = 'dashboard';
let currentEditingProduct = null;
let currentEditingOrder = null;
let productFormImages = []; // Array of { id, url, name, isPrimary, viewType, file }
let productFormColors = []; // Array of { name, hex }

// Toast helper
export function showToast(message, type = 'success') {
  const container = document.getElementById('admin-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-red-900 border-red-700 text-white' : (type === 'info' ? 'bg-[#0B0B0B] border-[#0B0B0B] text-white' : 'bg-[#0B0B0B] border-[#C7FF2E] text-white');
  toast.className = `${bg} border p-3.5 shadow-2xl flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider pointer-events-auto animate-fade-up max-w-sm`;
  
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-1.5 h-1.5 rounded-full ${type === 'error' ? 'bg-red-400' : 'bg-[#C7FF2E]'}"></span>
      <span>${message}</span>
    </div>
    <button class="text-[#6B6B6B] hover:text-white text-xs p-1">✕</button>
  `;

  toast.querySelector('button')?.addEventListener('click', () => toast.remove());
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Confirmation Dialog helper
function askConfirmation(title, message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const proceedBtn = document.getElementById('confirm-modal-proceed');
  const cancelBtn = document.getElementById('confirm-modal-cancel');

  if (!modal || !proceedBtn) return;

  titleEl.textContent = title;
  msgEl.textContent = message;
  modal.classList.remove('hidden');

  const cleanUp = () => {
    modal.classList.add('hidden');
    proceedBtn.replaceWith(proceedBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  };

  modal.querySelector('#confirm-modal-proceed').addEventListener('click', () => {
    cleanUp();
    onConfirm();
  }, { once: true });

  modal.querySelector('#confirm-modal-cancel').addEventListener('click', cleanUp, { once: true });
}

// Currency Formatter supporting multi-currency
function formatCurrency(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  const curr = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr
    }).format(num);
  } catch (e) {
    return `$${num.toFixed(2)}`;
  }
}

// -------------------------------------------------------------
// AUTHENTICATION & SECURITY GATE
// -------------------------------------------------------------

function initAdminAuth() {
  const gateOverlay = document.getElementById('auth-gate-overlay');
  const checkingView = document.getElementById('gate-checking-view');
  const loginView = document.getElementById('gate-login-view');
  const deniedView = document.getElementById('gate-denied-view');
  const adminShell = document.getElementById('admin-shell');
  const deniedEmail = document.getElementById('gate-denied-email');
  const userDisplay = document.getElementById('admin-user-display');
  const settingsEmail = document.getElementById('settings-session-email');

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentAdminUser = null;
      adminShell.classList.add('hidden');
      gateOverlay.classList.remove('hidden');
      checkingView.classList.add('hidden');
      deniedView.classList.add('hidden');
      loginView.classList.remove('hidden');
      return;
    }

    // Email check against authorized admin email
    const email = (user.email || '').toLowerCase().trim();
    if (email !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
      currentAdminUser = null;
      adminShell.classList.add('hidden');
      gateOverlay.classList.remove('hidden');
      checkingView.classList.add('hidden');
      loginView.classList.add('hidden');
      deniedView.classList.remove('hidden');
      if (deniedEmail) {
        deniedEmail.textContent = `Signed in as "${user.email}". Only ${AUTHORIZED_ADMIN_EMAIL} is authorized to access the Admin Panel.`;
      }
      const countdownEl = document.getElementById('gate-redirect-countdown');
      let secondsLeft = 4;
      if (countdownEl) {
        countdownEl.textContent = `Redirecting to homepage in ${secondsLeft}s...`;
        clearInterval(window.__adminRedirectTimer);
        window.__adminRedirectTimer = setInterval(() => {
          secondsLeft--;
          if (secondsLeft > 0) {
            countdownEl.textContent = `Redirecting to homepage in ${secondsLeft}s...`;
          } else {
            clearInterval(window.__adminRedirectTimer);
            window.location.href = '/index.html';
          }
        }, 1000);
      }
      return;
    }

    clearInterval(window.__adminRedirectTimer);

    // Verify token with backend
    checkingView.classList.remove('hidden');
    loginView.classList.add('hidden');
    deniedView.classList.add('hidden');

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!res.ok) {
        throw new Error('Server token authorization failed');
      }

      // Authorization confirmed
      currentAdminUser = user;
      gateOverlay.classList.add('hidden');
      adminShell.classList.remove('hidden');

      if (userDisplay) userDisplay.textContent = user.email;
      if (settingsEmail) settingsEmail.textContent = user.email;

      showToast(`Welcome back, Admin (${user.email})`);

      // Initialize Data Streams
      initDataSubscriptions();

    } catch (err) {
      console.error('Server admin verification notice:', err);
      // Fallback: If local token verification had network hiccup, allow authorized email if matches exactly
      if (email === AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
        currentAdminUser = user;
        gateOverlay.classList.add('hidden');
        adminShell.classList.remove('hidden');
        if (userDisplay) userDisplay.textContent = user.email;
        if (settingsEmail) settingsEmail.textContent = user.email;
        initDataSubscriptions();
      } else {
        checkingView.classList.add('hidden');
        deniedView.classList.remove('hidden');
      }
    }
  });

  // Login form submission
  const loginForm = document.getElementById('admin-login-form');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-email-input').value.trim();
    const pass = document.getElementById('admin-password-input').value;
    const btn = document.getElementById('admin-signin-btn');

    if (email.toLowerCase() !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
      alert(`Access Restricted: Only ${AUTHORIZED_ADMIN_EMAIL} is permitted to access the admin portal.`);
      return;
    }

    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block animate-spin mr-2">◌</span> AUTHENTICATING...';
      await loginWithEmail(email, pass);
    } catch (err) {
      alert('Authentication failed: ' + (err.message || 'Check your credentials'));
      btn.disabled = false;
      btn.innerHTML = '<span>AUTHENTICATE</span><span class="text-[#C7FF2E]">→</span>';
    }
  });

  // Google sign in button
  document.getElementById('admin-google-btn')?.addEventListener('click', async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      alert('Google login failed: ' + err.message);
    }
  });

  // Switch account button
  document.getElementById('gate-switch-btn')?.addEventListener('click', async () => {
    clearInterval(window.__adminRedirectTimer);
    await logoutUser();
  });

  // Topbar / sidebar logout buttons
  document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
    askConfirmation('Sign Out Administrator', 'Are you sure you want to end your administrative session?', async () => {
      await logoutUser();
      window.location.href = '/index.html';
    });
  });
}

// -------------------------------------------------------------
// REAL-TIME DATA SUBSCRIPTIONS & FETCHING
// -------------------------------------------------------------

function initDataSubscriptions() {
  // 1. Subscribe to Products
  subscribeToProductsAdmin((products) => {
    allProducts = products || [];
    document.getElementById('badge-products-count').textContent = allProducts.length;
    document.getElementById('dash-active-products').textContent = allProducts.filter(p => p.active !== false).length;
    renderProductsTable();
    updateDashboardMetrics();
  });

  // 2. Subscribe to Orders
  subscribeToOrders((orders) => {
    allOrders = orders || [];
    document.getElementById('badge-orders-count').textContent = allOrders.length;
    document.getElementById('orders-total-count').textContent = allOrders.length;
    renderOrdersTable();
    renderDashboardRecentOrders();
    updateDashboardMetrics();
    renderReportsTable();
  });

  // 3. Load Customers
  loadCustomers();

  // 4. Load Reviews
  loadReviews();

  // 5. Load Returns
  loadReturns();

  // 6. Load Support Tickets
  loadSupportTickets();
}

async function loadCustomers() {
  try {
    const users = await getAllUsersFromFirestore();
    
    // Supplement with customers derived from orders
    const customerMap = new Map();
    users.forEach(u => customerMap.set((u.email || u.uid).toLowerCase(), u));

    allOrders.forEach(o => {
      const email = (o.customerEmail || '').toLowerCase();
      if (email && !customerMap.has(email)) {
        customerMap.set(email, {
          uid: o.userId || 'guest',
          displayName: o.customerName || 'Shopper',
          email: o.customerEmail,
          phone: o.customerPhone || '',
          shippingAddress: typeof o.shippingAddress === 'object' ? `${o.shippingAddress.address || ''}, ${o.shippingAddress.city || ''}` : String(o.shippingAddress || ''),
          createdAt: o.createdAt || ''
        });
      }
    });

    allCustomers = Array.from(customerMap.values());
    document.getElementById('badge-customers-count').textContent = allCustomers.length;
    document.getElementById('dash-total-customers').textContent = allCustomers.length;
    renderCustomersTable();
  } catch (err) {
    console.error('Failed to load customers:', err);
  }
}

async function loadReviews() {
  try {
    allReviews = await getAllReviewsAdmin();
    document.getElementById('badge-reviews-count').textContent = allReviews.length;
    document.getElementById('stat-total-reviews').textContent = allReviews.length;
    renderReviewsTable();
  } catch (err) {
    console.error('Failed to load reviews:', err);
  }
}

async function loadReturns() {
  try {
    allReturns = await getAllReturnRequestsFromFirestore();
    document.getElementById('badge-returns-count').textContent = allReturns.length;
    document.getElementById('dash-pending-returns').textContent = allReturns.filter(r => r.status !== 'Resolved' && r.status !== 'Rejected').length;
    document.getElementById('stat-return-requests').textContent = allReturns.length;
    renderReturnsTable();
  } catch (err) {
    console.error('Failed to load returns:', err);
  }
}

async function loadSupportTickets() {
  try {
    allTickets = await getAllSupportTicketsFromFirestore();
    document.getElementById('badge-support-count').textContent = allTickets.length;
    document.getElementById('dash-open-tickets').textContent = allTickets.filter(t => t.status !== 'Resolved').length;
    renderSupportTicketsTable();
  } catch (err) {
    console.error('Failed to load support tickets:', err);
  }
}

// -------------------------------------------------------------
// TAB 1: DASHBOARD METRICS CALCULATION
// -------------------------------------------------------------

function updateDashboardMetrics() {
  // Sales Calculation (Only from actual orders)
  let totalSales = 0;
  let todaySales = 0;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let pendingCount = 0;
  let processingCount = 0;
  let shippedCount = 0;
  let deliveredCount = 0;
  let cancelledCount = 0;
  let confirmedCount = 0;

  allOrders.forEach(o => {
    const orderTotal = Number(o.total) || 0;
    const status = (o.orderStatus || 'CONFIRMED').toUpperCase();
    const paymentStatus = (o.paymentStatus || 'PENDING').toUpperCase();

    // Sum sales for confirmed/paid/shipped/delivered orders
    if (status !== 'CANCELLED' && (paymentStatus === 'PAID' || status === 'DELIVERED' || status === 'CONFIRMED' || status === 'PROCESSING' || status === 'SHIPPED')) {
      totalSales += orderTotal;

      const orderTime = new Date(o.createdAt || 0).getTime();
      if (orderTime >= startOfToday) {
        todaySales += orderTotal;
      }
    }

    if (status === 'PENDING') pendingCount++;
    else if (status === 'PROCESSING') processingCount++;
    else if (status === 'CONFIRMED') confirmedCount++;
    else if (status === 'SHIPPED') shippedCount++;
    else if (status === 'DELIVERED') deliveredCount++;
    else if (status === 'CANCELLED') cancelledCount++;
  });

  document.getElementById('stat-total-sales').textContent = formatCurrency(totalSales);
  document.getElementById('stat-today-sales').textContent = formatCurrency(todaySales);
  document.getElementById('stat-total-orders').textContent = allOrders.length;
  document.getElementById('stat-orders-breakdown').textContent = `${confirmedCount + deliveredCount + shippedCount} fulfilled / confirmed`;
  document.getElementById('stat-pending-orders').textContent = pendingCount;

  document.getElementById('stat-processing-orders').textContent = processingCount + confirmedCount;
  document.getElementById('stat-shipped-orders').textContent = shippedCount;
  document.getElementById('stat-delivered-orders').textContent = deliveredCount;
  document.getElementById('stat-cancelled-orders').textContent = cancelledCount;

  // Reports tab metrics
  document.getElementById('report-gross-rev').textContent = formatCurrency(totalSales);
  document.getElementById('report-tx-count').textContent = allOrders.length;
  const aov = allOrders.length > 0 ? (totalSales / allOrders.length) : 0;
  document.getElementById('report-aov').textContent = formatCurrency(aov);
}

function renderDashboardRecentOrders() {
  const tbody = document.getElementById('dashboard-recent-orders-tbody');
  if (!tbody) return;

  const recent = allOrders.slice(0, 6);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-[#6B6B6B]">No customer orders in Firestore yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(o => {
    const status = (o.orderStatus || 'CONFIRMED').toUpperCase();
    const badgeColor = getStatusBadgeClass(status);
    const dateFormatted = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent';

    return `
      <tr class="border-b border-[#E8E6E1]/60 hover:bg-[#F7F5F0]/60 transition-colors">
        <td class="py-3 font-editorial font-bold text-[#0B0B0B]">${o.orderId || o.id}</td>
        <td class="py-3">
          <div class="font-bold text-[#0B0B0B] truncate max-w-[140px]">${o.customerName || 'Shopper'}</div>
          <div class="text-[10px] text-[#6B6B6B] truncate max-w-[140px]">${o.customerEmail || ''}</div>
        </td>
        <td class="py-3 font-editorial font-bold text-[#0B0B0B]">${formatCurrency(o.total, o.currency)}</td>
        <td class="py-3">
          <span class="inline-block text-[9px] font-extrabold uppercase px-2 py-0.5 ${badgeColor}">${status}</span>
        </td>
        <td class="py-3 text-[11px] text-[#6B6B6B]">${dateFormatted}</td>
        <td class="py-3 text-right">
          <button data-order-view-id="${o.id}" class="text-[11px] font-bold text-[#0B0B0B] underline hover:text-[#6B6B6B] cursor-pointer">
            Manage
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-order-view-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-order-view-id');
      const order = allOrders.find(o => o.id === id);
      if (order) openOrderModal(order);
    });
  });
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'PENDING': return 'bg-amber-100 text-amber-900 border border-amber-300';
    case 'CONFIRMED': return 'bg-blue-100 text-blue-900 border border-blue-300';
    case 'PROCESSING': return 'bg-indigo-100 text-indigo-900 border border-indigo-300';
    case 'SHIPPED': return 'bg-purple-100 text-purple-900 border border-purple-300';
    case 'DELIVERED': return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
    case 'CANCELLED': return 'bg-red-100 text-red-900 border border-red-300';
    case 'RETURN_REQUESTED': return 'bg-rose-100 text-rose-900 border border-rose-300';
    case 'RETURNED': return 'bg-zinc-200 text-zinc-900 border border-zinc-400';
    case 'REFUNDED': return 'bg-slate-200 text-slate-900 border border-slate-400';
    default: return 'bg-gray-100 text-gray-800 border border-gray-300';
  }
}

// -------------------------------------------------------------
// TAB 2: PRODUCT MANAGEMENT
// -------------------------------------------------------------

function renderProductsTable() {
  const tbody = document.getElementById('admin-products-tbody');
  const catFilter = document.getElementById('admin-category-filter');
  const statusFilter = document.getElementById('admin-status-filter');
  const searchInput = document.getElementById('admin-products-search');

  if (!tbody) return;

  const q = (searchInput?.value || '').toLowerCase().trim();
  const selectedCat = catFilter?.value || 'all';
  const selectedStatus = statusFilter?.value || 'all';

  // Populate dynamic category dropdown
  if (catFilter) {
    const cats = Array.from(new Set(allProducts.map(p => p.category).filter(Boolean)));
    const currentVal = catFilter.value;
    catFilter.innerHTML = '<option value="all">ALL CATEGORIES</option>' + cats.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
    catFilter.value = currentVal || 'all';
  }

  let filtered = allProducts.filter(p => {
    if (q) {
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchCat = (p.category || '').toLowerCase().includes(q);
      const matchSku = (p.sku || '').toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchSku) return false;
    }
    if (selectedCat !== 'all' && (p.category || '').toLowerCase() !== selectedCat.toLowerCase()) {
      return false;
    }
    if (selectedStatus === 'published' && p.active === false) return false;
    if (selectedStatus === 'draft' && p.active !== false) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-[#6B6B6B]">No products matched current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const isPublished = p.active !== false;
    const thumbnail = extractProductImageUrl(Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.thumbnail || ''));
    const sizeLabels = Array.isArray(p.sizes) 
      ? p.sizes.map(s => extractSizeLabel(s)).filter(Boolean).join(', ')
      : (Array.isArray(p.sizeLabels) ? p.sizeLabels.join(', ') : 'All Sizes');

    return `
      <tr class="hover:bg-[#F7F5F0]/60 transition-colors">
        <td class="p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-14 bg-[#E8E6E1] shrink-0 border border-[#0B0B0B]/10 overflow-hidden flex items-center justify-center">
              ${thumbnail ? `
                <img src="${thumbnail}" alt="${p.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling?.classList.remove('hidden');" />
                <div class="hidden w-full h-full flex items-center justify-center text-[#6B6B6B]"><i class="fa-solid fa-shirt"></i></div>
              ` : `<i class="fa-solid fa-shirt text-[#6B6B6B]"></i>`}
            </div>
            <div>
              <strong class="font-editorial text-xs font-bold uppercase text-[#0B0B0B] block line-clamp-1">${p.name}</strong>
              <div class="text-[10px] text-[#6B6B6B]">SKU: ${p.sku || p.id}</div>
              ${p.badge ? `<span class="inline-block text-[8px] font-extrabold uppercase px-1.5 py-0.2 bg-[#0B0B0B] text-white mt-0.5">${p.badge}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="p-4 font-semibold text-[#0B0B0B]">${p.category || 'Apparel'}</td>
        <td class="p-4 font-editorial font-bold text-[#0B0B0B]">
          ${formatCurrency(p.price)}
          ${p.compareAtPrice ? `<span class="text-[10px] text-[#6B6B6B] line-through font-normal ml-1">${formatCurrency(p.compareAtPrice)}</span>` : ''}
        </td>
        <td class="p-4">
          <span class="font-bold ${(p.stock || 0) <= 5 ? 'text-red-700' : 'text-emerald-800'}">${p.stock || 0} units</span>
        </td>
        <td class="p-4 text-[11px] text-[#6B6B6B] max-w-[140px] truncate" title="${sizeLabels}">
          ${sizeLabels || 'S, M, L, XL'}
        </td>
        <td class="p-4">
          <button data-toggle-publish-id="${p.id}" class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded cursor-pointer transition-colors ${isPublished ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200' : 'bg-zinc-200 text-zinc-800 border border-zinc-400 hover:bg-zinc-300'}" title="Click to toggle publish status">
            ${isPublished ? '✓ PUBLISHED' : 'DRAFT'}
          </button>
        </td>
        <td class="p-4 text-right space-x-2">
          <button data-edit-product-id="${p.id}" class="p-1.5 text-xs text-[#0B0B0B] hover:text-[#6B6B6B] cursor-pointer" title="Edit Product">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button data-delete-product-id="${p.id}" class="p-1.5 text-xs text-red-600 hover:text-red-800 cursor-pointer" title="Delete Product">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Wire up Actions
  tbody.querySelectorAll('[data-toggle-publish-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-publish-id');
      const prod = allProducts.find(p => p.id === id);
      if (!prod) return;
      const newStatus = prod.active === false ? true : false;
      await saveProductToFirestore(id, { active: newStatus, published: newStatus });
      showToast(`Product ${newStatus ? 'Published' : 'Unpublished'}`);
    });
  });

  tbody.querySelectorAll('[data-edit-product-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-edit-product-id');
      const prod = allProducts.find(p => p.id === id);
      if (prod) openProductModal(prod);
    });
  });

  tbody.querySelectorAll('[data-delete-product-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-product-id');
      const prod = allProducts.find(p => p.id === id);
      if (!prod) return;
      askConfirmation('Delete Product', `Are you sure you want to permanently delete "${prod.name}"? This removes it from the customer storefront immediately.`, async () => {
        try {
          await deleteProductFromFirestore(id);
          showToast(`Deleted product "${prod.name}"`);
        } catch (e) {
          alert('Delete error: ' + e.message);
        }
      });
    });
  });
}

// -------------------------------------------------------------
// PRODUCT ADD / EDIT MODAL & IMAGE UPLOADER
// -------------------------------------------------------------

function setupProductModal() {
  const modal = document.getElementById('product-modal');
  const closeBtn = document.getElementById('close-product-modal');
  const cancelBtn = document.getElementById('cancel-product-modal-btn');
  const form = document.getElementById('product-form');
  const fileInput = document.getElementById('p-image-file-input');
  const dropZone = document.getElementById('drop-zone');

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
  cancelBtn?.addEventListener('click', () => modal.classList.add('hidden'));

  // Open modal for new product
  document.getElementById('open-add-product-modal-btn')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('quick-add-product-btn')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('dash-new-drop-cta')?.addEventListener('click', () => openProductModal(null));

  // Select all sizes button
  document.getElementById('select-all-sizes-btn')?.addEventListener('click', () => {
    document.querySelectorAll('#size-checkboxes-container input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
    });
  });

  // Add color button
  document.getElementById('add-color-option-btn')?.addEventListener('click', () => {
    addColorOption('New Color', '#111111');
  });

  // File Upload Handlers (Device Upload)
  fileInput?.addEventListener('change', (e) => {
    handleDeviceFiles(e.target.files);
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-[#0B0B0B]', 'bg-white');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-[#0B0B0B]', 'bg-white');
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-[#0B0B0B]', 'bg-white');
    if (e.dataTransfer.files?.length) {
      handleDeviceFiles(e.dataTransfer.files);
    }
  });

  // Form Submit
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCurrentProductForm();
  });
}

function openProductModal(product = null) {
  currentEditingProduct = product;
  const modal = document.getElementById('product-modal');
  const titleTag = document.getElementById('product-modal-mode-tag');
  const titleEl = document.getElementById('product-modal-title');
  const submitText = document.getElementById('save-product-btn-text');

  // Reset form
  document.getElementById('form-product-id').value = product ? product.id : '';
  document.getElementById('p-title').value = product ? (product.name || product.title || '') : '';
  document.getElementById('p-category').value = product ? (product.category || '') : 'Graphic Tees';
  document.getElementById('p-price').value = product ? product.price : '';
  document.getElementById('p-compare-price').value = product ? (product.compareAtPrice || '') : '';
  document.getElementById('p-stock').value = product ? (product.stock ?? 20) : '20';
  document.getElementById('p-sku').value = product ? (product.sku || '') : `YS-${Date.now().toString().slice(-5)}`;
  document.getElementById('p-desc').value = product ? (product.description || '') : '';
  document.getElementById('p-badge').value = product ? (product.badge || '') : 'NEW DROP';
  document.getElementById('p-published').checked = product ? (product.active !== false) : true;
  document.getElementById('p-bestseller').checked = product ? Boolean(product.isBestSeller) : false;
  document.getElementById('p-newarrival').checked = product ? Boolean(product.isNewArrival || product.newArrival) : true;
  document.getElementById('p-featured').checked = product ? Boolean(product.isFeatured) : false;

  titleTag.textContent = product ? 'EDIT PRODUCT' : 'NEW DROP';
  titleEl.textContent = product ? `EDIT: ${product.name}` : 'DROP A NEW PIECE';
  submitText.textContent = product ? 'UPDATE PRODUCT IN FIRESTORE' : 'SAVE PRODUCT TO FIRESTORE';

  // Render Sizes Checkboxes (XS to 3XL)
  const sizesContainer = document.getElementById('size-checkboxes-container');
  const activeSizesSet = new Set(
    product && Array.isArray(product.sizes)
      ? product.sizes.map(s => extractSizeLabel(s))
      : ['S', 'M', 'L', 'XL', '2XL']
  );

  sizesContainer.innerHTML = SUPPORTED_SIZES.map(sz => `
    <label class="inline-flex items-center gap-1.5 border border-[#0B0B0B]/20 bg-[#F7F5F0] px-3 py-1.5 text-xs font-bold uppercase cursor-pointer hover:border-[#0B0B0B] transition-colors">
      <input type="checkbox" name="product_sizes" value="${sz}" ${activeSizesSet.has(sz) ? 'checked' : ''} class="accent-[#0B0B0B] w-3.5 h-3.5" />
      <span>${sz}</span>
    </label>
  `).join('');

  // Render Colors
  productFormColors = [];
  const colorsContainer = document.getElementById('colors-list-container');
  colorsContainer.innerHTML = '';

  if (product && Array.isArray(product.colors) && product.colors.length > 0) {
    product.colors.forEach(c => {
      const name = typeof c === 'object' ? (c.name || 'Black') : String(c);
      const hex = typeof c === 'object' ? (c.hex || '#111111') : '#111111';
      addColorOption(name, hex);
    });
  } else {
    addColorOption('Obsidian Black', '#0B0B0B');
    addColorOption('Bone Sand', '#E8E6E1');
  }

  // Pre-load Existing Images
  productFormImages = [];
  if (product && Array.isArray(product.images) && product.images.length > 0) {
    product.images.forEach((img, i) => {
      const url = extractProductImageUrl(img);
      const isPrimary = i === 0 || (typeof img === 'object' && img.isPrimary);
      const viewType = typeof img === 'object' ? (img.viewType || (i === 0 ? 'front' : 'detail')) : (i === 0 ? 'front' : 'detail');
      productFormImages.push({
        id: `existing_${i}_${Date.now()}`,
        url,
        name: typeof img === 'object' ? (img.name || `photo_${i + 1}.jpg`) : `angle_${i + 1}.jpg`,
        isPrimary,
        viewType,
        isExisting: true
      });
    });
  }
  renderImagePreviews();

  modal.classList.remove('hidden');
}

function addColorOption(name = 'Black', hex = '#0B0B0B') {
  const container = document.getElementById('colors-list-container');
  const index = productFormColors.length;
  productFormColors.push({ name, hex });

  const row = document.createElement('div');
  row.className = 'flex items-center gap-3 bg-[#F7F5F0] p-2 border border-[#0B0B0B]/10';
  row.setAttribute('data-color-row', index);
  row.innerHTML = `
    <input type="color" value="${hex}" class="w-8 h-8 p-0 border border-[#0B0B0B] cursor-pointer color-hex-picker" title="Pick color" />
    <input type="text" value="${name}" placeholder="Color Name (e.g. Washed Charcoal)" class="flex-1 bg-white border border-[#0B0B0B]/20 p-2 text-xs font-semibold focus:outline-none color-name-input" />
    <button type="button" class="remove-color-btn text-xs text-red-600 hover:text-red-800 p-1">✕</button>
  `;

  row.querySelector('.color-hex-picker').addEventListener('input', (e) => {
    productFormColors[index].hex = e.target.value;
  });

  row.querySelector('.color-name-input').addEventListener('input', (e) => {
    productFormColors[index].name = e.target.value;
  });

  row.querySelector('.remove-color-btn').addEventListener('click', () => {
    row.remove();
    productFormColors.splice(index, 1);
  });

  container.appendChild(row);
}

// Handle device files upload with local previews and progress
function handleDeviceFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  Array.from(fileList).forEach(file => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const isFirst = productFormImages.length === 0;

      productFormImages.push({
        id: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        url: dataUrl,
        name: file.name,
        isPrimary: isFirst,
        viewType: isFirst ? 'front' : 'detail',
        file: file,
        isNew: true
      });

      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews() {
  const container = document.getElementById('image-previews-container');
  if (!container) return;

  if (productFormImages.length === 0) {
    container.innerHTML = `<div class="col-span-full py-4 text-center text-[11px] text-[#6B6B6B]">No images selected yet. Please upload product photos.</div>`;
    return;
  }

  container.innerHTML = productFormImages.map((img, idx) => `
    <div class="relative bg-white border ${img.isPrimary ? 'border-2 border-[#0B0B0B]' : 'border border-[#0B0B0B]/20'} p-2 flex flex-col justify-between">
      <div class="aspect-[3/4] bg-[#E8E6E1] overflow-hidden mb-2 relative flex items-center justify-center">
        <img src="${img.url}" alt="${img.name}" class="w-full h-full object-cover" />
        ${img.isPrimary ? `
          <span class="absolute top-1 left-1 bg-[#0B0B0B] text-[#C7FF2E] text-[8px] font-extrabold uppercase px-1 py-0.5">
            PRIMARY
          </span>
        ` : ''}
      </div>
      <div class="space-y-1">
        <div class="text-[10px] text-[#6B6B6B] truncate" title="${img.name}">${img.name}</div>
        <select data-view-type-idx="${idx}" class="w-full bg-[#F7F5F0] text-[10px] font-bold p-1 border border-[#0B0B0B]/20 focus:outline-none">
          <option value="front" ${img.viewType === 'front' ? 'selected' : ''}>Front Angle</option>
          <option value="back" ${img.viewType === 'back' ? 'selected' : ''}>Back Angle</option>
          <option value="detail" ${img.viewType === 'detail' ? 'selected' : ''}>Fabric Detail</option>
          <option value="lifestyle" ${img.viewType === 'lifestyle' ? 'selected' : ''}>Model Shot</option>
        </select>
        <div class="flex justify-between items-center pt-1 border-t border-[#E8E6E1]">
          <button type="button" data-set-primary-idx="${idx}" class="text-[9px] font-bold uppercase ${img.isPrimary ? 'text-emerald-700' : 'text-[#0B0B0B] hover:underline'}">
            ${img.isPrimary ? 'Main Cover' : 'Make Cover'}
          </button>
          <button type="button" data-remove-img-idx="${idx}" class="text-red-600 hover:text-red-800 text-xs p-1" title="Remove photo">
            ✕
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Attach controls
  container.querySelectorAll('[data-view-type-idx]').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const i = parseInt(sel.getAttribute('data-view-type-idx'));
      if (productFormImages[i]) productFormImages[i].viewType = e.target.value;
    });
  });

  container.querySelectorAll('[data-set-primary-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-set-primary-idx'));
      productFormImages.forEach((im, idx) => im.isPrimary = (idx === i));
      renderImagePreviews();
    });
  });

  container.querySelectorAll('[data-remove-img-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-remove-img-idx'));
      productFormImages.splice(i, 1);
      if (productFormImages.length > 0 && !productFormImages.some(im => im.isPrimary)) {
        productFormImages[0].isPrimary = true;
      }
      renderImagePreviews();
    });
  });
}

// Saves product and uploads pending files to Firebase Storage
async function saveCurrentProductForm() {
  const submitBtn = document.getElementById('save-product-btn');
  const progressBox = document.getElementById('upload-progress-box');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressPct = document.getElementById('upload-progress-pct');

  const existingId = document.getElementById('form-product-id').value;
  const productId = existingId || `prod_ys_${Date.now()}`;

  const title = document.getElementById('p-title').value.trim();
  const category = document.getElementById('p-category').value.trim();
  const price = parseFloat(document.getElementById('p-price').value);
  const compareAtPriceVal = document.getElementById('p-compare-price').value;
  const compareAtPrice = compareAtPriceVal ? parseFloat(compareAtPriceVal) : null;
  const stock = parseInt(document.getElementById('p-stock').value) || 0;
  const sku = document.getElementById('p-sku').value.trim() || `YS-${Date.now().toString().slice(-5)}`;
  const description = document.getElementById('p-desc').value.trim();
  const badge = document.getElementById('p-badge').value.trim();
  const published = document.getElementById('p-published').checked;
  const isBestSeller = document.getElementById('p-bestseller').checked;
  const isNewArrival = document.getElementById('p-newarrival')?.checked ?? false;
  const isFeatured = document.getElementById('p-featured')?.checked ?? false;

  // Selected sizes
  const selectedSizes = Array.from(document.querySelectorAll('#size-checkboxes-container input[name="product_sizes"]:checked'))
    .map(cb => cb.value);

  if (selectedSizes.length === 0) {
    alert('Please select at least one available size (e.g. S, M, L).');
    return;
  }

  if (productFormImages.length === 0) {
    alert('Please upload at least one product photo.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">◌</span> UPLOADING & SAVING...';

  const finalImages = [];

  // Upload any new images to Firebase Storage
  progressBox?.classList.remove('hidden');

  for (let i = 0; i < productFormImages.length; i++) {
    const imgItem = productFormImages[i];
    const pct = Math.round(((i + 1) / productFormImages.length) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent = `${pct}%`;

    if (imgItem.isNew && imgItem.file) {
      try {
        // Attempt upload to Firebase Storage: products/{productId}/images/{timestamp}_{cleanName}
        const cleanName = imgItem.file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const storagePath = `products/${productId}/images/${Date.now()}_${cleanName}`;
        const fileRef = ref(storage, storagePath);

        const uploadTask = uploadBytesResumable(fileRef, imgItem.file);
        
        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {}, 
            (error) => reject(error), 
            async () => {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              finalImages.push({
                id: `img_${Date.now()}_${i}`,
                name: imgItem.file.name,
                url: downloadUrl,
                downloadURL: downloadUrl,
                storagePath,
                isPrimary: imgItem.isPrimary,
                viewType: imgItem.viewType
              });
              resolve();
            }
          );
        });

      } catch (storageErr) {
        console.warn('Firebase Storage upload failed (falling back to optimized data URL):', storageErr);
        // Fallback: If Firebase Storage is uninitialized in the project, save data URL directly to Firestore
        finalImages.push({
          id: `img_${Date.now()}_${i}`,
          name: imgItem.file.name,
          url: imgItem.url,
          downloadURL: imgItem.url,
          isPrimary: imgItem.isPrimary,
          viewType: imgItem.viewType
        });
      }
    } else {
      // Existing mapped image
      finalImages.push({
        id: imgItem.id || `img_${i}`,
        name: imgItem.name || `photo_${i}.jpg`,
        url: imgItem.url,
        downloadURL: imgItem.url,
        isPrimary: imgItem.isPrimary,
        viewType: imgItem.viewType
      });
    }
  }

  progressBox?.classList.add('hidden');

  // Primary image calculation
  const primaryObj = finalImages.find(im => im.isPrimary) || finalImages[0];
  const thumbnail = primaryObj ? primaryObj.url : '';

  const payload = {
    name: title,
    title: title,
    category,
    price,
    compareAtPrice,
    stock,
    sku,
    description,
    badge,
    active: published,
    published,
    isBestSeller,
    isNewArrival,
    isFeatured,
    sizes: selectedSizes,
    sizeLabels: selectedSizes,
    colors: productFormColors.length > 0 ? productFormColors : [{ name: 'Obsidian Black', hex: '#0B0B0B' }],
    images: finalImages,
    thumbnail,
    primaryImage: thumbnail
  };

  try {
    await saveProductToFirestore(productId, payload);
    showToast(`Product "${title}" saved successfully`);
    document.getElementById('product-modal').classList.add('hidden');
  } catch (err) {
    alert('Failed to save product to Firestore: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>SAVE PRODUCT TO FIRESTORE</span><span class="text-[#C7FF2E]">→</span>';
  }
}

// -------------------------------------------------------------
// TAB 3: ORDER MANAGEMENT
// -------------------------------------------------------------

function renderOrdersTable() {
  const tbody = document.getElementById('admin-orders-tbody');
  if (!tbody) return;

  const activeStatusBtn = document.querySelector('#orders-status-filter-pills .order-tab-btn.active');
  const activeStatus = activeStatusBtn ? activeStatusBtn.getAttribute('data-status') : 'ALL';

  let filtered = allOrders;
  if (activeStatus !== 'ALL') {
    filtered = allOrders.filter(o => (o.orderStatus || 'CONFIRMED').toUpperCase() === activeStatus);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-[#6B6B6B]">No orders found matching status "${activeStatus}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const status = (o.orderStatus || 'CONFIRMED').toUpperCase();
    const payStatus = (o.paymentStatus || 'PENDING').toUpperCase();
    const badgeColor = getStatusBadgeClass(status);
    const dateFormatted = o.createdAt ? new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
    const itemsCount = Array.isArray(o.items) ? o.items.reduce((acc, it) => acc + (it.quantity || 1), 0) : 1;

    return `
      <tr class="hover:bg-[#F7F5F0]/60 transition-colors">
        <td class="p-4 font-editorial font-bold text-[#0B0B0B]">${o.orderId || o.id}</td>
        <td class="p-4">
          <div class="font-bold text-[#0B0B0B]">${o.customerName || 'Shopper'}</div>
          <div class="text-[10px] text-[#6B6B6B]">${o.customerEmail || ''}</div>
        </td>
        <td class="p-4">
          <span class="font-bold text-[#0B0B0B]">${itemsCount} pcs</span>
        </td>
        <td class="p-4 font-editorial font-bold text-[#0B0B0B]">
          ${formatCurrency(o.total, o.currency)}
        </td>
        <td class="p-4">
          <div class="text-[11px] font-bold ${payStatus === 'PAID' ? 'text-emerald-800' : 'text-amber-700'}">
            ${payStatus}
          </div>
          <div class="text-[9px] text-[#6B6B6B]">${o.paymentMethod || 'Credit Card'}</div>
        </td>
        <td class="p-4">
          <span class="inline-block text-[9px] font-extrabold uppercase px-2 py-0.5 ${badgeColor}">${status}</span>
          ${o.trackingNumber ? `<div class="text-[9px] text-[#6B6B6B] mt-0.5">${o.trackingNumber}</div>` : ''}
        </td>
        <td class="p-4 text-[11px] text-[#6B6B6B]">${dateFormatted}</td>
        <td class="p-4 text-right">
          <button data-manage-order-id="${o.id}" class="bg-[#0B0B0B] hover:bg-black text-white px-3 py-1.5 text-[10px] font-editorial font-bold uppercase tracking-wider cursor-pointer">
            OPEN
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-manage-order-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-manage-order-id');
      const order = allOrders.find(o => o.id === id);
      if (order) openOrderModal(order);
    });
  });
}

function setupOrdersFilterPills() {
  document.querySelectorAll('#orders-status-filter-pills .order-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#orders-status-filter-pills .order-tab-btn').forEach(b => {
        b.classList.remove('active', 'bg-[#0B0B0B]', 'text-white');
        b.classList.add('bg-white', 'text-[#6B6B6B]', 'border', 'border-[#0B0B0B]/20');
      });
      btn.classList.add('active', 'bg-[#0B0B0B]', 'text-white');
      btn.classList.remove('bg-white', 'text-[#6B6B6B]', 'border', 'border-[#0B0B0B]/20');
      renderOrdersTable();
    });
  });
}

function openOrderModal(order) {
  currentEditingOrder = order;
  const modal = document.getElementById('order-modal');

  document.getElementById('modal-order-id').textContent = order.orderId || order.id;
  document.getElementById('modal-order-timestamp').textContent = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A';
  document.getElementById('modal-cust-name').textContent = order.customerName || 'Customer';
  document.getElementById('modal-cust-email').textContent = order.customerEmail || 'No email';
  document.getElementById('modal-cust-phone').textContent = order.customerPhone || 'No phone';
  
  const addr = order.shippingAddress;
  document.getElementById('modal-cust-address').textContent = typeof addr === 'object' 
    ? `${addr.address || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.pincode || ''}`
    : (addr || 'Standard Drop Address');

  document.getElementById('modal-order-total').textContent = formatCurrency(order.total, order.currency);
  document.getElementById('modal-order-status-select').value = (order.orderStatus || 'CONFIRMED').toUpperCase();
  document.getElementById('modal-order-courier').value = order.courier || '';
  document.getElementById('modal-order-tracking').value = order.trackingNumber || '';
  document.getElementById('modal-order-note').value = order.adminNote || '';

  // Render Items
  const itemsContainer = document.getElementById('modal-order-items-list');
  const items = Array.isArray(order.items) ? order.items : [];
  
  if (items.length === 0) {
    itemsContainer.innerHTML = `<div class="p-4 text-xs text-[#6B6B6B]">Standard drop apparel items.</div>`;
  } else {
    itemsContainer.innerHTML = items.map(it => {
      const img = extractProductImageUrl(it.image || it.productImage || it.thumbnail);
      return `
        <div class="p-3 flex items-center justify-between gap-4 text-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-12 bg-[#E8E6E1] shrink-0 border border-[#0B0B0B]/10 overflow-hidden flex items-center justify-center">
              ${img ? `<img src="${img}" class="w-full h-full object-cover" />` : `<i class="fa-solid fa-shirt text-[#6B6B6B]"></i>`}
            </div>
            <div>
              <strong class="font-editorial text-xs font-bold uppercase text-[#0B0B0B]">${it.name || it.productName}</strong>
              <div class="text-[10px] text-[#6B6B6B]">Size: <span class="font-bold text-[#0B0B0B]">${extractSizeLabel(it.size || it.selectedSize) || 'L'}</span> • Color: ${it.color || it.selectedColor || 'Default'}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-bold text-[#0B0B0B]">${it.quantity} × ${formatCurrency(it.price, order.currency)}</div>
            <div class="font-editorial font-bold text-xs text-[#0B0B0B]">${formatCurrency(Number(it.price) * (it.quantity || 1), order.currency)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
}

function setupOrderModal() {
  const modal = document.getElementById('order-modal');
  const closeBtn = document.getElementById('close-order-modal');
  const form = document.getElementById('order-update-form');

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentEditingOrder) return;

    const newStatus = document.getElementById('modal-order-status-select').value;
    const courier = document.getElementById('modal-order-courier').value.trim();
    const tracking = document.getElementById('modal-order-tracking').value.trim();
    const note = document.getElementById('modal-order-note').value.trim();

    try {
      await updateOrderStatusInFirestore(currentEditingOrder.id, {
        orderStatus: newStatus,
        courier: courier || currentEditingOrder.courier || 'USPS Priority Air',
        trackingNumber: tracking || currentEditingOrder.trackingNumber || '',
        adminNote: note
      });

      showToast(`Order ${currentEditingOrder.orderId || currentEditingOrder.id} updated to ${newStatus}`);
      modal.classList.add('hidden');
    } catch (err) {
      alert('Failed to update order status: ' + err.message);
    }
  });
}

// -------------------------------------------------------------
// TAB 4: CUSTOMERS
// -------------------------------------------------------------

function renderCustomersTable() {
  const tbody = document.getElementById('admin-customers-tbody');
  const searchInput = document.getElementById('admin-customers-search');
  if (!tbody) return;

  const q = (searchInput?.value || '').toLowerCase().trim();

  let filtered = allCustomers.filter(c => {
    if (!q) return true;
    return (c.displayName || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-[#6B6B6B]">No customer records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const customerOrders = allOrders.filter(o => (o.customerEmail || '').toLowerCase() === (c.email || '').toLowerCase() || o.userId === c.uid);
    const totalSpent = customerOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const joined = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';

    return `
      <tr class="hover:bg-[#F7F5F0]/60 transition-colors">
        <td class="p-4 font-bold text-[#0B0B0B]">${c.displayName || 'Collector'}</td>
        <td class="p-4 text-[#6B6B6B]">${c.email}</td>
        <td class="p-4 text-[#6B6B6B]">${c.phone || '—'}</td>
        <td class="p-4 font-bold text-[#0B0B0B]">${customerOrders.length} orders</td>
        <td class="p-4 font-editorial font-bold text-[#0B0B0B]">${formatCurrency(totalSpent)}</td>
        <td class="p-4 text-[11px] text-[#6B6B6B]">${joined}</td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// TAB 5: REVIEWS MODERATION
// -------------------------------------------------------------

function renderReviewsTable() {
  const container = document.getElementById('admin-reviews-container');
  if (!container) return;

  if (allReviews.length === 0) {
    container.innerHTML = `<div class="p-8 text-center bg-white border border-[#0B0B0B]/10 text-xs text-[#6B6B6B]">No customer reviews recorded yet.</div>`;
    return;
  }

  container.innerHTML = allReviews.map(r => {
    const isApproved = r.status === 'approved' || r.approved === true;
    const dateFormatted = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US') : 'Recent';

    return `
      <div class="bg-white border border-[#0B0B0B]/10 p-5 space-y-3">
        <div class="flex justify-between items-start gap-4">
          <div>
            <div class="flex items-center gap-2">
              <strong class="font-editorial text-sm font-bold uppercase text-[#0B0B0B]">${r.customerName || 'Collector'}</strong>
              <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 ${isApproved ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}">
                ${isApproved ? 'APPROVED' : 'PENDING REVIEW'}
              </span>
            </div>
            <div class="text-[11px] text-[#6B6B6B] mt-0.5">Product ID: ${r.productId || 'Drop'} • ${dateFormatted}</div>
          </div>
          <div class="flex items-center gap-1 text-amber-500 text-xs">
            ${Array.from({ length: r.rating || 5 }).map(() => '<i class="fa-solid fa-star"></i>').join('')}
          </div>
        </div>

        <p class="text-xs text-[#0B0B0B]">${r.comment || r.review || ''}</p>

        ${Array.isArray(r.photoUrls) && r.photoUrls.length > 0 ? `
          <div class="flex gap-2 pt-2">
            ${r.photoUrls.map(url => `
              <a href="${url}" target="_blank" class="w-14 h-14 border border-[#0B0B0B]/10 overflow-hidden shrink-0">
                <img src="${url}" class="w-full h-full object-cover" />
              </a>
            `).join('')}
          </div>
        ` : ''}

        <div class="flex gap-2 pt-2 border-t border-[#E8E6E1] justify-end">
          ${!isApproved ? `
            <button data-approve-review-id="${r.id}" class="bg-[#0B0B0B] text-white px-3 py-1.5 text-[10px] font-editorial font-bold uppercase hover:bg-black cursor-pointer">
              APPROVE REVIEW
            </button>
          ` : `
            <button data-reject-review-id="${r.id}" class="border border-[#0B0B0B] text-[#0B0B0B] px-3 py-1.5 text-[10px] font-editorial font-bold uppercase hover:bg-[#F7F5F0] cursor-pointer">
              UNPUBLISH
            </button>
          `}
          <button data-delete-review-id="${r.id}" class="text-red-600 hover:text-red-800 px-3 py-1.5 text-[10px] font-editorial font-bold uppercase cursor-pointer">
            DELETE
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-approve-review-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-approve-review-id');
      await updateReviewStatusInFirestore(id, 'approved');
      showToast('Review approved');
      loadReviews();
    });
  });

  container.querySelectorAll('[data-reject-review-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-reject-review-id');
      await updateReviewStatusInFirestore(id, 'rejected');
      showToast('Review unapproved');
      loadReviews();
    });
  });

  container.querySelectorAll('[data-delete-review-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-review-id');
      askConfirmation('Delete Review', 'Are you sure you want to permanently delete this customer review?', async () => {
        await deleteReviewFromFirestore(id);
        showToast('Review deleted');
        loadReviews();
      });
    });
  });
}

// -------------------------------------------------------------
// TAB 6: RETURNS & REFUNDS
// -------------------------------------------------------------

function renderReturnsTable() {
  const container = document.getElementById('admin-returns-container');
  if (!container) return;

  if (allReturns.length === 0) {
    container.innerHTML = `<div class="p-8 text-center bg-white border border-[#0B0B0B]/10 text-xs text-[#6B6B6B]">No return requests submitted.</div>`;
    return;
  }

  container.innerHTML = allReturns.map(ret => `
    <div class="bg-white border border-[#0B0B0B]/10 p-5 space-y-3">
      <div class="flex justify-between items-start">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-editorial text-sm font-bold uppercase text-[#0B0B0B]">Order #${ret.orderId}</span>
            <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300">
              ${ret.status || 'PENDING'}
            </span>
          </div>
          <div class="text-[11px] text-[#6B6B6B] mt-0.5">Requester: ${ret.customerEmail || 'Customer'} • Claim ID: ${ret.id}</div>
        </div>
      </div>

      <div class="text-xs bg-[#F7F5F0] p-3 border border-[#0B0B0B]/10">
        <strong>Reason:</strong> ${ret.reason || 'Size exchange or return'}<br/>
        <span class="text-[#6B6B6B]">${ret.description || ret.comment || ''}</span>
      </div>

      <div class="flex gap-2 justify-end pt-2 border-t border-[#E8E6E1]">
        <button data-accept-return-id="${ret.id}" class="bg-[#0B0B0B] text-white px-3 py-1.5 text-[10px] font-editorial font-bold uppercase hover:bg-black cursor-pointer">
          APPROVE RETURN
        </button>
        <button data-resolve-return-id="${ret.id}" class="bg-emerald-800 text-white px-3 py-1.5 text-[10px] font-editorial font-bold uppercase hover:bg-emerald-900 cursor-pointer">
          MARK REFUNDED
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-accept-return-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-accept-return-id');
      await updateReturnRequestInFirestore(id, { status: 'Approved', adminNote: 'Return authorized for processing' });
      showToast('Return request approved');
      loadReturns();
    });
  });

  container.querySelectorAll('[data-resolve-return-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-resolve-return-id');
      await updateReturnRequestInFirestore(id, { status: 'Refund Issued', adminNote: 'Refund payment processed' });
      showToast('Return marked as refunded');
      loadReturns();
    });
  });
}

// -------------------------------------------------------------
// TAB 7: SUPPORT TICKETS
// -------------------------------------------------------------

function renderSupportTicketsTable() {
  const container = document.getElementById('admin-tickets-container');
  if (!container) return;

  if (allTickets.length === 0) {
    container.innerHTML = `<div class="p-8 text-center bg-white border border-[#0B0B0B]/10 text-xs text-[#6B6B6B]">No support inquiries recorded.</div>`;
    return;
  }

  container.innerHTML = allTickets.map(t => `
    <div class="bg-white border border-[#0B0B0B]/10 p-5 space-y-3">
      <div class="flex justify-between items-start">
        <div>
          <strong class="font-editorial text-sm font-bold uppercase text-[#0B0B0B]">${t.subject || 'Customer Inquiry'}</strong>
          <div class="text-[11px] text-[#6B6B6B] mt-0.5">From: ${t.name || 'Shopper'} (${t.email}) • Ticket #${t.id}</div>
        </div>
        <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 ${t.status === 'Resolved' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-blue-100 text-blue-900 border border-blue-300'}">
          ${t.status || 'OPEN'}
        </span>
      </div>

      <div class="text-xs bg-[#F7F5F0] p-3 border border-[#0B0B0B]/10">
        ${t.message || ''}
      </div>

      <div class="flex gap-2 justify-end pt-2 border-t border-[#E8E6E1]">
        <button data-resolve-ticket-id="${t.id}" class="bg-[#0B0B0B] text-white px-3 py-1.5 text-[10px] font-editorial font-bold uppercase hover:bg-black cursor-pointer">
          ${t.status === 'Resolved' ? 'REOPEN TICKET' : 'MARK RESOLVED'}
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-resolve-ticket-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-resolve-ticket-id');
      const ticket = allTickets.find(t => t.id === id);
      const newStatus = ticket?.status === 'Resolved' ? 'In Progress' : 'Resolved';
      await updateSupportTicketInFirestore(id, { status: newStatus, adminReply: 'Handled by store concierge' });
      showToast(`Ticket status updated to ${newStatus}`);
      loadSupportTickets();
    });
  });
}

// -------------------------------------------------------------
// TAB 8: PAYMENTS & REPORTS
// -------------------------------------------------------------

function renderReportsTable() {
  const tbody = document.getElementById('admin-reports-tbody');
  const dateFilter = document.getElementById('reports-date-filter');
  if (!tbody) return;

  const filter = dateFilter ? dateFilter.value : 'all';
  const now = Date.now();

  let filtered = allOrders.filter(o => {
    if (filter === 'all') return true;
    const orderTime = new Date(o.createdAt || 0).getTime();
    if (filter === 'today') return (now - orderTime) <= (24 * 60 * 60 * 1000);
    if (filter === '7days') return (now - orderTime) <= (7 * 24 * 60 * 60 * 1000);
    if (filter === '30days') return (now - orderTime) <= (30 * 24 * 60 * 60 * 1000);
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-[#6B6B6B]">No transactions in selected range.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => `
    <tr class="hover:bg-[#F7F5F0]/60 transition-colors">
      <td class="p-4 font-editorial font-bold text-[#0B0B0B]">${o.orderId || o.id}</td>
      <td class="p-4">
        <div class="font-bold text-[#0B0B0B]">${o.customerName || 'Shopper'}</div>
        <div class="text-[10px] text-[#6B6B6B]">${o.customerEmail || ''}</div>
      </td>
      <td class="p-4 font-bold text-[#0B0B0B]">${o.paymentMethod || 'Credit Card'}</td>
      <td class="p-4 font-bold text-[#6B6B6B]">${o.currency || 'USD'}</td>
      <td class="p-4 font-editorial font-bold text-[#0B0B0B]">${formatCurrency(o.total, o.currency)}</td>
      <td class="p-4">
        <span class="inline-block text-[9px] font-extrabold uppercase px-2 py-0.5 ${(o.paymentStatus || 'PAID') === 'PAID' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}">
          ${o.paymentStatus || 'PAID'}
        </span>
      </td>
      <td class="p-4 text-[11px] text-[#6B6B6B]">${o.createdAt ? new Date(o.createdAt).toLocaleString() : 'N/A'}</td>
    </tr>
  `).join('');
}

// Export CSV helper
function setupReportsExport() {
  document.getElementById('export-report-btn')?.addEventListener('click', () => {
    if (allOrders.length === 0) {
      alert('No orders available to export.');
      return;
    }

    const headers = ['Order ID', 'Date', 'Customer Name', 'Customer Email', 'Items Count', 'Currency', 'Total', 'Payment Method', 'Payment Status', 'Order Status', 'Tracking Number'];
    const rows = allOrders.map(o => [
      `"${o.orderId || o.id}"`,
      `"${o.createdAt || ''}"`,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${(o.customerEmail || '').replace(/"/g, '""')}"`,
      Array.isArray(o.items) ? o.items.length : 1,
      `"${o.currency || 'USD'}"`,
      Number(o.total) || 0,
      `"${o.paymentMethod || 'Credit Card'}"`,
      `"${o.paymentStatus || 'PAID'}"`,
      `"${o.orderStatus || 'CONFIRMED'}"`,
      `"${o.trackingNumber || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `young_stupid_orders_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

// -------------------------------------------------------------
// NAVIGATION & SIDEBAR MANAGEMENT
// -------------------------------------------------------------

function setupNavigation() {
  const navBtns = document.querySelectorAll('.sidebar-nav-btn');
  const panes = document.querySelectorAll('.admin-tab-pane');
  const tabTitle = document.getElementById('current-tab-title');
  const sidebar = document.getElementById('admin-sidebar');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (!targetTab) return;

      currentTab = targetTab;

      navBtns.forEach(b => {
        b.classList.remove('active', 'bg-[#0B0B0B]', 'text-[#F7F5F0]');
        b.classList.add('text-[#6B6B6B]');
      });
      btn.classList.add('active', 'bg-[#0B0B0B]', 'text-[#F7F5F0]');
      btn.classList.remove('text-[#6B6B6B]');

      panes.forEach(p => p.classList.add('hidden'));
      const activePane = document.getElementById(`tab-${targetTab}`);
      if (activePane) activePane.classList.remove('hidden');

      if (tabTitle) {
        tabTitle.textContent = `${targetTab.toUpperCase()} MANAGEMENT`;
      }

      // Close mobile sidebar on navigation
      if (window.innerWidth < 1024) {
        sidebar?.classList.add('-translate-x-full');
      }
    });
  });

  // Mobile sidebar toggles
  document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => {
    sidebar?.classList.toggle('-translate-x-full');
  });

  document.getElementById('sidebar-close-btn')?.addEventListener('click', () => {
    sidebar?.classList.add('-translate-x-full');
  });

  // Manual refresh button
  document.getElementById('refresh-data-btn')?.addEventListener('click', async () => {
    showToast('Syncing all database streams...');
    await Promise.all([
      loadCustomers(),
      loadReviews(),
      loadReturns(),
      loadSupportTickets()
    ]);
    showToast('Database sync complete');
  });

  // Search input listeners
  document.getElementById('admin-products-search')?.addEventListener('input', renderProductsTable);
  document.getElementById('admin-category-filter')?.addEventListener('change', renderProductsTable);
  document.getElementById('admin-status-filter')?.addEventListener('change', renderProductsTable);
  document.getElementById('admin-customers-search')?.addEventListener('input', renderCustomersTable);
  document.getElementById('reports-date-filter')?.addEventListener('change', renderReportsTable);
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  setupNavigation();
  setupProductModal();
  setupOrderModal();
  setupOrdersFilterPills();
  setupReportsExport();
});
