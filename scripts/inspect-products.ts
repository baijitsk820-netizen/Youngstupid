import { 
  fetchProductsFromFirestore,
  ensureShopperAuth
} from '../js/firebase-init.js';

async function main() {
  console.log("Connecting and fetching real products from Firestore...");
  await ensureShopperAuth();
  const products = await fetchProductsFromFirestore();
  console.log(`Found ${products.length} published products in 'products' collection.`);
  products.forEach(p => {
    console.log("-----------------------------------------");
    console.log(`Product ID: ${p.id} | Name: ${p.name} | Price: $${p.price} | Stock: ${p.stock}`);
    console.log(`Thumbnail: ${p.thumbnail ? p.thumbnail.slice(0, 60) + '...' : 'None'}`);
    console.log(`Sizes:`, p.sizes);
  });
  process.exit(0);
}

main().catch(err => {
  console.error("Error inspecting products:", err);
  process.exit(1);
});
