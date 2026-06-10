// 1) Для общего онлайна вставь Firebase config.
// 2) Без Firebase сайт работает только как локальное демо на одном браузере.
// 3) Админ-код в GitHub Pages не является настоящей защитой, потому что код сайта открыт.

window.FIREBASE_CONFIG = {
  apiKey: "ВСТАВЬ_API_KEY",
  authDomain: "ВСТАВЬ_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://ВСТАВЬ_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "ВСТАВЬ_PROJECT_ID",
  storageBucket: "ВСТАВЬ_PROJECT_ID.appspot.com",
  messagingSenderId: "ВСТАВЬ_SENDER_ID",
  appId: "ВСТАВЬ_APP_ID"
};

window.ADMIN_CODE = "183729";
window.OWNER_NICK = "veyr1x";
window.START_COINS = 5000;
