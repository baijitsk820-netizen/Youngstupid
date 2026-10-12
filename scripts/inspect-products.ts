import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function main() {
  console.log("Fetching products from Firestore...");
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Found ${snap.size} documents in 'products' collection.`);
  snap.forEach(doc => {
    console.log("-----------------------------------------");
    console.log(`Doc ID: ${doc.id}`);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}

main().catch(err => {
  console.error("Error fetching products:", err);
  process.exit(1);
});
