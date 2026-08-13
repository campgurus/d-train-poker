const POSITIONS = ["UTG","HJ","CO","BTN","SB"];
const POSITIONS_OPEN_HERO = ["HJ","CO","BTN","SB"];
const ORDER_FULL = ["UTG","HJ","CO","BTN","SB"];
const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];

function validOpeners(hero){
  const i = ORDER_FULL.indexOf(hero);
  return ORDER_FULL.slice(0, i);
}
function allPossibleOpeners(){ return ["UTG","HJ","CO","BTN"]; }

let RAW_DATA = null;

let state = {
  profile: null,
  mode: "RFI",
  posFilter: "ALL",
  heroFilter: "ALL",
  focusWeak: false,
  activeTab: "quiz",
  currentQ: null,
  streakCorrect: 0,
  sessionCorrect: 0,
  sessionTotal: 0,
  progress: {}
};

const root = document.getElementById('root');

// ---------- storage (localStorage, namespaced per profile) ----------
const PROFILES_KEY = 'nlh_profiles';
const ACTIVE_PROFILE_KEY = 'nlh_active_profile';

function progressKey(profile){ return 'nlh_progress:' + profile; }

function getKnownProfiles(){
  try{ return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); }
  catch(e){ return []; }
}
function rememberProfile(name){
  const list = getKnownProfiles();
  if(!list.includes(name)){ list.push(name); localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); }
}
function loadProgress(profile){
  try{
    const raw = localStorage.getItem(progressKey(profile));
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveProgress(){
  try{
    localStorage.setItem(progressKey(state.profile), JSON.stringify(state.progress));
  }catch(e){ console.error('Storage error', e); }
}

function keyFor(mode,pos,hand){ return mode+':'+pos+':'+hand; }
function cellsFor(mode,pos){
  if(mode==='OPEN'){
    const [hero,vs] = pos.split('|');
    return RAW_DATA.OPEN[hero][vs];
  }
  return RAW_DATA[mode][pos];
}
function allHandsForPos(mode,pos){ return Object.keys(cellsFor(mode,pos)); }
function isMastered(p){ return p && p.streak>=3; }

function getPool(mode){
  if(mode !== 'OPEN'){
    return state.posFilter === "ALL" ? POSITIONS.slice() : [state.posFilter];
  }
  const heroes = state.heroFilter === "ALL" ? POSITIONS_OPEN_HERO.slice() : [state.heroFilter];
  let pool = [];
  heroes.forEach(hero=>{
    const validVs = validOpeners(hero);
    const vsList = (state.posFilter === "ALL" || !validVs.includes(state.posFilter)) ? validVs : [state.posFilter];
    vsList.forEach(vs=> pool.push(hero+'|'+vs));
  });
  return pool;
}
function displayPosLabel(mode,pos){
  if(mode==='OPEN'){
    const [hero,vs] = pos.split('|');
    return hero+' vs '+vs;
  }
  return pos;
}

// ---------- weighted picking ----------
function pickQuestion(){
  const mode = state.mode;
  const pool = getPool(mode);
  let candidates = [];
  pool.forEach(pos=>{
    allHandsForPos(mode,pos).forEach(hand=>{
      const k = keyFor(mode,pos,hand);
      const p = state.progress[k] || {streak:0,correct:0,total:0};
      let weight;
      if(p.total === 0) weight = 10;
      else if(p.streak >= 3) weight = 1;
      else if(p.streak === 0) weight = 8;
      else weight = 5;
      candidates.push({mode,pos,hand,weight,attempted:p.total>0,mastered:isMastered(p)});
    });
  });
  if(state.focusWeak){
    const weakOnly = candidates.filter(c=>c.attempted && !c.mastered);
    if(weakOnly.length>0) candidates = weakOnly;
  }
  const totalWeight = candidates.reduce((s,c)=>s+c.weight,0);
  let r = Math.random()*totalWeight;
  for(const c of candidates){
    r -= c.weight;
    if(r<=0) return c;
  }
  return candidates[candidates.length-1];
}

function parseHand(hand){
  if(hand.length===2) return {c1:hand[0],c2:hand[1],type:'pair'};
  return {c1:hand[0],c2:hand[1],type:hand[2]==='s'?'suited':'offsuit'};
}
function renderCards(hand){
  const h = parseHand(hand);
  let s1,s2;
  if(h.type==='pair'){ s1='\u2660'; s2='\u2665'; }
  else if(h.type==='suited'){ s1=s2='\u2660'; }
  else { s1='\u2660'; s2='\u2665'; }
  const redSuit = (s)=> (s==='\u2665'||s==='\u2666');
  return '<div class="quiz-hand">'
      + '<div class="card '+(redSuit(s1)?'red':'')+'">'+h.c1+'<div style="font-size:16px;">'+s1+'</div></div>'
      + '<div class="card '+(redSuit(s2)?'red':'')+'">'+h.c2+'<div style="font-size:16px;">'+s2+'</div></div>'
      + '</div>';
}
function formatHandName(hand){
  const h = parseHand(hand);
  if(h.type==='pair') return hand[0]+hand[1]+' (pair)';
  if(h.type==='suited') return h.c1+h.c2+' suited';
  return h.c1+h.c2+' offsuit';
}
function actionsFor(mode,pos){
  if(mode==='RFI'){
    if(pos==='SB') return [{key:'call',label:'Limp',cls:'call'},{key:'raise',label:'Raise',cls:'raise'},{key:'fold',label:'Fold',cls:'fold'}];
    return [{key:'raise',label:'Raise',cls:'raise'},{key:'fold',label:'Fold',cls:'fold'}];
  }
  return [{key:'raise',label:'3-Bet',cls:'raise'},{key:'call',label:'Call',cls:'call'},{key:'fold',label:'Fold',cls:'fold'}];
}
function contextLabel(q){
  if(q.mode==='RFI') return q.pos + ' RFI';
  if(q.mode==='OPEN'){
    const [hero,vs] = q.pos.split('|');
    return hero + ' facing ' + vs + ' open';
  }
  return 'BB defending vs ' + q.pos + ' open';
}
function labelFor(key){
  if(key==='raise') return 'Raise';
  if(key==='call') return 'Call';
  if(key==='fold') return 'Fold';
  return key;
}
function statusFor(mode,pos,hand){
  const k = keyFor(mode,pos,hand);
  const p = state.progress[k];
  if(!p || p.total===0) return {cls:'rfi-status-new', label:'New'};
  if(isMastered(p)) return {cls:'rfi-status-mastered', label:'Mastered'};
  return {cls:'rfi-status-learning', label:'Learning'};
}

// ---------- rule of thumb (shown on misses) ----------
const POS_RFI_NOTE = {
  UTG: "UTG has the most players left to act behind it, so opens stay tight and high-equity.",
  HJ: "HJ is still fairly early with four players behind, so the range stays fairly disciplined.",
  CO: "CO only has BTN and the blinds left to act, so opens widen noticeably.",
  BTN: "BTN acts last preflop, so it opens the widest range of any seat.",
  SB: "SB only has to get through BB, so it can open (or limp) a very wide range despite being out of position for the rest of the hand."
};
const POS_BB_NOTE = {
  UTG: "UTG's opening range is tight and strong, so BB needs a real hand to continue \u2014 defend narrow here.",
  HJ: "HJ opens are still fairly strong, so BB should stay somewhat selective defending.",
  CO: "CO opens are wider and weaker on average, so BB can defend a noticeably wider range.",
  BTN: "BTN opens the widest range of any seat, so BB should defend very wide in return.",
  SB: "SB's open is wide, but SB is out of position for the rest of the hand, so BB can defend aggressively, especially with hands that play well postflop."
};
const HERO_WIDTH_NOTE_OPEN = {
  HJ: "HJ still has CO, BTN, and both blinds left to act behind it, so it needs a genuine hand to continue.",
  CO: "CO has only BTN and the blinds left to act, giving it more room to continue wider.",
  BTN: "BTN closes out the preflop action except for the blinds, so it can continue very wide here.",
  SB: "SB is the last seat to act before BB, so it can continue quite wide, though it's out of position for the rest of the hand."
};
const OPENER_STRENGTH_NOTE = {
  UTG: "UTG's opening range is tight and strong, since up to five players could still wake up with a hand behind it.",
  HJ: "HJ's opening range is still fairly tight given how many players are left to act behind it.",
  CO: "CO's opening range is wider and weaker on average, since only BTN and the blinds remain.",
  BTN: "BTN's opening range is the widest of any seat, since it's only stealing against the blinds."
};
function openPosNote(hero,vs){
  return HERO_WIDTH_NOTE_OPEN[hero] + ' ' + OPENER_STRENGTH_NOTE[vs];
}
const HAND_NOTES = {
  premium_pair: "Big pairs flip very few hands you're worried about, so they play as raises in almost every spot.",
  mid_pair: "Medium pairs are strong enough to raise for value but vulnerable to overcards, so position and range width matter a lot here.",
  small_pair: "Small pairs mostly want to see a cheap flop and hit a set \u2014 their value depends on implied odds, not raw preflop equity.",
  suited_ace: "Suited aces carry strong blocker and flush/straight potential, so they punch above their raw equity in these spots.",
  offsuit_ace: "Offsuit aces have solid high-card value but weaker playability than a suited ace, so they're often borderline depending on the seat.",
  suited_broadway: "Suited broadway hands connect with lots of flops and have backup flush/straight equity, making them strong wide-range plays.",
  offsuit_broadway: "Offsuit broadway hands have decent raw equity but dominate less of an opponent's range without flush-draw backup.",
  suited_connector: "Suited connectors lean on postflop playability (straights/flushes) rather than raw preflop equity, so they need position or good odds to be worth it.",
  suited_other: "Disconnected suited hands get a small equity boost from the flush draw but otherwise play close to their offsuit equivalent.",
  offsuit_other: "Weak, disconnected offsuit hands have little raw equity and poor playability \u2014 they need a wide range or great pot odds to be worth continuing."
};
function handCategory(hand){
  if(hand.length===2){
    const idx = RANKS.indexOf(hand[0]);
    if(idx<=2) return 'premium_pair';   // AA KK QQ
    if(idx<=5) return 'mid_pair';       // JJ TT 99
    return 'small_pair';                // 88 and below
  }
  const suited = hand[2]==='s';
  const r1 = hand[0], r2 = hand[1];
  const hasAce = (r1==='A'||r2==='A');
  const broadwayRanks = ['A','K','Q','J','T'];
  const isBroadway = broadwayRanks.includes(r1) && broadwayRanks.includes(r2);
  if(hasAce) return suited ? 'suited_ace' : 'offsuit_ace';
  if(isBroadway) return suited ? 'suited_broadway' : 'offsuit_broadway';
  const gap = Math.abs(RANKS.indexOf(r1)-RANKS.indexOf(r2));
  if(suited && gap<=2) return 'suited_connector';
  if(suited) return 'suited_other';
  return 'offsuit_other';
}

function isPremiumFor3Bet(hand){
  if(hand.length===2) return RANKS.indexOf(hand[0])<=2; // AA KK QQ
  return hand==='AKs' || hand==='AKo';
}

function bbActionNote(hand,dominant){
  const hasA = hand.indexOf('A')>=0;
  const hasK = hand.indexOf('K')>=0;
  if(dominant==='raise'){
    if(isPremiumFor3Bet(hand)){
      return "This is a value 3-bet \u2014 it's strong enough to build the pot now and continue comfortably even if villain 4-bets.";
    }
    if(hasA || hasK){
      const blockerRank = hasA ? 'ace' : 'king';
      const blocked = hasA ? 'premium pairs and AK' : 'KK and AK';
      return "This is a 3-bet bluff/blocker hand, not a value hand: holding the "+blockerRank+" removes some of villain's strongest continuing combos (like "+blocked+"), and the hand still has live equity/suitedness if it does get called \u2014 that combination makes it a better bluffing candidate than a similarly weak hand with no blocker.";
    }
    return "This 3-bets as a blocker/equity hybrid \u2014 it's not strong enough to flat profitably out of position, but it removes value combos from villain's range and keeps some equity if called.";
  }
  if(dominant==='call'){
    return "This flats rather than 3-bets \u2014 it's a real hand with good equity and playability, but 3-betting mostly just folds out worse hands while risking getting crushed by a 4-bet. Calling keeps villain's whole range in so this hand can realize its equity (or hit big) across a wider range of flops.";
  }
  return "Not enough raw equity or blocker value here to continue profitably against this range \u2014 it just gives up too much when called or 4-bet.";
}

function rfiActionNote(hand,dominant){
  const cat = handCategory(hand);
  if(dominant==='raise') return HAND_NOTES[cat];
  if(dominant==='call'){
    return "This limps rather than raises \u2014 it has some equity and playability but isn't strong enough to build a big pot as the only raiser, so it keeps the pot small and sees a cheap flop instead.";
  }
  return "With this many players left to act, this hand doesn't have enough raw equity or playability to profitably open here \u2014 better to give it up.";
}

function ruleOfThumb(mode,pos,hand,dominant){
  if(mode==='OPEN'){
    const [hero,vs] = pos.split('|');
    return openPosNote(hero,vs) + ' ' + bbActionNote(hand,dominant);
  }
  const posNote = mode==='RFI' ? POS_RFI_NOTE[pos] : POS_BB_NOTE[pos];
  const actionNote = mode==='BB' ? bbActionNote(hand,dominant) : rfiActionNote(hand,dominant);
  return posNote + ' ' + actionNote;
}

// ---------- quiz ----------
function renderQuiz(){
  const panel = document.getElementById('rfiQuizPanel');
  const q = state.currentQ;
  const acts = actionsFor(q.mode,q.pos);
  const st = statusFor(q.mode,q.pos,q.hand);
  panel.innerHTML =
      '<div class="quiz-card">'
      + '<div class="quiz-context">'+contextLabel(q)+'</div>'
      + '<div class="rfi-status '+st.cls+'">'+st.label+'</div>'
      + renderCards(q.hand)
      + '<div style="font-size:13px;color:var(--muted);">'+formatHandName(q.hand)+'</div>'
      + '<div class="quiz-actions" id="quizActions">'
      + acts.map(a=>'<button class="act-btn '+a.cls+'" data-key="'+a.key+'">'+a.label+'</button>').join('')
      + '</div>'
      + '<div class="feedback" id="quizFeedback"></div>'
      + '<div id="quizNextWrap"></div>'
      + '<div class="score-row"><span>Session: <b>'+state.sessionCorrect+'/'+state.sessionTotal+'</b></span><span>Streak: <b>'+state.streakCorrect+'</b></span></div>'
      + '</div>';

  document.querySelectorAll('#quizActions .act-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>handleAnswer(btn.dataset.key));
  });
}

function handleAnswer(chosenKey){
  const q = state.currentQ;
  const cell = cellsFor(q.mode,q.pos)[q.hand];
  const dominant = cell.dominant;
  const correct = (chosenKey === dominant);

  const k = keyFor(q.mode,q.pos,q.hand);
  const p = state.progress[k] || {streak:0,correct:0,total:0};
  p.total += 1;
  if(correct){ p.correct += 1; p.streak += 1; } else { p.streak = 0; }
  state.progress[k] = p;

  state.sessionTotal += 1;
  if(correct){ state.sessionCorrect += 1; state.streakCorrect += 1; }
  else { state.streakCorrect = 0; }

  saveProgress();

  const feedback = document.getElementById('quizFeedback');
  let msg = correct ? 'Correct! ' : 'Incorrect \u2014 you chose ' + labelFor(chosenKey) + '. ';
  msg += 'Correct action: <b>'+labelFor(dominant)+'</b>';
  const pctParts = Object.keys(cell.pcts).map(a=> labelFor(a)+' '+cell.pcts[a].toFixed(0)+'%');
  msg += '<div style="margin-top:6px;font-size:12px;color:var(--muted);">'+pctParts.join(' \u00b7 ')+'</div>';
  if(!correct){
    msg += '<div style="margin-top:10px;font-size:12px;color:var(--text);text-align:left;background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;"><b style="color:var(--gold-bright);">Rule of thumb:</b> '+ruleOfThumb(q.mode,q.pos,q.hand,dominant)+'</div>';
  }
  feedback.className = 'feedback ' + (correct?'correct':'incorrect');
  feedback.innerHTML = msg;

  document.querySelectorAll('#quizActions .act-btn').forEach(b=>b.disabled=true);

  if(correct){
    setTimeout(()=>{
      state.currentQ = pickQuestion();
      renderQuiz();
    }, 900);
  } else {
    const nextBtnWrap = document.getElementById('quizNextWrap');
    nextBtnWrap.innerHTML = '<button class="act-btn" id="nextQBtn" style="border-color:var(--accent);margin-top:14px;">Next hand \u2192</button>';
    document.getElementById('nextQBtn').addEventListener('click', ()=>{
      state.currentQ = pickQuestion();
      renderQuiz();
    });
  }
}

// ---------- ledger ----------
function renderLegend(){
  return '<div class="rfi-legend">'
      + '<div class="rfi-legend-item"><span class="rfi-legend-swatch" style="background:#2e3440;"></span>Untested</div>'
      + '<div class="rfi-legend-item"><span class="rfi-legend-swatch" style="background:var(--brick-bright);"></span>Learning, &lt;50%</div>'
      + '<div class="rfi-legend-item"><span class="rfi-legend-swatch" style="background:var(--gold-bright);"></span>Learning, \u226550%</div>'
      + '<div class="rfi-legend-item"><span class="rfi-legend-swatch" style="background:var(--sage-bright);"></span>Mastered</div>'
      + '</div>';
}

function renderHeatmap(mode,pos){
  let cells = '';
  for(let i=0;i<13;i++){
    for(let j=0;j<13;j++){
      let hand;
      if(i===j) hand = RANKS[i]+RANKS[j];
      else if(i<j) hand = RANKS[i]+RANKS[j]+'s';
      else hand = RANKS[j]+RANKS[i]+'o';
      const k = keyFor(mode,pos,hand);
      const p = state.progress[k];
      let bg = '#2e3440';
      let tip = hand+': untested';
      let weak = false;
      if(p && p.total>0){
        const acc = p.correct/p.total;
        weak = !isMastered(p);
        if(isMastered(p)){ bg = 'var(--sage-bright)'; tip = hand+': mastered ('+p.correct+'/'+p.total+')'; }
        else if(acc>=0.5){ bg = 'var(--gold-bright)'; tip = hand+': learning ('+(acc*100).toFixed(0)+'%, '+p.total+' reps)'; }
        else { bg = 'var(--brick-bright)'; tip = hand+': learning ('+(acc*100).toFixed(0)+'%, '+p.total+' reps)'; }
      }
      const dim = (state.focusWeak && !weak) ? 'opacity:0.18;' : '';
      cells += '<div class="rfi-cell" style="background:'+bg+';'+dim+'" data-tip="'+tip+'">'+hand+'</div>';
    }
  }
  return '<div class="rfi-grid">' + cells + '</div>';
}

function renderLedger(){
  const panel = document.getElementById('rfiLedgerPanel');
  const mode = state.mode;
  const pool = getPool(mode);

  let totalCombos=0, mastered=0, learning=0, totalAns=0, totalCorrect=0;
  let weakList = [];

  pool.forEach(pos=>{
    allHandsForPos(mode,pos).forEach(hand=>{
      const k = keyFor(mode,pos,hand);
      const p = state.progress[k];
      totalCombos++;
      if(p && p.total>0){
        totalAns += p.total;
        totalCorrect += p.correct;
        if(isMastered(p)) mastered++;
        else{
          learning++;
          const acc = p.correct/p.total;
          weakList.push({pos,hand,acc,total:p.total});
        }
      }
    });
  });
  weakList.sort((a,b)=>a.acc-b.acc);
  weakList = weakList.slice(0,10);

  const accPct = totalAns>0 ? (100*totalCorrect/totalAns).toFixed(0) : '\u2014';
  const tested = mastered+learning;

  let html = '<div class="rfi-ledgersub">'+tested+' / '+totalCombos+' hand-position combos attempted &nbsp;\u00b7&nbsp; '
      + '<b style="color:var(--sage-bright);">'+mastered+' mastered</b> &nbsp;\u00b7&nbsp; '
      + '<b style="color:var(--gold-bright);">'+learning+' learning</b> &nbsp;\u00b7&nbsp; '
      + accPct+'% lifetime accuracy over '+totalAns+' reps</div>';

  html += renderLegend();
  if(pool.length === 1){
    html += renderHeatmap(mode,pool[0]);
  } else {
    pool.forEach(pos=>{
      html += '<div style="font-size:13px;font-weight:600;color:var(--text);margin:14px 0 8px;">'+displayPosLabel(mode,pos)+'</div>';
      html += renderHeatmap(mode,pos);
    });
  }

  html += '<div class="weak-list"><div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Weakest spots</div>';
  if(weakList.length===0){
    html += '<div style="font-size:13px;color:var(--muted);">No data yet \u2014 answer some hands first.</div>';
  } else {
    weakList.forEach(w=>{
      html += '<div class="weak-item"><span>'+w.hand+' \u2014 '+displayPosLabel(mode,w.pos)+'</span><span>'+(w.acc*100).toFixed(0)+'% ('+w.total+' reps)</span></div>';
    });
  }
  html += '</div>';

  panel.innerHTML = html;
}

// ---------- controls ----------
function renderModeRow(){
  const row = document.getElementById('modeRow');
  const modes = [{key:'RFI',label:'RFI (Opening)'},{key:'BB',label:'BB Defense'},{key:'OPEN',label:'Facing an Open'}];
  row.innerHTML = modes.map(m=>'<button class="mode-btn '+(state.mode===m.key?'active':'')+'" data-mode="'+m.key+'">'+m.label+'</button>').join('');
  row.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.mode = btn.dataset.mode;
      state.posFilter = 'ALL';
      state.heroFilter = 'ALL';
      state.currentQ = pickQuestion();
      renderShell();
    });
  });
}
function renderHeroRow(){
  const row = document.getElementById('heroRow');
  if(state.mode !== 'OPEN'){ row.innerHTML = ''; return; }
  let html = '<span style="color:var(--muted);font-size:12px;align-self:center;margin-right:4px;">Position:</span>';
  html += '<button class="pos-btn '+(state.heroFilter==='ALL'?'active':'')+'" data-hero="ALL">All</button>';
  POSITIONS_OPEN_HERO.forEach(p=>{
    html += '<button class="pos-btn '+(state.heroFilter===p?'active':'')+'" data-hero="'+p+'">'+p+'</button>';
  });
  row.innerHTML = html;
  row.querySelectorAll('.pos-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.heroFilter = btn.dataset.hero;
      state.posFilter = 'ALL';
      state.currentQ = pickQuestion();
      renderShell();
      if(state.activeTab==='ledger'){
        document.querySelector('.rfi-tab[data-tab="ledger"]').click();
      }
    });
  });
}
function renderPosRow(){
  const row = document.getElementById('posRow');
  const label = state.mode==='RFI' ? 'Position' : 'Vs Position';
  let options;
  if(state.mode==='OPEN'){
    options = state.heroFilter==='ALL' ? allPossibleOpeners() : validOpeners(state.heroFilter);
  } else {
    options = POSITIONS;
  }
  let html = '<span style="color:var(--muted);font-size:12px;align-self:center;margin-right:4px;">'+label+':</span>';
  html += '<button class="pos-btn '+(state.posFilter==='ALL'?'active':'')+'" data-pos="ALL">All</button>';
  options.forEach(p=>{
    html += '<button class="pos-btn '+(state.posFilter===p?'active':'')+'" data-pos="'+p+'">'+p+'</button>';
  });
  row.innerHTML = html;
  row.querySelectorAll('.pos-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.posFilter = btn.dataset.pos;
      state.currentQ = pickQuestion();
      renderShell();
      if(state.activeTab==='ledger'){
        document.querySelector('.rfi-tab[data-tab="ledger"]').click();
      }
    });
  });
}
function renderFocusToggle(){
  const mode = state.mode;
  const pool = getPool(mode);
  let weakCount = 0;
  pool.forEach(pos=>{
    allHandsForPos(mode,pos).forEach(hand=>{
      const p = state.progress[keyFor(mode,pos,hand)];
      if(p && p.total>0 && !isMastered(p)) weakCount++;
    });
  });
  const cb = document.getElementById('focusToggle');
  cb.checked = state.focusWeak;
  const span = document.querySelector('#focusToggleRow span');
  span.textContent = 'Focus on hands I\u2019ve struggled with (' + weakCount + ')';
  cb.onchange = ()=>{
    state.focusWeak = cb.checked;
    state.currentQ = pickQuestion();
    renderQuiz();
    if(state.activeTab==='ledger') renderLedger();
  };
}

function renderProfileBar(){
  const bar = document.getElementById('profileBar');
  bar.innerHTML =
      '<span>Playing as <b>'+state.profile+'</b></span>'
      + '<div class="profile-actions">'
      + '<button id="exportBtn">Export progress</button>'
      + '<button id="importBtn">Import progress</button>'
      + '<button id="switchProfileBtn">Switch profile</button>'
      + '</div>';
  document.getElementById('exportBtn').addEventListener('click', exportProgress);
  document.getElementById('importBtn').addEventListener('click', ()=>document.getElementById('importFileInput').click());
  document.getElementById('switchProfileBtn').addEventListener('click', showProfileGate);
}

function exportProgress(){
  const payload = {
    profile: state.profile,
    exportedAt: new Date().toISOString(),
    progress: state.progress
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ledger-progress-'+state.profile+'.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importProgress(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed.progress) throw new Error('No progress field in file');
      const ok = confirm('Import progress into "'+state.profile+'"? This will overwrite current saved progress for this profile.');
      if(!ok) return;
      state.progress = parsed.progress;
      saveProgress();
      state.currentQ = pickQuestion();
      renderShell();
      alert('Progress imported.');
    }catch(e){
      alert('Could not import file: '+e.message);
    }
  };
  reader.readAsText(file);
}

// ---------- shell ----------
function renderShell(){
  root.innerHTML =
      '<div class="profile-bar" id="profileBar"></div>'
      + '<div class="rfi-header">'
      + '<div><h1 class="rfi-title">The Ledger</h1><div class="rfi-subtitle">Preflop GTO trainer \u2014 RFI &amp; BB defense</div></div>'
      + '</div>'
      + '<details class="rfi-help"><summary>How this works</summary>'
      + '<div style="margin-top:8px;">'
      + '<p>Pick a mode: <b>RFI</b> drills opening ranges (should you raise or fold, or limp from SB). <b>BB Defense</b> drills how BB should respond to each position\'s open \u2014 3-bet, call, or fold. <b>Facing an Open</b> drills the same 3-bet/call/fold decision for HJ, CO, BTN, or SB when someone in front of them has opened.</p>'
      + '<p>Every hand+position+mode combo you answer is saved to this browser under your profile name. A combo becomes <span style="color:var(--sage-bright);">Mastered</span> after 3 correct answers in a row, and resets to Learning if you miss it again.</p>'
      + '<p style="color:var(--muted);font-size:12px;">Data is from GTO Wizard solver output (2.5x opens, 3.5x SB opens, 100bb 6-max). Progress lives only in this browser \u2014 use Export to back it up.</p>'
      + '</div>'
      + '</details>'
      + '<div class="mode-row" id="modeRow"></div>'
      + '<div class="pos-row" id="heroRow"></div>'
      + '<div class="pos-row" id="posRow"></div>'
      + '<label class="rfi-focus" id="focusToggleRow"><input type="checkbox" id="focusToggle"><span></span></label>'
      + '<div class="rfi-tabs">'
      + '<button class="rfi-tab active" data-tab="quiz">Quiz</button>'
      + '<button class="rfi-tab" data-tab="ledger">Ledger</button>'
      + '</div>'
      + '<div class="rfi-panel active" id="rfiQuizPanel"></div>'
      + '<div class="rfi-panel" id="rfiLedgerPanel"></div>';

  renderProfileBar();
  renderModeRow();
  renderHeroRow();
  renderPosRow();
  renderFocusToggle();
  renderQuiz();

  document.querySelectorAll('.rfi-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.rfi-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.rfi-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.tab;
      if(tab.dataset.tab==='quiz'){
        document.getElementById('rfiQuizPanel').classList.add('active');
      } else {
        document.getElementById('rfiLedgerPanel').classList.add('active');
        renderLedger();
      }
    });
  });
}

// ---------- profile gate ----------
function showProfileGate(){
  const known = getKnownProfiles();
  root.innerHTML =
      '<div class="profile-gate">'
      + '<h2>Who\'s playing?</h2>'
      + '<p>No password \u2014 this just keeps your progress separate from anyone else using this browser.</p>'
      + '<input type="text" id="profileNameInput" placeholder="Your name" maxlength="30">'
      + '<button id="profileStartBtn">Start training</button>'
      + (known.length ? '<div class="profile-existing">Or continue as: '
          + known.map(n=>'<button data-name="'+n+'">'+n+'</button>').join('') + '</div>' : '')
      + '</div>';

  document.getElementById('profileStartBtn').addEventListener('click', ()=>{
    const val = document.getElementById('profileNameInput').value.trim();
    if(val) activateProfile(val);
  });
  document.getElementById('profileNameInput').addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      const val = e.target.value.trim();
      if(val) activateProfile(val);
    }
  });
  root.querySelectorAll('.profile-existing button').forEach(btn=>{
    btn.addEventListener('click', ()=>activateProfile(btn.dataset.name));
  });
}

function activateProfile(name){
  state.profile = name;
  rememberProfile(name);
  localStorage.setItem(ACTIVE_PROFILE_KEY, name);
  state.progress = loadProgress(name);
  state.sessionCorrect = 0;
  state.sessionTotal = 0;
  state.streakCorrect = 0;
  state.mode = 'RFI';
  state.posFilter = 'ALL';
  state.heroFilter = 'ALL';
  state.focusWeak = false;
  state.currentQ = pickQuestion();
  renderShell();
}

// ---------- init ----------
async function init(){
  const res = await fetch('data.json');
  RAW_DATA = await res.json();

  document.getElementById('importFileInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(file) importProgress(file);
    e.target.value = '';
  });

  const lastProfile = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if(lastProfile){
    activateProfile(lastProfile);
  } else {
    showProfileGate();
  }
}
init();
