// index.js — updated: more reliable celebration (audio resume + confetti ctx check)

// ----------------------- Elements -----------------------
const textEl = document.getElementById('text');
const input = document.getElementById('input');
const timerEl = document.getElementById('timer');
const resultEl = document.getElementById('result');
const progressEl = document.getElementById('progress');
const liveWpmEl = document.getElementById('liveWpm');
const liveAccEl = document.getElementById('liveAcc');
const mistakesEl = document.getElementById('mistakes');
const bestWpmEl = document.getElementById('bestWpm');
const charCountEl = document.getElementById('charCount');
const leaderboardList = document.getElementById('leaderboardList');
const clearLeaderboardBtn = document.getElementById('clearLeaderboard');
const exportLeaderboardBtn = document.getElementById('exportLeaderboard');
const keyboardEl = document.getElementById('keyboard');
const restartBtn = document.getElementById('restart');
const nextBtn = document.getElementById('next');
const difficultySelect = document.getElementById('difficulty');
const themeToggle = document.getElementById('themeToggle');
const handEl = document.getElementById('hand');
const confettiCanvas = document.getElementById('confettiCanvas');

// ----------------------- Config / State -----------------------
const SENTENCES = {
  short: ["JavaScript rocks!", "Type fast, stay sharp.", "Practice daily."],
  medium: [
    "JavaScript makes typing tests fun!",
    "Practice every day to improve your typing speed.",
    "Coding challenges help sharpen your problem solving skills.",
    "Frontend development combines logic and creativity.",
    "Learning never stops in the world of technology."
  ],
  long: [
    "Consistent practice and mindful repetition are the most reliable ways to increase both typing speed and accuracy over time.",
    "When you focus on proper technique and avoid looking at the keyboard, your fingers learn the layout naturally and your speed improves.",
    "Building projects and typing real code or text will train your brain to type patterns common to programming and technical writing."
  ]
};

const KEY_LAYOUT = [
  ['`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace'],
  ['Tab','q','w','e','r','t','y','u','i','o','p','[',']','\\'],
  ['Caps','a','s','d','f','g','h','j','k','l',';','\'','Enter'],
  ['Shift','z','x','c','v','b','n','m',',','.','/','Shift'],
  ['Space']
];

let sentence = '';
let spans = [];
let startTime = null;
let finished = false;
let liveTimerInterval = null;
let currentDifficulty = difficultySelect ? difficultySelect.value : 'medium';
const BEST_KEY = 'typing_best_wpm_v2';
const LEADER_KEY = 'typing_leaderboard_v2';
const THEME_KEY = 'typing_theme_v1';

// ----------------------- Audio (WebAudio synth) -----------------------
let audioCtx;
try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ audioCtx = null; }

function playClick() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(800, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.2);
  } catch (e) { /* ignore */ }
}

function playWin() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    [880, 1100, 1320, 1760].forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, now + i * 0.08);
      g.gain.setValueAtTime(0.0001, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.28);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + i * 0.08); o.stop(now + i * 0.08 + 0.35);
    });
  } catch (e) {}
}

// ----------------------- Helpers -----------------------
function sampleSentence(diff) {
  const arr = SENTENCES[diff] || SENTENCES.medium;
  return arr[Math.floor(Math.random()*arr.length)];
}

function renderSentence(s) {
  textEl.innerHTML = '';
  s.split('').forEach(ch => {
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? ' ' : ch;
    textEl.appendChild(span);
  });
  spans = Array.from(textEl.querySelectorAll('span'));
  if (charCountEl) charCountEl.textContent = spans.length;
  refreshCaret(0);
}

function refreshCaret(index) {
  spans.forEach(s => s.classList.remove('current'));
  const idx = Math.max(0, Math.min(index, spans.length - 1));
  if (spans[idx]) spans[idx].classList.add('current');
}

function resetState() {
  currentDifficulty = difficultySelect ? difficultySelect.value : 'medium';
  sentence = sampleSentence(currentDifficulty);
  renderSentence(sentence);
  if (input) input.value = '';
  if (input) input.disabled = false; // ensure enabled
  startTime = null;
  finished = false;
  if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }
  if (timerEl) timerEl.textContent = '0.0s';
  if (resultEl) resultEl.textContent = 'Not started yet.';
  if (liveWpmEl) liveWpmEl.textContent = '0';
  if (liveAccEl) liveAccEl.textContent = '100%';
  if (mistakesEl) mistakesEl.textContent = '0';
  if (progressEl) progressEl.style.width = '0%';
  input && input.focus();
}

function computeStats() {
  const typed = input.value.split('');
  let correctChars = 0;
  let mistakes = 0;
  spans.forEach((span, i) => {
    const ch = typed[i];
    if (ch == null) { span.classList.remove('correct','wrong'); }
    else if (ch === span.textContent) { span.classList.add('correct'); span.classList.remove('wrong'); correctChars++; }
    else { span.classList.add('wrong'); span.classList.remove('correct'); mistakes++; }
  });
  const extraTyped = Math.max(0, typed.length - spans.length);
  if (extraTyped > 0) mistakes += extraTyped;
  const typedChars = typed.length || 0;
  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0.0001;
  const wpm = Math.round((correctChars / 5) * (60 / elapsed)) || 0;
  const accuracy = typedChars === 0 ? 100 : Math.round((correctChars / typedChars) * 100);
  if (liveWpmEl) liveWpmEl.textContent = wpm;
  if (liveAccEl) liveAccEl.textContent = `${accuracy}%`;
  if (mistakesEl) mistakesEl.textContent = mistakes;
  if (progressEl) progressEl.style.width = Math.min(100, Math.round((typedChars / spans.length) * 100)) + '%';
  refreshCaret(typedChars);
  return { typedChars, correctChars, mistakes, elapsed, wpm, accuracy };
}

// ----------------------- Confetti (robust) -----------------------
function resizeConfetti(){
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function confettiBurst(){
  if (!confettiCanvas) return;
  const ctx = confettiCanvas.getContext ? confettiCanvas.getContext('2d') : null;
  if (!ctx) return;
  resizeConfetti();

  const pieces = [];
  const colors = ['#ef476f','#ffd166','#06d6a0','#118ab2','#073b4c','#7c3aed'];
  for(let i=0;i<120;i++){
    pieces.push({
      x: Math.random()*confettiCanvas.width,
      y: Math.random()*-confettiCanvas.height,
      vx: (Math.random()-0.5)*6,
      vy: 2 + Math.random()*6,
      size: 6 + Math.random()*8,
      color: colors[Math.floor(Math.random()*colors.length)],
      rot: Math.random()*360,
      spin: (Math.random()-0.5)*8
    });
  }
  let t = 0;
  const anim = () => {
    t++;
    ctx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
    pieces.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    if (t < 200) requestAnimationFrame(anim);
    else ctx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
  };
  anim();
}
window.addEventListener('resize', resizeConfetti);

// ----------------------- Theme: cycle light -> dark -> colorful -----------------------
const THEME_ORDER = ['light','dark','colorful'];

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle && themeToggle.setAttribute('aria-pressed','true');
    themeToggle && (themeToggle.title = 'Theme: Dark — click to change');
  } else if (theme === 'colorful') {
    document.documentElement.setAttribute('data-theme', 'colorful');
    themeToggle && themeToggle.setAttribute('aria-pressed','true');
    themeToggle && (themeToggle.title = 'Theme: Colorful — click to change');
  } else {
    // light = default (remove attribute)
    document.documentElement.removeAttribute('data-theme');
    themeToggle && themeToggle.setAttribute('aria-pressed','false');
    themeToggle && (themeToggle.title = 'Theme: Light — click to change');
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch(e) {}
}

themeToggle && themeToggle.addEventListener('click', ()=>{
  const current = localStorage.getItem(THEME_KEY) || 'light';
  const idx = THEME_ORDER.indexOf(current);
  const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
  applyTheme(next);
});

// ----------------------- Updated finishIfComplete (reliable celebration) -----------------------
function finishIfComplete(stats) {
  // stats contains: typedChars, correctChars, mistakes, elapsed, wpm, accuracy
  const typedChars = stats.typedChars;
  const correctChars = stats.correctChars;

  // Finish when the user has typed at least as many characters as the sentence
  if (!finished && startTime !== null && typedChars >= spans.length) {
    finished = true;

    // disable input and stop the live timer
    if (input) input.disabled = true;
    if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }

    const timeTaken = stats.elapsed;
    const wpm = stats.wpm;
    const accuracy = stats.accuracy;
    const mistakes = stats.mistakes;

    if (resultEl) {
      resultEl.innerHTML = `✅ Completed! Time: <strong>${timeTaken.toFixed(1)}s</strong><br>
        Speed: <strong>${wpm}</strong> WPM<br>
        Accuracy: <strong>${accuracy}%</strong><br>
        Mistakes: <strong>${mistakes}</strong>`;
    }

    // save and record
    saveBestWpm(wpm);
    addLeaderboardEntry({ wpm, accuracy, time: timeTaken, date: new Date().toISOString() });

    // detect perfect run using stats
    const isPerfect = (correctChars === spans.length);

    // run celebration after a short delay to avoid timing races and allow audio resume
    setTimeout(() => {
      // try to resume audio if suspended (some browsers require resume on user gesture)
      if (audioCtx && typeof audioCtx.resume === 'function' && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(()=>{/* ignore */});
      }

      if (isPerfect) {
        try { playWin(); } catch (e) { /* ignore */ }
        try { confettiBurst(); } catch (e) { /* ignore */ }
      } else {
        // mild feedback optional
      }
    }, 60);
  }
}

// ----------------------- Leaderboard -----------------------
function loadLeaderboard(){ try{ const raw = localStorage.getItem(LEADER_KEY); return raw ? JSON.parse(raw) : []; }catch(e){return [];} }
function saveLeaderboard(list){ localStorage.setItem(LEADER_KEY, JSON.stringify(list)); }
function addLeaderboardEntry(entry){
  const list = loadLeaderboard();
  list.push(entry);
  list.sort((a,b)=> b.wpm - a.wpm || (new Date(b.date)-new Date(a.date)));
  const trimmed = list.slice(0,50);
  saveLeaderboard(trimmed);
  renderLeaderboard();
}
function renderLeaderboard(){
  const list = loadLeaderboard();
  if (!leaderboardList) return;
  leaderboardList.innerHTML = '';
  if (list.length === 0){ leaderboardList.innerHTML = '<li class="small">No runs yet — complete a sentence to add your score.</li>'; return; }
  list.slice(0,10).forEach(item=>{
    const li = document.createElement('li');
    const d = new Date(item.date);
    li.innerHTML = `<strong>${item.wpm} WPM</strong> — ${item.accuracy}% — <span class="small">${d.toLocaleString()}</span>`;
    leaderboardList.appendChild(li);
  });
}
clearLeaderboardBtn && clearLeaderboardBtn.addEventListener('click', ()=>{
  if (confirm('Clear local leaderboard? This cannot be undone.')){ localStorage.removeItem(LEADER_KEY); renderLeaderboard(); }
});
exportLeaderboardBtn && exportLeaderboardBtn.addEventListener('click', ()=>{
  const list = loadLeaderboard();
  const blob = new Blob([JSON.stringify(list, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'leaderboard.json'; a.click();
  URL.revokeObjectURL(url);
});

// ----------------------- Keyboard UI -----------------------
function buildKeyboard(){
  if (!keyboardEl) return;
  keyboardEl.innerHTML = '';
  KEY_LAYOUT.forEach(row=>{
    const r = document.createElement('div'); r.className = 'krow';
    row.forEach(key=>{
      const k = document.createElement('div'); k.className = 'key';
      const low = key.toLowerCase();
      if (key === 'Space'){ k.classList.add('space'); k.dataset.key = 'space'; k.textContent = 'SPACE'; k.style.minWidth = '320px'; }
      else { k.dataset.key = low; k.textContent = key; if (key.length > 1) k.classList.add('wide'); }
      r.appendChild(k);
    });
    keyboardEl.appendChild(r);
  });
}

function highlightKeyForChar(ch){
  if (!keyboardEl) return;
  const key = (ch === ' ') ? 'space' : ch.toLowerCase();
  const el = keyboardEl.querySelector(`.key[data-key="${CSS.escape(key)}"]`);
  if (el){
    el.classList.add('active','pulse');
    setTimeout(()=> el.classList.remove('active','pulse'), 160);
  }
  moveHandToKey(key);
}

function moveHandToKey(key){
  if (!handEl || !keyboardEl) return;
  const el = keyboardEl.querySelector(`.key[data-key="${CSS.escape(key)}"]`);
  if (!el) { handEl.style.opacity = '0'; return; }
  const rect = el.getBoundingClientRect();
  const parentRect = keyboardEl.getBoundingClientRect();
  const x = rect.left - parentRect.left + rect.width + 8;
  const y = rect.top - parentRect.top - 8;
  handEl.style.transform = `translate(${x}px, ${y}px) rotate(-12deg)`;
  handEl.style.opacity = '1';
  setTimeout(()=> handEl.style.opacity = '0.6', 500);
}

// highlight physical keyboard presses
window.addEventListener('keydown', (e)=>{
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
  const el = keyboardEl && keyboardEl.querySelector(`.key[data-key="${CSS.escape(k)}"]`);
  if (el) el.classList.add('active');
});
window.addEventListener('keyup', (e)=>{
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
  const el = keyboardEl && keyboardEl.querySelector(`.key[data-key="${CSS.escape(k)}"]`);
  if (el) el.classList.remove('active');
});

// ----------------------- Events -----------------------
input && input.addEventListener('input', (e)=>{
  if (finished) return;
  if (!startTime && input.value.length > 0){
    startTime = Date.now();
    liveTimerInterval = setInterval(()=>{
      const t = (Date.now() - startTime)/1000;
      if (timerEl) timerEl.textContent = t.toFixed(1) + 's';
    }, 100);
  }
  const typed = input.value;
  if (typed.length > 0) {
    const last = typed[typed.length-1];
    playClick(); // key sound (if allowed by browser)
    highlightKeyForChar(last);
  }
  const stats = computeStats();
  if (startTime && timerEl) timerEl.textContent = stats.elapsed.toFixed(1) + 's';
  finishIfComplete(stats);
});

// Enter inside input -> next sentence
input && input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nextBtn && nextBtn.click();
  }
});

restartBtn && restartBtn.addEventListener('click', ()=> resetState());
nextBtn && nextBtn.addEventListener('click', ()=>{
  sentence = sampleSentence(currentDifficulty);
  renderSentence(sentence);

  if (input) { input.value = ''; input.disabled = false; }
  startTime = null;
  finished = false;

  if (timerEl) timerEl.textContent='0.0s';
  if (resultEl) resultEl.textContent = 'New sentence loaded. Start typing!';
  if (liveWpmEl) liveWpmEl.textContent='0'; if (liveAccEl) liveAccEl.textContent='100%'; if (mistakesEl) mistakesEl.textContent='0';
  if (progressEl) progressEl.style.width='0%';
  if (liveTimerInterval){ clearInterval(liveTimerInterval); liveTimerInterval=null; }
  input && input.focus();
});
difficultySelect && difficultySelect.addEventListener('change', (e)=>{ currentDifficulty = e.target.value; resetState(); });

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='r'){ e.preventDefault(); resetState(); }
  else if (e.key === 'Enter'){ e.preventDefault(); nextBtn && nextBtn.click(); }
});

// ----------------------- Init -----------------------
function init(){
  buildKeyboard();
  loadBestWpm();
  renderLeaderboard();
  const storedTheme = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(storedTheme);
  resetState();
}
init();

// ----------------------- Utils left as-is (save/load best etc.) -----------------------
function saveBestWpm(wpm) {
  if (!wpm || wpm <= 0) return;
  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  if (wpm > best) {
    localStorage.setItem(BEST_KEY, String(wpm));
    if (bestWpmEl) bestWpmEl.textContent = `${wpm} ✨`;
  } else { if (bestWpmEl) bestWpmEl.textContent = best ? String(best) : '—'; }
}
function loadBestWpm(){ const best = parseInt(localStorage.getItem(BEST_KEY) || '0',10); if (bestWpmEl) bestWpmEl.textContent = best ? String(best) : '—'; }
function loadLeaderboard(){ try{ const raw = localStorage.getItem(LEADER_KEY); return raw ? JSON.parse(raw) : []; }catch(e){return [];} }
function saveLeaderboard(list){ localStorage.setItem(LEADER_KEY, JSON.stringify(list)); }
