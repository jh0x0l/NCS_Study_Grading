// Firebase 설정[cite: 1]
const firebaseConfig = {
  apiKey: "AIzaSyAHhiB7lKFTKikPiAyLhef_YDggWUteijw",
  authDomain: "ncs-study-90d1f.firebaseapp.com",
  projectId: "ncs-study-90d1f",
  storageBucket: "ncs-study-90d1f.firebasestorage.app",
  messagingSenderId: "970881892252",
  appId: "1:970881892252:web:e7364260b72127b2581259"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const COLLECTION = 'ncs_study';

// 데이터 읽기/쓰기 래퍼 함수
async function fsGet(key) {
  const snap = await db.collection(COLLECTION).doc(key).get();
  return snap.exists ? snap.data().value : null;
}

async function fsSet(key, value) {
  await db.collection(COLLECTION).doc(key).set({ value: value, updatedAt: Date.now() });
}

// 실시간 바인딩 이벤트 모듈
function subscribeCollection(docKey, onUpdate, onError) {
  return db.collection(COLLECTION).doc(docKey).onSnapshot(snap => {
    const val = (snap.exists && snap.data().value) ? JSON.parse(snap.data().value) : null;
    onUpdate(val);
  }, onError);
}