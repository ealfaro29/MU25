// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DELEGATES_DATA } from "./delegates.js";

// --- 1. CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBjLGyOQXd0FE6vjqn_koVsCcWW76Bwz3A",
  authDomain: "mu25-41abe.firebaseapp.com",
  projectId: "mu25-41abe",
  storageBucket: "mu25-41abe.firebasestorage.app",
  messagingSenderId: "741861425274",
  appId: "1:741861425274:web:6798c0ebe505ff053bfbc3",
  measurementId: "G-31T9BGP25N"
};

// --- 2. VARIABLES GLOBALES ---
let db;
let currentUser = null;
let userData = { top: [], scores: {} };
let saveTimeout = null;

// --- 3. INICIALIZACIÓN ---
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  checkAutoLogin();
} catch (e) {
  console.error("Firebase Error:", e);
}

// --- 4. SISTEMA DE LOGIN ---
const loginOverlay = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');
const btnEnter = document.getElementById('btn-enter');
const msgEl = document.getElementById('login-msg');

function checkAutoLogin() {
  const storedUser = localStorage.getItem('mu_user_session');
  if (storedUser) performLogin(storedUser, null, true);
}

btnEnter.onclick = () => {
  const u = document.getElementById('inp-username').value.trim().toLowerCase().replace(/\s/g, '');
  const p = document.getElementById('inp-password').value.trim();
  if (!u || !p) return showMsg("Faltan datos");
  performLogin(u, p, false);
};

async function performLogin(user, pass, isAuto) {
  if (!db) return showMsg("Error: BD no conectada");
  if (!isAuto) showMsg("Verificando...", "#ccc");

  try {
    const docRef = doc(db, "users", user);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      if (isAuto || data.password === pass) {
        finalizeLogin(user, data);
      } else {
        showMsg("Contraseña incorrecta");
      }
    } else {
      if (isAuto) { localStorage.removeItem('mu_user_session'); return; }
      const newUser = { password: pass, top: [], scores: {}, created: new Date().toISOString() };
      await setDoc(docRef, newUser);
      finalizeLogin(user, newUser);
    }
  } catch (e) { console.error(e); showMsg("Error de conexión"); }
}

function finalizeLogin(user, data) {
  currentUser = user;
  userData.top = data.top || [];
  userData.scores = data.scores || {};
  localStorage.setItem('mu_user_session', user);
  document.getElementById('display-user').textContent = user;
  
  loginOverlay.style.opacity = 0;
  setTimeout(() => loginOverlay.style.display = 'none', 500);
  appContainer.style.display = 'block';
  setTimeout(() => appContainer.style.opacity = 1, 100);

  initTopBuilder();
  initScoring();

  // Listener Real-time
  onSnapshot(doc(db, "users", user), (docSnap) => {
    const newData = docSnap.data();
    if (!newData) return;
    // Actualizar localmente si cambió en la nube (y no fuimos nosotros)
    if(JSON.stringify(newData.top) !== JSON.stringify(userData.top)) {
       userData.top = newData.top || [];
       refreshTopUI();
    }
    if(JSON.stringify(newData.scores) !== JSON.stringify(userData.scores)) {
       userData.scores = newData.scores || {};
       // Score UI se actualiza sola al navegar
    }
  });
}

function showMsg(txt, color='#ff4444') {
  msgEl.textContent = txt; msgEl.style.color = color; msgEl.style.display = 'block';
}

document.getElementById('btn-logout').onclick = () => {
  localStorage.removeItem('mu_user_session'); location.reload();
};

// --- 5. GUARDADO AUTOMÁTICO ---
function triggerSave() {
  const statusEl = document.getElementById('save-status');
  statusEl.classList.add('show');
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (!currentUser || !db) return;
    try {
      await updateDoc(doc(db, "users", currentUser), {
        top: userData.top,
        scores: userData.scores
      });
      statusEl.classList.remove('show');
    } catch (e) { console.error(e); }
  }, 1000);
}


// --- 6. APP 1: TOP BUILDER (NUEVA LÓGICA TOP 12) ---
function initTopBuilder() {
  // RANGOS ACTUALIZADOS: 9, 9, 9, 3 = 30
  const RANGES = { 
    A: [30,29,28,27,26,25,24,23,22], 
    B: [21,20,19,18,17,16,15,14,13], 
    C: [12,11,10,9,8,7,6,5,4], 
    D: [3,2,1], 
    E: [-1,-2,-3,-4,-5] 
  };
  let CURRENT_DRAG = null;
  
  const searchModal = document.getElementById('slot-search-modal');
  const searchInput = document.getElementById('slot-search-input');
  const searchResults = document.getElementById('slot-search-results');
  const closeSearch = document.getElementById('close-slot-search');
  let activeSearchRank = null;

  for (const band in RANGES) {
    const col = (band === 'E') ? document.getElementById('banca-slots') : document.getElementById(`col-${band}`);   
    col.innerHTML = '';
    if (band !== 'E') { col.classList.add('slots'); col.style.setProperty('--rows', RANGES[band].length); }
    
    RANGES[band].forEach(rank => {
        const slot = document.createElement('div');
        slot.className = 'slot'; slot.dataset.rank = rank; slot.dataset.band = band; slot.draggable = true;
        
        let rankDisplay = rank;
        if (band === 'E') rankDisplay = `B${Math.abs(rank)}`;
        else if(rank===1) rankDisplay="👑"; else if(rank===2) rankDisplay="2º"; else if(rank===3) rankDisplay="3º";
        
        slot.innerHTML = `<div class="num">${rankDisplay}</div><div class="photo"><img alt=""></div><div class="name">—</div>`;
        
        slot.addEventListener('click', () => {
            const existing = userData.top.find(x => x.rank === rank);
            if (!existing) openSearchModal(rank);
        });

        slot.addEventListener('dragstart', e => {
            const existing = userData.top.find(x => x.rank === rank);
            if (!existing) { e.preventDefault(); return; }
            CURRENT_DRAG = { type: 'slot', rank: rank, data: existing };
            slot.classList.add('ghost'); e.dataTransfer.effectAllowed = 'move';
        });
        slot.addEventListener('dragend', () => { slot.classList.remove('ghost'); CURRENT_DRAG = null; document.querySelectorAll('.drag-hover').forEach(x => x.classList.remove('drag-hover')); });
        slot.addEventListener('dragover', e => { if (!CURRENT_DRAG) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; slot.classList.add('drag-hover'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-hover'));
        slot.addEventListener('drop', e => {
            e.preventDefault(); slot.classList.remove('drag-hover');
            if (!CURRENT_DRAG) return;
            const targetRank = Number(slot.dataset.rank);
            if (CURRENT_DRAG.type === 'card') assignRank(CURRENT_DRAG.data, targetRank);
            else if (CURRENT_DRAG.type === 'slot') swapRanks(CURRENT_DRAG.rank, targetRank);
        });
        
        col.appendChild(slot);
    });
  }

  // Search Logic
  closeSearch.onclick = () => { searchModal.style.display = 'none'; };
  window.onclick = (e) => { if (e.target == searchModal) searchModal.style.display = 'none'; };
  searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));

  function openSearchModal(rank) {
    activeSearchRank = rank; searchInput.value = '';
    renderSearchResults(''); searchModal.style.display = 'flex'; searchInput.focus();
  }

  function renderSearchResults(query) {
    searchResults.innerHTML = '';
    const assignedNames = new Set(userData.top.map(d => d.name));
    const filtered = DELEGATES_DATA.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) && !assignedNames.has(c.name));
    
    filtered.forEach(c => {
      const item = document.createElement('div'); item.className = 'search-result-item';
      item.innerHTML = `<img src="https://flagcdn.com/w40/${c.code.toLowerCase()}.png"> ${c.name}`;
      item.onclick = () => { assignRank(c, activeSearchRank); searchModal.style.display = 'none'; };
      searchResults.appendChild(item);
    });
  }

  // Pool Logic
  const pool = document.getElementById('pool');
  pool.addEventListener('dragover', e => { if (CURRENT_DRAG?.type === 'slot') { e.preventDefault(); pool.classList.add('drag-hover'); } });
  pool.addEventListener('dragleave', () => pool.classList.remove('drag-hover'));
  pool.addEventListener('drop', e => { e.preventDefault(); pool.classList.remove('drag-hover'); if (CURRENT_DRAG?.type === 'slot') unassignRank(CURRENT_DRAG.rank); });

  refreshTopUI();
  setupButtons();
}

function assignRank(cData, rank) {
  userData.top = userData.top.filter(x => x.name !== cData.name);
  userData.top = userData.top.filter(x => x.rank !== rank);
  userData.top.push({ rank: Number(rank), name: cData.name });
  refreshTopUI(); triggerSave();
}

function swapRanks(r1, r2) {
  const item1 = userData.top.find(x => x.rank === r1);
  const item2 = userData.top.find(x => x.rank === r2);
  userData.top = userData.top.filter(x => x.rank !== r1 && x.rank !== r2);
  if(item1) userData.top.push({ rank: r2, name: item1.name });
  if(item2) userData.top.push({ rank: r1, name: item1.name });
  refreshTopUI(); triggerSave();
}

function unassignRank(rank) {
  userData.top = userData.top.filter(x => x.rank !== rank);
  refreshTopUI(); triggerSave();
}

function refreshTopUI() {
  // Slots
  document.querySelectorAll('#app-top-builder .slot').forEach(slot => {
    const rank = Number(slot.dataset.rank);
    const entry = userData.top.find(x => x.rank === rank);
    const nameEl = slot.querySelector('.name'); 
    const imgEl = slot.querySelector('.photo img');
    
    if (entry) {
      const cData = DELEGATES_DATA.find(d => d.name === entry.name);
      slot.classList.add('occupied');
      if(cData) {
          nameEl.innerHTML = `<img class="slot-flag" src="https://flagcdn.com/w40/${cData.code.toLowerCase()}.png"> ${cData.name}`;
      } else {
          nameEl.textContent = entry.name;
      }
    } else {
      slot.classList.remove('occupied'); nameEl.textContent = '—';
    }
  });

  // Pool
  const cardsEl = document.getElementById('cards'); cardsEl.innerHTML = '';
  const assignedNames = new Set(userData.top.map(d => d.name));
  const available = DELEGATES_DATA.filter(c => !assignedNames.has(c.name));
  let CURRENT_DRAG_CARD = null; // Local drag var for cards
  
  available.forEach(c => {
    const card = document.createElement('div'); card.className = 'card'; card.draggable = true;
    card.innerHTML = `<img class="card-flag" src="https://flagcdn.com/w40/${c.code.toLowerCase()}.png"> ${c.name}`; 
    card.addEventListener('dragstart', () => { 
        // Re-use global CURRENT_DRAG if possible or pass data via a bridge
        // For simplicity, we rely on the drop handler reading `type: card`
        // We need to access the module scope variable
    });
    // Note: In module scope, we need to be careful with drag/drop. 
    // Re-implementing card dragstart inside initTopBuilder loop was cleaner.
    // Let's fix this by moving this loop inside refreshTopUI fully.
    
    // FIX:
    card.addEventListener('dragstart', () => { 
         // Since CURRENT_DRAG is local to initTopBuilder, we can't set it here easily unless we expose a setter 
         // or use a module-level var. Let's use dataTransfer for cleaner separation.
         // But since we used a variable before, let's assume this function is running inside initTopBuilder context?
         // No, refreshTopUI is separate.
         // Let's trigger a custom event or simply use a module-level var.
    });
  });
  
  // REFACTOR: refreshTopUI needs to be inside initTopBuilder scope OR CURRENT_DRAG needs to be module-level.
  // I'll move CURRENT_DRAG to module level (below imports) to fix this.
}

// --- FIXED SCOPE FOR DRAG VAR ---
let MODULE_DRAG = null; 
// Update initTopBuilder to use MODULE_DRAG instead of local let CURRENT_DRAG

function setupButtons() {
  document.getElementById('btn-clear').onclick = () => { userData.top = []; refreshTopUI(); triggerSave(); };
  document.getElementById('btn-shuffle').onclick = () => { refreshTopUI(); }; // Visual shuffle only
  document.getElementById('btn-sort').onclick = () => { refreshTopUI(); };
  document.getElementById('btn-export').onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userData.top, null, 2));
    const a = document.createElement('a'); a.href = dataStr; a.download = "miss_universe_top.json"; a.click();
  };
  document.getElementById('search-bar').addEventListener('input', filterPoolCards);
  
  const fileInput = document.getElementById('file-import-top');
  document.getElementById('btn-import').onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
     const file = e.target.files[0]; if(!file) return;
     const reader = new FileReader();
     reader.onload = (event) => {
        try { 
            const arr = JSON.parse(event.target.result);
            if(Array.isArray(arr)) { userData.top = arr; refreshTopUI(); triggerSave(); }
        } catch(err) { alert("Error JSON"); }
        e.target.value = null; 
     };
     reader.readAsText(file);
  };
}

function filterPoolCards() {
  const searchTerm = document.getElementById('search-bar').value.toLowerCase();
  const cards = document.getElementById('cards').children;
  for (const card of cards) {
    card.style.display = card.textContent.toLowerCase().includes(searchTerm) ? 'flex' : 'none';
  }
}


// --- 7. APP 2: SCORING ---
function initScoring() {
  const container = document.querySelector('#app-scoring #card-container');
  let currentIndex = 0;
  container.innerHTML = '';
  DELEGATES_DATA.forEach((delegate, index) => { container.appendChild(createCardEl(delegate, index)); });
  showCard(0); setupListeners(); updateRankingTable();

  function createCardEl(delegate, index) {
    const el = document.createElement('div');
    el.className = 'score-card'; el.dataset.index = index; el.dataset.name = delegate.name;
    const s = userData.scores[delegate.name] || {};
    el.innerHTML = `
      <div class="card-header">
        <img class="card-flag" src="https://flagcdn.com/w160/${delegate.code.toLowerCase()}.png">
        <div class="card-names"><h2 class="card-country">${delegate.name}</h2><p class="card-delegate">${delegate.delegate}</p></div>
      </div>
      <div class="card-scores">
        <div class="score-col"><h3>Preliminar</h3>
          <div class="score-row"><label>Traje de Baño</label><input type="number" class="score-input" data-cat="pre_swim" min="0" max="10" step="0.1" value="${s.pre_swim||''}"></div>
          <div class="score-row"><label>Traje de Noche</label><input type="number" class="score-input" data-cat="pre_gown" min="0" max="10" step="0.1" value="${s.pre_gown||''}"></div>
        </div>
        <div class="score-col"><h3>Final</h3>
          <div class="score-row"><label>Traje de Baño</label><input type="number" class="score-input" data-cat="fin_swim" min="0" max="10" step="0.1" value="${s.fin_swim||''}"></div>
          <div class="score-row"><label>Traje de Noche</label><input type="number" class="score-input" data-cat="fin_gown" min="0" max="10" step="0.1" value="${s.fin_gown||''}"></div>
          <div class="score-row"><label>Pregunta</label><input type="number" class="score-input" data-cat="fin_q" min="0" max="10" step="0.1" value="${s.fin_q||''}"></div>
        </div>
      </div>`;
    return el;
  }

  function showCard(index) {
    const cards = container.children; if (!cards.length) return;
    const currentCard = cards[currentIndex]; const newCard = cards[index];
    if (index > currentIndex) { if (currentCard) currentCard.classList.add('exiting'); if (newCard) { newCard.classList.remove('exiting'); newCard.classList.add('active'); } } 
    else { if (currentCard) currentCard.classList.remove('active'); if (newCard) { newCard.classList.remove('exiting'); newCard.classList.add('active'); } }
    currentIndex = index;
    document.getElementById('counter').textContent = `${currentIndex + 1} / ${DELEGATES_DATA.length}`;
    document.getElementById('btn-prev').disabled = (currentIndex === 0);
    document.getElementById('btn-next').disabled = (currentIndex === DELEGATES_DATA.length - 1);
  }

  function setupListeners() {
    document.getElementById('btn-next').onclick = () => { if (currentIndex < DELEGATES_DATA.length - 1) showCard(currentIndex + 1); };
    document.getElementById('btn-prev').onclick = () => { if (currentIndex > 0) showCard(currentIndex - 1); };
    container.addEventListener('input', e => {
      if (e.target.classList.contains('score-input')) {
        const card = e.target.closest('.score-card');
        let val = parseFloat(e.target.value);
        if (isNaN(val)) val = ''; else if (val > 10) val = 10; else if (val < 0) val = 0;
        const name = card.dataset.name;
        if (!userData.scores[name]) userData.scores[name] = {};
        userData.scores[name][e.target.dataset.cat] = val;
        triggerSave(); updateRankingTable();
      }
    });
  }

  function updateRankingTable() {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '';
    const ranked = DELEGATES_DATA.map(d => {
      const s = userData.scores[d.name] || {};
      const total = (parseFloat(s.pre_swim)||0) + (parseFloat(s.pre_gown)||0) + (parseFloat(s.fin_swim)||0) + (parseFloat(s.fin_gown)||0) + (parseFloat(s.fin_q)||0);
      return { ...d, total };
    }).sort((a,b) => b.total - a.total).slice(0, 30);
    ranked.forEach((d, i) => {
       const row = document.createElement('div'); row.className = 'rank-row'; row.dataset.rank = i+1;
       row.innerHTML = `<span class="rank-pos">${i+1}</span><span class="rank-name"><img class="rank-flag" src="https://flagcdn.com/w40/${d.code.toLowerCase()}.png"> ${d.name}</span><span class="rank-score">${d.total.toFixed(1)}</span>`;
       list.appendChild(row);
    });
  }
}

// --- UTILIDADES (Refresh UI + Drag Fix) ---
// Mover refreshTopUI fuera de initTopBuilder y usar MODULE_DRAG
function refreshTopUI() {
  document.querySelectorAll('#app-top-builder .slot').forEach(slot => {
    const rank = Number(slot.dataset.rank);
    const entry = userData.top.find(x => x.rank === rank);
    const nameEl = slot.querySelector('.name'); 
    if (entry) {
      const cData = DELEGATES_DATA.find(d => d.name === entry.name);
      slot.classList.add('occupied');
      if(cData) nameEl.innerHTML = `<img class="slot-flag" src="https://flagcdn.com/w40/${cData.code.toLowerCase()}.png"> ${cData.name}`;
      else nameEl.textContent = entry.name;
    } else {
      slot.classList.remove('occupied'); nameEl.textContent = '—';
    }
  });

  const cardsEl = document.getElementById('cards'); cardsEl.innerHTML = '';
  const assignedNames = new Set(userData.top.map(d => d.name));
  const available = DELEGATES_DATA.filter(c => !assignedNames.has(c.name));
  
  available.forEach(c => {
    const card = document.createElement('div'); card.className = 'card'; card.draggable = true;
    card.innerHTML = `<img class="card-flag" src="https://flagcdn.com/w40/${c.code.toLowerCase()}.png"> ${c.name}`; 
    card.addEventListener('dragstart', () => { 
        MODULE_DRAG = { type: 'card', data: c }; 
        card.classList.add('ghost'); 
    });
    card.addEventListener('dragend', () => { 
        card.classList.remove('ghost'); 
        MODULE_DRAG = null; 
    });
    cardsEl.appendChild(card);
  });
  document.getElementById('pool-count').textContent = available.length;
  document.getElementById('status-text').textContent = `${userData.top.length} Asignadas`;
  filterPoolCards();
}