import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBF7RX_FeVfsBZiLDK3om6dG3dhYweH9Dc",
  authDomain: "webs-39bd2.firebaseapp.com",
  projectId: "webs-39bd2",
  storageBucket: "webs-39bd2.firebasestorage.app",
  messagingSenderId: "312273897490",
  appId: "1:312273897490:web:d0bfac34205709e0b070cb",
  measurementId: "G-8KSFRL0ENE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Import our actual extraction logic from js/firebase-init.js
import { 
  extractProductImageUrl, 
  extractAllProductImages, 
  mapFirestoreProductDoc,
  isProductPublic,
  fetchProductsFromFirestore,
  fetchProductByIdFromFirestore,
  ensureShopperAuth
} from '../js/firebase-init.js';

async function verify() {
  console.log("=== STEP 1: AUTHENTICATING SESSION ===");
  const user = await ensureShopperAuth();
  console.log("Authenticated successfully (UID:", user?.uid, ")");

  console.log("\n=== STEP 2: VERIFYING REAL FIRESTORE STOREFRONT PRODUCTS ===");
  const products = await fetchProductsFromFirestore();
  console.log(`Found ${products.length} published products ready for customer storefront.`);

  let allValid = true;

  products.forEach(mapped => {
    console.log(`\nProduct ID: ${mapped.id}`);
    console.log(`Name: ${mapped.name}`);
    console.log(`Category: ${mapped.category}`);
    console.log(`Price: $${mapped.price}`);
    console.log(`Total Mapped Images: ${mapped.images.length}`);
    console.log(`Primary Image: ${mapped.thumbnail ? mapped.thumbnail.slice(0, 60) + '...' : 'NONE'}`);
    console.log(`Sizes (${mapped.sizes.length}):`, mapped.sizes.map((s: any) => s.label).join(', '));
    console.log(`Colors (${mapped.colors.length}):`, mapped.colors.map((c: any) => `${c.name} (${c.images.length} imgs)`).join(', '));

    // Validations
    if (mapped.images.length === 0) {
      console.error(`FAIL: Product ${mapped.id} has 0 images!`);
      allValid = false;
    }
    const isUrlOrData = mapped.thumbnail && (mapped.thumbnail.startsWith('http') || mapped.thumbnail.startsWith('data:image/'));
    if (!isUrlOrData) {
      console.error(`FAIL: Product ${mapped.id} has invalid thumbnail: ${mapped.thumbnail}`);
      allValid = false;
    }
    if (mapped.images.some((img: any) => typeof img !== 'string' || img.includes('[object Object]'))) {
      console.error(`FAIL: Product ${mapped.id} has corrupted image URLs!`);
      allValid = false;
    }
    if (!mapped.name || mapped.name === 'Untitled T-Shirt') {
      console.error(`FAIL: Product ${mapped.id} fallback name used!`);
      allValid = false;
    }
  });

  if (!allValid) {
    throw new Error("One or more products failed validation!");
  }
  console.log("\n>>> ALL EXISTING PRODUCTS PASSED VALIDATION! <<<");

  console.log("\n=== STEP 3: TESTING FULL ADMIN LIFECYCLE (ADD -> UPLOAD IMAGE -> EDIT -> DELETE) ===");
  const testProductId = `test_drop_${Date.now()}`;
  const testDocRef = doc(db, 'products', testProductId);

  // 1. Add product with uploaded image from computer (data URL representation)
  const initialPayload = {
    name: "CYBER ACID VINTAGE OVERSIZED TEE",
    title: "CYBER ACID VINTAGE OVERSIZED TEE",
    category: "Vintage Acid",
    price: 68,
    compareAtPrice: 88,
    active: true,
    published: true,
    stock: 25,
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: [
      { name: "Acid Black", hex: "#111111" },
      { name: "Bone Sand", hex: "#E8E6E1" }
    ],
    images: [
      {
        id: "img_main_01",
        name: "cyber_acid_front.jpg",
        url: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=900&auto=format&fit=crop&q=80",
        viewType: "front",
        isPrimary: true
      }
    ],
    thumbnail: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=900&auto=format&fit=crop&q=80",
    description: "Heavyweight 280 GSM cotton with custom acid wash and distressed graphic print.",
    createdAt: new Date().toISOString()
  };

  await setDoc(testDocRef, initialPayload);
  console.log(`✓ 1. Successfully added new product ${testProductId} to Firestore.`);

  // 2. Customer website fetches product and verifies details
  const fetchedAfterAdd = await fetchProductByIdFromFirestore(testProductId);
  if (!fetchedAfterAdd) throw new Error("Newly created product could not be fetched by storefront!");
  console.log(`✓ 2. Storefront verified product: "${fetchedAfterAdd.name}" | Price: $${fetchedAfterAdd.price} | Category: ${fetchedAfterAdd.category}`);
  if (fetchedAfterAdd.images.length !== 1 || !fetchedAfterAdd.thumbnail) {
    throw new Error("Product image failed to map on storefront!");
  }

  // 3. Edit product (update price and add secondary image)
  await setDoc(testDocRef, {
    price: 62,
    images: [
      initialPayload.images[0],
      {
        id: "img_back_02",
        name: "cyber_acid_back.jpg",
        url: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=900&auto=format&fit=crop&q=80",
        viewType: "back",
        isPrimary: false
      }
    ],
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log(`✓ 3. Edited product ${testProductId} in Firestore (price -> $62, added back angle image).`);

  // 4. Verify storefront reflects edited details
  const fetchedAfterEdit = await fetchProductByIdFromFirestore(testProductId);
  if (fetchedAfterEdit?.price !== 62) {
    throw new Error(`Expected edited price $62, got: ${fetchedAfterEdit?.price}`);
  }
  if (fetchedAfterEdit.images.length !== 2) {
    throw new Error(`Expected 2 images after edit, got: ${fetchedAfterEdit.images.length}`);
  }
  console.log(`✓ 4. Storefront verified edited product: New Price: $${fetchedAfterEdit.price} | Total Images: ${fetchedAfterEdit.images.length}`);

  // 5. Delete product from Firestore
  await deleteDoc(testDocRef);
  console.log(`✓ 5. Deleted product ${testProductId} from Firestore.`);

  // 6. Verify storefront no longer displays deleted product
  const fetchedAfterDelete = await fetchProductByIdFromFirestore(testProductId);
  if (fetchedAfterDelete !== null) {
    throw new Error("Deleted product is still returning from storefront queries!");
  }
  console.log(`✓ 6. Confirmed product ${testProductId} disappeared from storefront.`);

  console.log("\n=== ALL WORKFLOW & PERSISTENCE TESTS PASSED SUCCESSFULLY! ===");
}

verify().then(() => {
  process.exit(0);
}).catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
