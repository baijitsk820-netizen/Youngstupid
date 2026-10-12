// Real Product Service connecting to Cloud Firestore collection `products`
import { 
  fetchProductsFromFirestore, 
  fetchProductByIdFromFirestore, 
  subscribeToProductsFromFirestore,
  subscribeToProductByIdFromFirestore,
  extractSizeLabel 
} from './firebase-init.js';

let cachedProducts = null;

/**
 * Retrieves all real products from Firestore.
 * Always retrieves genuine documents from the user's Firebase project.
 */
export async function getAllProducts(forceRefresh = false) {
  if (cachedProducts && !forceRefresh) {
    return cachedProducts;
  }
  const products = await fetchProductsFromFirestore();
  cachedProducts = products;
  return products;
}

/**
 * Subscribes to real-time updates for products.
 * Keeps memory cache in sync and invokes callback whenever Firestore collection changes.
 */
export function subscribeToProducts(callback) {
  return subscribeToProductsFromFirestore((products) => {
    cachedProducts = products;
    callback(products);
  });
}

/**
 * Subscribes to real-time updates for a single product.
 */
export function subscribeToProduct(id, callback) {
  return subscribeToProductByIdFromFirestore(id, (product) => {
    if (product && cachedProducts) {
      const idx = cachedProducts.findIndex(p => p.id === product.id);
      if (idx > -1) {
        cachedProducts[idx] = product;
      } else {
        cachedProducts.push(product);
      }
    }
    callback(product);
  });
}

/**
 * Retrieves a single real product by its Firestore Document ID.
 */
export async function getProductById(id) {
  if (!id) return null;
  // Check in-memory cache first
  if (cachedProducts) {
    const found = cachedProducts.find(p => p.id === id);
    if (found) return found;
  }
  // Fetch directly from Firestore
  return await fetchProductByIdFromFirestore(id);
}

/**
 * Dynamically extracts all distinct categories present in real Firestore products.
 */
export function extractCategoriesFromProducts(products) {
  if (!Array.isArray(products)) return [];
  const set = new Set();
  products.forEach(p => {
    if (p.category && typeof p.category === 'string') {
      set.add(p.category);
    }
  });
  return Array.from(set);
}

/**
 * Filters a list of real Firestore products by criteria without page reload.
 */
export function filterProducts(products, {
  category = 'all',
  size = 'all',
  color = 'all',
  maxPrice = 100000,
  searchQuery = '',
  availability = 'all',
  sortBy = 'bestselling'
}) {
  if (!Array.isArray(products)) return [];
  let list = [...products];

  // Category filter
  if (category && category !== 'all') {
    list = list.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
  }

  // Size filter
  if (size && size !== 'all') {
    list = list.filter(p => {
      const pSizes = Array.isArray(p.sizes) ? p.sizes : (Array.isArray(p.sizeLabels) ? p.sizeLabels : []);
      return pSizes.some(s => extractSizeLabel(s).toLowerCase() === size.toLowerCase());
    });
  }

  // Color filter
  if (color && color !== 'all') {
    list = list.filter(p => Array.isArray(p.colors) && p.colors.some(c => String(c).toLowerCase() === color.toLowerCase()));
  }

  // Max price filter
  if (typeof maxPrice === 'number' && maxPrice > 0) {
    list = list.filter(p => (Number(p.price) || 0) <= maxPrice);
  }

  // Availability filter
  if (availability === 'in-stock') {
    list = list.filter(p => (p.stock || 0) > 0);
  }

  // Search query filter
  if (searchQuery && searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    );
  }

  // Sorting based on real Firestore fields
  switch (sortBy) {
    case 'price-asc':
      list.sort((a, b) => (a.price || 0) - (b.price || 0));
      break;
    case 'price-desc':
      list.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    case 'rating':
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'newest':
      list.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      break;
    case 'bestselling':
    default:
      list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
      break;
  }

  return list;
}
