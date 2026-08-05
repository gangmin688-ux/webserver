// firebase-config.js
// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 (웹 앱) 에서 나오는 firebaseConfig 값.
// 이 값들은 공개되어도 안전합니다 (비밀키 아님).
// 실제 접근 제어는 Firebase Realtime Database 규칙에서 합니다.

const firebaseConfig = {
  apiKey: "AIzaSyCSJe_-oFCoozptK92LYTSPvlFDZ8vp8pU",
  authDomain: "webserver-5e20f.firebaseapp.com",
  databaseURL: "https://webserver-5e20f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webserver-5e20f",
  storageBucket: "webserver-5e20f.firebasestorage.app",
  messagingSenderId: "992517433042",
  appId: "1:992517433042:web:b86143efe22fbdb0746f0b",
  measurementId: "G-X91BW3THFS"
};

firebase.initializeApp(firebaseConfig);
