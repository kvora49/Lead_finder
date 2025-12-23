import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
// TODO: Replace with your actual Firebase config
// Get this from: https://console.firebase.google.com/
// Project Settings > General > Your apps > Web app
const firebaseConfig = {
  apiKey: "AIzaSyCRPZg4iK4TdNvQxUK4x3jc8q37Jd58MmI",
  authDomain: "lead-finder-6b009.firebaseapp.com",
  projectId: "lead-finder-6b009",
  storageBucket: "lead-finder-6b009.firebasestorage.app",
  messagingSenderId: "1020136892036",
  appId: "1:1020136892036:web:a55cb272c8b40ab36c04d1",
  measurementId: "G-ME1C27X5VS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;
