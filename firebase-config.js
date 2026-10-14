// Firebase Web アプリの公開設定（サービスアカウント秘密鍵は絶対に置かない）
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCSfLynfac1kr1wuQsEdrjlL7w3U_d3Sd4",
    authDomain: "tetris-battle-online.firebaseapp.com",
    projectId: "tetris-battle-online",
    storageBucket: "tetris-battle-online.firebasestorage.app",
    messagingSenderId: "162721186985",
    appId: "1:162721186985:web:3c5e558f65e4bf9400d5b8",
    measurementId: "G-DLJH2KLGH3"
  };
  if (window.firebase) {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    window.tetrisFirebaseAuth = firebase.auth();
  }
})();
