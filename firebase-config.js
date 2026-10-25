// Firebase project settings for Google sign-in and saving tier lists to an account.
//
// Paste the config from Firebase console → Project settings → Your apps → Web app.
// These values are not secret: access to saved lists is protected by the Firestore
// security rules in the README, which only let each user read and write their own lists.
//
// While this is null, the "Sign in" button explains that accounts aren't set up yet.
window.FIREBASE_CONFIG = null;

// Example:
// window.FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abc123",
// };
