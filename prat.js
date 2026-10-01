// ===== Prat-grejen: chatta och prata med rösten i alla spel =====
// Alla som skriver samma hemliga kod hamnar i samma rum.
// Varje spelare tar en plats (1-6) i rummet och kopplar upp sig mot de andra (PeerJS / WebRTC).
(function () {
  if (window.__prat) return;

  const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
  const PREFIX = 'nils-prat-';
  const PLATSER = 6;                 // max antal i ett rum
  const SPARA = 'nils_prat_v1';      // namn + kod (localStorage)
  const HISTORIK = 'nils_prat_hist'; // senaste meddelandena (sessionStorage)
  const BOKSTAVER = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const EMOJIS = ['😀', '😂', '👍', '❤️', '😱', '💩', '🎮', '👋'];

  let sparat = {};
  try { sparat = JSON.parse(localStorage.getItem(SPARA)) || {}; } catch (e) {}
  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(HISTORIK)) || []; } catch (e) {}

  let peer = null, minPlats = 0, kod = '', iRum = false;
  const kompisar = {};   // peer-id -> { conn, namn, mic }
  const sedda = new Set();
  let micStream = null;
  const samtalUt = {};   // peer-id -> mitt samtal dit (min röst)
  const ljud = {};       // peer-id -> <audio> med kompisens röst
  let olasta = 0, oppen = false;
  const lyssnare = {};  // spel kan lyssna: 'in', 'ut', 'msg', 'spel'
  function hander(typ, a, b, c) { (lyssnare[typ] || []).forEach(f => { try { f(a, b, c); } catch (e) {} }); }

  function spara() { try { localStorage.setItem(SPARA, JSON.stringify(sparat)); } catch (e) {} }
  function sparaHist() { try { sessionStorage.setItem(HISTORIK, JSON.stringify(hist.slice(-30))); } catch (e) {} }

  // ---------- Utseende ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  * { box-sizing:border-box; margin:0; padding:0; font-family:'Trebuchet MS','Segoe UI',sans-serif; }
  #knapp { position:fixed; left:max(8px, env(safe-area-inset-left)); top:42%; width:50px; height:50px; border-radius:50%;
    border:3px solid #00e5ff; background:#1a0b3a; font-size:24px; cursor:pointer; color:#fff;
    box-shadow:0 0 12px rgba(0,229,255,.6); opacity:.85; touch-action:manipulation; }
  #knapp:hover { opacity:1; }
  #knapp.ihop { border-color:#45ff8a; box-shadow:0 0 12px rgba(69,255,138,.7); }
  #prick { position:absolute; right:-6px; top:-6px; min-width:22px; height:22px; border-radius:11px; background:#ff3df0;
    font-size:13px; font-weight:bold; line-height:22px; text-align:center; display:none; padding:0 4px; }
  #bubbla { position:fixed; left:66px; top:42%; max-width:min(300px, 70vw); background:rgba(11,8,32,.92); color:#fff;
    border:2px solid #ff3df0; border-radius:14px; padding:8px 12px; font-size:15px; display:none; pointer-events:none;
    overflow-wrap:anywhere; }
  #ruta { position:fixed; left:max(8px, env(safe-area-inset-left)); bottom:max(8px, env(safe-area-inset-bottom));
    width:min(340px, calc(100vw - 16px)); max-height:min(520px, calc(100vh - 16px)); display:none; flex-direction:column;
    background:#120a30; color:#fff; border:3px solid #00e5ff; border-radius:16px; overflow:hidden;
    box-shadow:0 0 24px rgba(0,229,255,.5); }
  #topp { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#1a0b3a; font-weight:bold; font-size:16px; }
  #topp span { flex:1; }
  button { cursor:pointer; color:#fff; border:none; border-radius:10px; font-size:16px; font-weight:bold; padding:9px 12px;
    background:#3a2a7a; touch-action:manipulation; }
  button:hover { filter:brightness(1.25); }
  #stang { background:none; font-size:20px; padding:2px 8px; }
  .inne { padding:10px; display:flex; flex-direction:column; gap:8px; min-height:0; }
  label { font-size:14px; color:#ffd23f; }
  input { width:100%; padding:9px 10px; border-radius:10px; border:2px solid #3a2a7a; background:#0b0b2a; color:#fff;
    font-size:16px; outline:none; }
  input:focus { border-color:#00e5ff; }
  #kodIn { text-transform:uppercase; letter-spacing:4px; text-align:center; font-weight:bold; }
  .gron { background:#1f9d55; } .rosa { background:#c026a8; } .rod { background:#b3261e; }
  .rad { display:flex; gap:6px; }
  .rad > * { flex:1; }
  #eller { text-align:center; color:#aaa; font-size:13px; }
  #kodRad { font-size:14px; color:#ffd23f; }
  #kodRad b { font-size:20px; letter-spacing:3px; color:#fff; }
  #folk { font-size:14px; color:#45ff8a; overflow-wrap:anywhere; }
  #lista { flex:1; min-height:120px; max-height:220px; overflow-y:auto; background:#0b0b2a; border-radius:10px; padding:8px;
    display:flex; flex-direction:column; gap:5px; font-size:15px; }
  .m { overflow-wrap:anywhere; line-height:1.3; }
  .m b { color:#00e5ff; } .m.jag b { color:#ffd23f; }
  .m.info { color:#999; font-size:13px; font-style:italic; }
  #emo { display:flex; gap:2px; flex-wrap:wrap; }
  #emo button { background:none; padding:2px 4px; font-size:21px; }
  #skicka { flex:0 0 auto; }
  #mic.pa { background:#1f9d55; animation:puls 1.2s infinite; }
  @keyframes puls { 50% { box-shadow:0 0 14px #45ff8a; } }
  #status { font-size:13px; color:#ffb4b4; min-height:16px; }
</style>
<button id="knapp" title="Prata med kompisar">💬<span id="prick"></span></button>
<div id="bubbla"></div>
<div id="ruta">
  <div id="topp"><span>💬 Prata</span><button id="stang" title="Stäng">✖</button></div>
  <div class="inne" id="ute">
    <label>Vad heter du?</label>
    <input id="namnIn" maxlength="14" placeholder="Ditt namn">
    <button class="gron" id="nytt">✨ Starta nytt rum</button>
    <div id="eller">eller skriv kompisens kod</div>
    <div class="rad"><input id="kodIn" maxlength="4" placeholder="KOD"><button class="rosa" id="gaMed">Gå med</button></div>
    <div id="status"></div>
  </div>
  <div class="inne" id="inne" style="display:none">
    <div id="kodRad">Hemlig kod: <b id="kodUt"></b></div>
    <div id="folk"></div>
    <div id="lista"></div>
    <div id="emo"></div>
    <div class="rad"><input id="text" maxlength="200" placeholder="Skriv här..."><button class="gron" id="skicka">Skicka</button></div>
    <div class="rad"><button id="mic">🎤 Prata med rösten</button><button class="rod" id="lamna" style="flex:0 0 auto">Lämna</button></div>
    <div id="status2" style="font-size:13px;color:#ffb4b4"></div>
  </div>
</div>`;
  const $ = id => root.getElementById(id);

  // Spelen ska inte märka när man skriver eller trycker i prat-rutan
  ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend',
    'pointerdown', 'pointerup', 'wheel'].forEach(typ =>
    host.addEventListener(typ, e => e.stopPropagation()));

  function visaRuta(pa) {
    oppen = pa;
    $('ruta').style.display = pa ? 'flex' : 'none';
    $('knapp').style.display = pa ? 'none' : 'block';
    if (pa) {
      olasta = 0; ritaPrick(); $('bubbla').style.display = 'none';
      if (document.pointerLockElement) document.exitPointerLock();
      $('lista').scrollTop = 1e9;
    }
  }
  function ritaPrick() {
    $('prick').style.display = olasta ? 'block' : 'none';
    $('prick').textContent = olasta;
  }
  function ritaLage() {
    $('ute').style.display = iRum ? 'none' : 'flex';
    $('inne').style.display = iRum ? 'flex' : 'none';
    $('knapp').classList.toggle('ihop', iRum);
    $('kodUt').textContent = kod;
  }
  function ritaFolk() {
    const namn = [(sparat.namn || 'Jag') + ' (du)' + (micStream ? ' 🎤' : '')];
    for (const id in kompisar) namn.push((kompisar[id].namn || '...') + (kompisar[id].mic ? ' 🎤' : ''));
    $('folk').textContent = '👥 ' + namn.join(', ');
  }
  function ritaMeddelande(m) {
    const d = document.createElement('div');
    d.className = 'm' + (m.info ? ' info' : '') + (m.jag ? ' jag' : '');
    if (m.info) d.textContent = m.text;
    else {
      const b = document.createElement('b'); b.textContent = m.namn + ': ';
      d.appendChild(b); d.appendChild(document.createTextNode(m.text));
    }
    const l = $('lista'); l.appendChild(d);
    while (l.children.length > 60) l.removeChild(l.firstChild);
    l.scrollTop = 1e9;
  }
  let bubbelTid = 0;
  function nyttMeddelande(m, tyst) {
    ritaMeddelande(m);
    if (!m.info) { hist.push(m); sparaHist(); }
    if (!oppen && !tyst && !m.jag) {
      if (!m.info) { olasta++; ritaPrick(); }
      const b = $('bubbla');
      b.textContent = m.info ? m.text : m.namn + ': ' + m.text;
      b.style.display = 'block';
      clearTimeout(bubbelTid);
      bubbelTid = setTimeout(() => b.style.display = 'none', 5000);
    }
  }
  function info(text) { nyttMeddelande({ info: true, text }); }
  function status(text) { $('status').textContent = text; $('status2').textContent = text; }

  // ---------- Nätverk ----------
  function laddaPeerJS() {
    return new Promise((ok, fel) => {
      if (window.Peer) return ok();
      const s = document.createElement('script');
      s.src = PEERJS; s.onload = ok; s.onerror = fel;
      document.head.appendChild(s);
    });
  }
  function skickaAlla(data) {
    for (const id in kompisar) { try { kompisar[id].conn.send(data); } catch (e) {} }
  }
  function kopplaConn(conn) {
    conn.on('open', () => {
      const ny = !kompisar[conn.peer];
      kompisar[conn.peer] = Object.assign(kompisar[conn.peer] || { namn: '', mic: false }, { conn });
      conn.send({ t: 'hej', namn: sparat.namn, mic: !!micStream });
      if (ny && micStream) ringTill(conn.peer);
      ritaFolk();
    });
    conn.on('data', d => {
      const k = kompisar[conn.peer];
      if (!d || !k) return;
      if (d.t === 'hej') {
        const forsta = !k.namn;
        k.namn = String(d.namn || 'Kompis').slice(0, 14); k.mic = !!d.mic;
        if (forsta) info('👋 ' + k.namn + ' kom in i rummet');
        hander('in', conn.peer, k.namn);
        ritaFolk();
      } else if (d.t === 'mic') {
        k.mic = !!d.on; ritaFolk();
        if (!k.mic) stangLjud(conn.peer);
      } else if (d.t === 'msg' && !sedda.has(d.id)) {
        sedda.add(d.id);
        const text = String(d.text || '').slice(0, 200);
        nyttMeddelande({ namn: k.namn || 'Kompis', text });
        hander('msg', conn.peer, text, k.namn);
      } else if (d.t === 'spel') {
        hander('spel', conn.peer, d.d, k.namn);
      }
    });
    const borta = () => {
      const k = kompisar[conn.peer];
      if (!k || k.conn !== conn) return;
      delete kompisar[conn.peer];
      stangLjud(conn.peer);
      if (samtalUt[conn.peer]) { try { samtalUt[conn.peer].close(); } catch (e) {} delete samtalUt[conn.peer]; }
      if (k.namn) info('🚪 ' + k.namn + ' gick ut');
      hander('ut', conn.peer);
      ritaFolk();
    };
    conn.on('close', borta);
    conn.on('error', borta);
  }
  function taPlats(plats) {
    if (plats > PLATSER) { status('Rummet är fullt! 😮'); kod = ''; return; }
    const p = new Peer(PREFIX + kod + '-' + plats);
    peer = p;
    p.on('open', () => {
      minPlats = plats; iRum = true;
      sparat.kod = kod; spara();
      status(''); ritaLage(); ritaFolk();
      for (let i = 1; i <= PLATSER; i++) if (i !== plats) kopplaConn(p.connect(PREFIX + kod + '-' + i, { reliable: true }));
    });
    p.on('connection', kopplaConn);
    p.on('call', samtal => {
      samtal.answer();   // jag lyssnar bara på det här samtalet, min egen röst ringer jag upp med själv
      samtal.on('stream', s => spelaLjud(samtal.peer, s));
      samtal.on('close', () => stangLjud(samtal.peer));
    });
    p.on('disconnected', () => { if (peer === p && !p.destroyed) setTimeout(() => { try { p.reconnect(); } catch (e) {} }, 2000); });
    p.on('error', e => {
      if (e.type === 'unavailable-id' && !iRum) { p.destroy(); taPlats(plats + 1); }
      else if (e.type === 'peer-unavailable') { /* ingen sitter på den platsen, det är okej */ }
      else if (!iRum) { status('Det gick inte att koppla upp. Försök igen!'); }
    });
  }
  function gaIn(nyKod) {
    const namn = $('namnIn').value.trim().slice(0, 14);
    if (!namn) { status('Skriv ditt namn först 🙂'); $('namnIn').focus(); return; }
    sparat.namn = namn; spara();
    kod = nyKod; status('Kopplar upp...');
    laddaPeerJS().then(() => taPlats(1), () => status('Inget internet? Försök igen!'));
  }
  function lamna() {
    micAv();
    for (const id in ljud) stangLjud(id);
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    for (const id in kompisar) delete kompisar[id];
    iRum = false; kod = ''; delete sparat.kod; spara();
    hist = []; sparaHist(); $('lista').innerHTML = '';
    ritaLage();
  }
  function skickaText(text) {
    text = text.trim().slice(0, 200);
    if (!text || !iRum) return;
    const id = minPlats + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    sedda.add(id);
    skickaAlla({ t: 'msg', id, text });
    nyttMeddelande({ namn: sparat.namn, text, jag: true });
    hander('msg', 'jag', text, sparat.namn);
  }

  // ---------- Röst ----------
  function ringTill(id) {
    if (!micStream || !peer || samtalUt[id]) return;
    const s = peer.call(id, micStream);
    if (!s) return;
    samtalUt[id] = s;
    s.on('close', () => { if (samtalUt[id] === s) delete samtalUt[id]; });
  }
  function spelaLjud(id, stream) {
    stangLjud(id);
    const a = new Audio();
    a.srcObject = stream; a.autoplay = true;
    ljud[id] = a;
    const spela = () => a.play().catch(() => {});
    a.play().catch(() => {   // webbläsaren vill ha ett tryck först
      addEventListener('pointerdown', spela, { once: true, capture: true });
      addEventListener('keydown', spela, { once: true, capture: true });
    });
  }
  function stangLjud(id) {
    if (!ljud[id]) return;
    try { ljud[id].pause(); ljud[id].srcObject = null; } catch (e) {}
    delete ljud[id];
  }
  function ritaMic() {
    $('mic').classList.toggle('pa', !!micStream);
    $('mic').textContent = micStream ? '🎤 Mikrofonen är PÅ' : '🎤 Prata med rösten';
    ritaFolk();
  }
  function micPa() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('Mikrofonen fungerar inte här 😕'); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(s => {
        if (!iRum) { s.getTracks().forEach(t => t.stop()); return; }
        micStream = s; status('');
        for (const id in kompisar) ringTill(id);
        skickaAlla({ t: 'mic', on: true });
        ritaMic();
      })
      .catch(() => status('Du måste trycka "Tillåt" för mikrofonen 🎤'));
  }
  function micAv() {
    if (!micStream) return;
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    for (const id in samtalUt) { try { samtalUt[id].close(); } catch (e) {} delete samtalUt[id]; }
    skickaAlla({ t: 'mic', on: false });
    ritaMic();
  }

  // ---------- Knappar ----------
  $('knapp').onclick = () => visaRuta(true);
  $('stang').onclick = () => visaRuta(false);
  $('nytt').onclick = () => {
    let k = '';
    for (let i = 0; i < 4; i++) k += BOKSTAVER[Math.floor(Math.random() * BOKSTAVER.length)];
    gaIn(k);
  };
  $('gaMed').onclick = () => {
    const k = $('kodIn').value.trim().toUpperCase();
    if (k.length !== 4) { status('Koden har 4 tecken'); return; }
    gaIn(k);
  };
  $('kodIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('gaMed').click(); });
  $('skicka').onclick = () => { skickaText($('text').value); $('text').value = ''; $('text').focus(); };
  $('text').addEventListener('keydown', e => { if (e.key === 'Enter') $('skicka').click(); });
  $('mic').onclick = () => micStream ? micAv() : micPa();
  $('lamna').onclick = lamna;
  EMOJIS.forEach(e => {
    const b = document.createElement('button');
    b.textContent = e; b.onclick = () => skickaText(e);
    $('emo').appendChild(b);
  });
  addEventListener('pagehide', () => { if (peer) { try { peer.destroy(); } catch (e) {} } });

  // ---------- Start ----------
  function start() {
    document.body.appendChild(host);
    $('namnIn').value = sparat.namn || '';
    hist.forEach(ritaMeddelande);
    ritaLage(); ritaMic();
    // Var man i ett rum i förra spelet? Hoppa in igen av sig själv.
    if (sparat.kod && sparat.namn) gaIn(sparat.kod);
  }
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);

  window.__prat = {
    skicka: skickaText, lamna, oppna: () => visaRuta(true),
    skickaSpel: d => skickaAlla({ t: 'spel', d }),
    pa: (typ, f) => (lyssnare[typ] = lyssnare[typ] || []).push(f),
    get kod() { return kod; }, get iRum() { return iRum; }, get namn() { return sparat.namn || ''; },
    get kompisar() { return Object.keys(kompisar).length; }
  };
})();
