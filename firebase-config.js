// Firebase project settings for Google sign-in and saving tier lists to an account.
//
// Paste the config from Firebase console → Project settings → Your apps → Web app.
// These values are not secret: access to saved lists is protected by the Firestore
// security rules in the README, which only let each user read and write their own lists.
//
// While this is null, the "Sign in" button explains that accounts aren't set up yet.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAWFqQA_BupCUBpQLAjNjd7Ku26P7iYsnw",
  authDomain: "maverick-tierlistmaker.firebaseapp.com",
  projectId: "maverick-tierlistmaker",
  storageBucket: "maverick-tierlistmaker.firebasestorage.app",
  messagingSenderId: "178959992974",
  appId: "1:178959992974:web:47d2b5b57733d7a0dd21df",
};

