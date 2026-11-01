/* AZoom — app.js
   All page behaviour: navigation, login, search, booking, returns, bills and the staff console.
   Needs data.js (loaded first) and Leaflet (for the map). */

/* =========================================================
   2. STORAGE
   ========================================================= */
function load(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
const getUsers = () => load(KEY.users, []);
const getFleet = () => load(KEY.fleet, DEFAULT_FLEET);
const setFleet = v => save(KEY.fleet, v);
const getBookings = () => load(KEY.bookings, []);
const setBookings = v => save(KEY.bookings, v);

function seed(){
  if (!localStorage.getItem(KEY.fleet)) setFleet(DEFAULT_FLEET);
  if (!localStorage.getItem(KEY.users)) save(KEY.users, [
    { name:'Demo Customer', email:'demo@azoom.sg', password:'demo123', role:'customer' },
    { name:'Alex Tan', email:'staff@azoom.sg', password:'staff123', role:'staff' }
  ]);
  if (!localStorage.getItem(KEY.bookings)) setBookings([]);
}
seed();
let user = load(KEY.session, null);

/* =========================================================
   3. HELPERS
   ========================================================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r2 = n => Math.round(n*100)/100;
const money = n => 'S$' + Number(n).toLocaleString('en-SG',{minimumFractionDigits:2,maximumFractionDigits:2});
const money0 = n => 'S$' + Math.round(n).toLocaleString('en-SG');
const dfmt = d => new Date(d).toLocaleDateString('en-SG',{weekday:'short',day:'numeric',month:'short'});
const dtfmt = d => new Date(d).toLocaleString('en-SG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const isoDate = d => { const x = new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
const initials = n => n.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
const carName = c => `${c.make} ${c.model}`;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),3200); }
function qrFail(img, ref){ img.outerHTML = `<div class="mono" style="width:${img.width||120}px;height:${img.height||120}px;display:grid;place-items:center;font-size:.8rem;text-align:center">QR offline<br>${ref}</div>`; }
function newRef(){ return 'AZ' + Date.now().toString(36).toUpperCase().slice(-6); }

/* Price for a period: months, then weeks, then days — each part capped
   at the next tier up, so customers always get the cheapest combination. */
function rentalCost(car, days){
  const weekly = car.price*6, monthly = Math.round(car.price*22);
  const m = Math.floor(days/30); let rest = days%30;
  const w = Math.floor(rest/7); const d = rest%7;
  const partial = Math.min(w*weekly + Math.min(d*car.price, weekly), monthly);
  const parts = [];
  if (m) parts.push(`${m} month${m>1?'s':''}`);
  if (w) parts.push(`${w} week${w>1?'s':''}`);
  if (d) parts.push(`${d} day${d>1?'s':''}`);
  return { total: m*monthly + partial, label: parts.join(', '), weekly, monthly };
}
function quote(car, days, protId, extraIds){
  const rent = rentalCost(car, days);
  const prot = PROTECTION.find(p=>p.id===protId) || PROTECTION[0];
  const lines = [{ label:`Rental · ${rent.label}`, amount:rent.total }];
  if (prot.rate) lines.push({ label:`${prot.name} · ${days}d`, amount: prot.rate*days });
  extraIds.forEach(id => {
    const e = EXTRAS.find(x=>x.id===id); if (!e) return;
    let amt = e.flat ? e.flat : e.rate*days; if (e.cap) amt = Math.min(amt, e.cap);
    lines.push({ label:e.name, amount:amt });
  });
  const subtotal = r2(lines.reduce((s,l)=>s+l.amount,0));
  const gst = r2(subtotal*GST);
  return { lines, subtotal, gst, total: r2(subtotal+gst), prot };
}

/* =========================================================
   4. CAR ILLUSTRATIONS (inline SVG, no image files needed)
   ========================================================= */
/* Photo for each car (files live in img/cars/). Looked up by id so it
   still works for fleets already saved in localStorage. */
const CAR_IMAGES = {
  1:'tesla-model3.jpg', 2:'tesla-modely.jpg', 3:'byd-atto3.jpg', 4:'hyundai-ioniq5.jpg', 5:'byd-m6.jpg',
  6:'bmw-i4.jpg', 7:'mercedes-eqb.jpg', 8:'porsche-taycan.jpg', 9:'mg4.jpg', 10:'polestar-2.jpg'
};
/* Shows the photo; if the file is missing it falls back to the drawn SVG. */
function carPic(car){
  const file = CAR_IMAGES[car.id];
  if (!file) return carSVG(car);
  return `<img class="car-pic" src="img/cars/${file}" alt="${esc(carName(car))}" loading="lazy" onerror="this.outerHTML=carSVG(getFleet().find(c=>c.id===${car.id}))">`;
}
const SHAPES = {
  sedan:{ body:'M18,96 L18,80 Q20,70 40,66 L92,60 Q122,34 162,31 L204,31 Q236,34 258,58 L288,64 Q302,68 302,82 L302,96 Z', win:'M102,60 Q126,40 162,37 L200,37 Q226,40 242,58 Z', div:172, top:37 },
  suv:{ body:'M18,96 L18,74 Q20,62 38,60 L80,56 Q96,30 130,26 L230,26 Q252,28 264,52 L290,60 Q302,64 302,78 L302,96 Z', win:'M92,56 Q106,34 132,32 L226,32 Q244,34 254,54 Z', div:178, top:32 },
  hatch:{ body:'M22,96 L22,76 Q24,66 42,62 L90,58 Q114,32 150,29 L236,29 Q256,31 264,54 L284,60 Q296,64 296,78 L296,96 Z', win:'M100,58 Q120,36 150,35 L230,35 Q246,37 254,56 Z', div:180, top:35 },
  mpv:{ body:'M16,96 L16,72 Q18,60 36,58 L70,54 Q88,24 120,22 L262,22 Q282,24 288,46 L298,58 Q304,64 304,78 L304,96 Z', win:'M80,54 Q96,30 122,28 L256,28 Q274,30 280,50 Z', div:170, top:28 }
};
function carSVG(car, bg='#EAE5D9'){
  const s = SHAPES[car.shape] || SHAPES.sedan;
  const wheel = x => `<circle cx="${x}" cy="96" r="24" fill="${bg}"/><circle cx="${x}" cy="96" r="19" fill="#1A1F1D"/><circle cx="${x}" cy="96" r="10" fill="#A9B1AE"/><circle cx="${x}" cy="96" r="3" fill="#1A1F1D"/>`;
  return `<svg viewBox="0 0 320 124" width="100%" role="img" aria-label="${esc(carName(car))}">
    <ellipse cx="160" cy="116" rx="138" ry="6" fill="rgba(15,32,25,.16)"/>
    <path d="${s.body}" fill="${car.color}"/>
    <path d="${s.body}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>
    <path d="${s.win}" fill="#1B2B33" opacity=".88"/>
    <line x1="${s.div}" y1="${s.top}" x2="${s.div}" y2="62" stroke="${car.color}" stroke-width="5"/>
    <path d="M30,80 L292,80" stroke="rgba(255,255,255,.28)" stroke-width="2"/>
    <rect x="284" y="70" width="14" height="5" rx="2.5" fill="#FFF4C2"/>
    <rect x="18" y="72" width="9" height="5" rx="2" fill="#E0483E"/>
    <circle cx="46" cy="74" r="3.2" fill="#C6F432" stroke="#0F2019" stroke-width="1"/>
    ${wheel(80)}${wheel(240)}
  </svg>`;
}

/* =========================================================
   5. NAVIGATION & VIEWS
   ========================================================= */
let currentView = 'home';
function renderNav(){
  const nav = $('navLinks');
  const isStaff = user && user.role === 'staff';
  const links = isStaff
    ? [['staff','Console'],['home','View site']]
    : [['home','Rent a car'],['bookings','My bookings'],['return','Return car'],['bills','Bills'],['loc','Locations']];
  nav.innerHTML = links.map(([v,l]) => `<a href="#" data-v="${v}" class="${v===currentView?'active':''}" onclick="event.preventDefault();go('${v}')">${l}</a>`).join('');
}
function go(view, anchor){
  $('navLinks').classList.remove('open');
  if (view === 'loc'){ view = 'home'; anchor = 'locations'; }
  if (['bookings','return','bills'].includes(view) && !user){ openAuth('login'); toast('Please sign in first'); return; }
  if (view === 'staff' && (!user || user.role !== 'staff')){ openAuth('login', true); return; }
  currentView = view;
  ['home','bookings','return','bills','staff'].forEach(v => $('view-'+v).classList.toggle('hidden', v !== view));
  if (view==='home'){ renderFleet(); setTimeout(()=>{ map && map.invalidateSize(); }, 50); }
  if (view==='bookings') renderBookings();
  if (view==='return') renderReturn();
  if (view==='bills') renderBills();
  if (view==='staff') renderStaff();
  renderNav();
  if (anchor) setTimeout(()=>$(anchor).scrollIntoView({behavior:'smooth'}), 60);
  else window.scrollTo({top:0,behavior:'smooth'});
}

/* =========================================================
   6. AUTH
   ========================================================= */
let staffLoginHint = false;
function openAuth(tab, staff){ staffLoginHint = !!staff; authTab(tab); $('lErr').textContent=''; $('rErr').textContent=''; openM('m-auth'); }
function authTab(t){
  $('loginForm').classList.toggle('hidden', t!=='login'); $('regForm').classList.toggle('hidden', t!=='register');
  $('tabLogin').classList.toggle('on', t==='login'); $('tabReg').classList.toggle('on', t==='register');
}
function fillDemo(k){ authTab('login'); $('lEmail').value = k==='s'?'staff@azoom.sg':'demo@azoom.sg'; $('lPass').value = k==='s'?'staff123':'demo123'; }
function login(e){
  e.preventDefault();
  const email = $('lEmail').value.trim().toLowerCase(), pass = $('lPass').value;
  const u = getUsers().find(x => x.email === email && x.password === pass);
  if (!u){ $('lErr').textContent = 'That email and password don\u2019t match an account.'; return; }
  setSession(u); closeM('m-auth'); toast(`Welcome back, ${u.name.split(' ')[0]}`);
  if (pendingCar){ const id = pendingCar; pendingCar = null; if (u.role==='customer') startBooking(id); }
}
function register(e){
  e.preventDefault();
  const name = $('rName').value.trim(), email = $('rEmail').value.trim().toLowerCase(), pass = $('rPass').value;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return $('rErr').textContent = 'Enter your name and a valid email.';
  if (pass.length < 6) return $('rErr').textContent = 'Password must be at least 6 characters.';
  const users = getUsers();
  if (users.some(u=>u.email===email)) return $('rErr').textContent = 'An account with this email already exists.';
  const u = { name, email, password:pass, role:'customer' };   // staff accounts are created by admin, not self-registered
  users.push(u); save(KEY.users, users);
  setSession(u); closeM('m-auth'); toast('Account created');
  if (pendingCar){ const id = pendingCar; pendingCar = null; startBooking(id); }
}
function setSession(u){ user = { name:u.name, email:u.email, role:u.role }; save(KEY.session, user); updateAuthUI(); }
function logout(){ localStorage.removeItem(KEY.session); user = null; updateAuthUI(); toast('Signed out'); }
function updateAuthUI(){
  $('signInBtn').classList.toggle('hidden', !!user);
  $('acct').classList.toggle('hidden', !user);
  if (user){ $('acctName').textContent = user.name; $('acctRole').textContent = user.role; $('acctAv').textContent = initials(user.name); }
  go(user && user.role==='staff' ? 'staff' : 'home');
}

/* =========================================================
   7. SEARCH WIDGET
   ========================================================= */
const TIMES = []; for (let h=8; h<=21; h++){ ['00','30'].forEach(m => { if (h===21 && m==='30') return; TIMES.push(`${String(h).padStart(2,'0')}:${m}`); }); }
function initSearch(){
  $('sBranch').innerHTML = Object.values(BRANCHES).map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
  const opts = TIMES.map(t=>`<option>${t}</option>`).join('');
  $('sPickTime').innerHTML = opts; $('sRetTime').innerHTML = opts;
  const t = new Date(); t.setDate(t.getDate()+1);
  const r = new Date(t); r.setDate(r.getDate()+3);
  $('sPickDate').value = isoDate(t); $('sRetDate').value = isoDate(r);
  $('sPickDate').min = isoDate(new Date()); $('sRetDate').min = isoDate(new Date());
  $('sPickTime').value = '10:00'; $('sRetTime').value = '10:00';
  updateSearchSum();
}
function readSearch(){
  const start = new Date(`${$('sPickDate').value}T${$('sPickTime').value}`);
  const end = new Date(`${$('sRetDate').value}T${$('sRetTime').value}`);
  const ms = end - start;
  const days = Math.max(1, Math.ceil((ms - 59*60000) / 86400000)); // 59-min grace period
  let error = '';
  if (isNaN(start) || isNaN(end)) error = 'Choose pick-up and return dates.';
  else if (start < new Date()) error = 'Pick-up time is in the past.';
  else if (ms <= 0) error = 'Return must be after pick-up.';
  else if (days > 90) error = 'For rentals over 90 days, please contact us.';
  return { branch:$('sBranch').value, start, end, days, error };
}
function setPreset(n, btn){
  document.querySelectorAll('.search-tabs button').forEach(b=>b.classList.toggle('on', b===btn));
  const s = new Date(`${$('sPickDate').value}T00:00`); s.setDate(s.getDate()+n);
  $('sRetDate').value = isoDate(s); $('sRetTime').value = $('sPickTime').value;
  updateSearchSum(); renderFleet();
}
function onSearchChange(isReturn){
  if (!isReturn && $('sRetDate').value < $('sPickDate').value){
    const d = new Date(`${$('sPickDate').value}T00:00`); d.setDate(d.getDate()+1); $('sRetDate').value = isoDate(d);
  }
  const { days } = readSearch();
  document.querySelectorAll('.search-tabs button').forEach(b=>b.classList.toggle('on', +b.dataset.p === (days>=30?30:days>=7?7:1)));
  updateSearchSum(); renderFleet();
}
function updateSearchSum(){
  const s = readSearch();
  $('searchSum').innerHTML = s.error ? `<span class="search-err">${s.error}</span>`
    : `<b>${s.days} day${s.days>1?'s':''}</b> · ${dtfmt(s.start)} → ${dtfmt(s.end)} · Pick up at <b>${BRANCHES[s.branch].name}</b>`;
}
function applySearch(){
  const s = readSearch(); if (s.error) return toast(s.error);
  go('home','fleet');
}

/* =========================================================
   8. FLEET LISTING
   ========================================================= */
const filters = { type:'all', seats:0 };
const TYPES = [['all','All'],['sedan','Sedan'],['suv','SUV'],['crossover','Crossover'],['hatchback','Hatchback'],['mpv','MPV']];
function renderChips(){
  $('typeChips').innerHTML = TYPES.map(([v,l])=>`<button class="chip ${filters.type===v?'on':''}" onclick="filters.type='${v}';renderChips();renderFleet()">${l}</button>`).join('');
  $('seatChips').innerHTML = [[0,'Any'],[5,'5+'],[7,'7']].map(([v,l])=>`<button class="chip ${filters.seats===v?'on':''}" onclick="filters.seats=${v};renderChips();renderFleet()">${l}</button>`).join('');
}
function resetFilters(){ filters.type='all'; filters.seats=0; $('fPrice').value=320; $('fAvail').checked=false; $('fSort').value='rec'; renderChips(); renderFleet(); }

const BUSY = ['reserved','active','returned'];
function availability(car, s){
  if (car.status === 'maintenance') return { ok:false, label:'In maintenance', cls:'violet' };
  const now = new Date();
  const clash = getBookings().some(b => {
    if (b.carId !== car.id || !BUSY.includes(b.status)) return false;
    const bs = new Date(b.pickupAt);
    let be = new Date(b.returnAt);
    if (b.status !== 'reserved'){ const buf = new Date(now.getTime()+24*3600e3); if (be < buf) be = buf; } // still out / being inspected
    return s.start < be && s.end > bs;
  });
  if (clash) return { ok:false, label:'Booked for these dates', cls:'bad' };
  if (car.status === 'rented' || car.status === 'returned'){
    if (s.start < new Date(now.getTime()+24*3600e3)) return { ok:false, label:'On rent', cls:'bad' };
  }
  if (car.status === 'charging' && s.start < new Date(now.getTime()+4*3600e3)) return { ok:false, label:'Charging', cls:'warn' };
  return { ok:true, label:'Available', cls:'ok' };
}
function renderFleet(){
  const s = readSearch();
  $('fPriceVal').textContent = 'S$' + $('fPrice').value;
  const max = +$('fPrice').value;
  let list = getFleet().map(c => ({ c, a: s.error ? {ok:false,label:'Check dates',cls:'neutral'} : availability(c, s) }));
  list = list.filter(({c,a}) =>
    (filters.type==='all' || c.type===filters.type) &&
    (filters.seats===0 || (filters.seats===5 ? c.seats>=5 : c.seats>=7)) &&
    c.price <= max && (!$('fAvail').checked || a.ok));
  const sort = $('fSort').value;
  list.sort((x,y) => {
    if (sort==='low') return x.c.price - y.c.price;
    if (sort==='high') return y.c.price - x.c.price;
    if (sort==='range') return y.c.range - x.c.range;
    return (y.a.ok - x.a.ok) || (x.c.price - y.c.price);
  });
  $('fleetCount').textContent = `${list.filter(x=>x.a.ok).length} of ${list.length} cars available`;
  if (!list.length){ $('fleetGrid').innerHTML = `<div class="empty"><h3>No cars match those filters</h3><p style="margin:6px 0 14px">Try a higher price or a different body type.</p><button class="btn btn-line btn-sm" onclick="resetFilters()">Reset filters</button></div>`; return; }
  $('fleetGrid').innerHTML = list.map(({c,a},i) => {
    const total = s.error ? null : rentalCost(c, s.days).total;
    return `<article class="car ${a.ok?'':'off'}" style="animation-delay:${i*40}ms">
      <div class="car-img" onclick="viewCar(${c.id})" title="View details">
        <span class="pill ${a.cls}">${a.label}</span><span class="plate">${c.plate}</span>
        ${carPic(c)}
      </div>
      <div class="car-body">
        <span class="car-type">${c.type}</span>
        <h3 class="car-name">${esc(carName(c))}</h3>
        <div class="specs">
          <span>👤 ${c.seats} seats</span><span>⚡ ${c.range} km</span><span>🧳 ${c.boot} L</span>
        </div>
        <div class="car-foot">
          <div><div class="price">${money0(c.price)}<small> /day</small></div>
            ${total!==null ? `<div class="price-total">${money0(total)} for ${s.days} day${s.days>1?'s':''} · excl. GST</div>` : ''}</div>
          ${a.ok ? `<button class="btn btn-ink btn-sm" onclick="startBooking(${c.id})">Select</button>` : `<button class="btn btn-line btn-sm" onclick="viewCar(${c.id})">Details</button>`}
        </div>
      </div>
    </article>`;
  }).join('');
}
function viewCar(id){
  const c = getFleet().find(x=>x.id===id), s = readSearch();
  const a = s.error ? {ok:false} : availability(c, s);
  const rc = rentalCost(c, 1);
  $('carDetail').innerHTML = `<div class="detail-grid">
    <div class="detail-art"><span class="plate" style="align-self:flex-start;margin-bottom:20px">${c.plate}</span>${carPic(c)}</div>
    <div class="modal-pad">
      <span class="car-type">${c.type} · ${c.seats} seats</span>
      <h2 style="font-size:2rem;margin:4px 0 6px">${esc(carName(c))}</h2>
      <span class="pill ${a.ok?'ok':'bad'}">${a.ok?'Available for your dates':(a.label||'Check dates')}</span>
      <div class="spec-grid">
        <div><b>${c.range} km</b><span>WLTP range</span></div>
        <div><b>${c.charge} min</b><span>DC fast charge 10–80%</span></div>
        <div><b>${c.boot} L</b><span>Boot space</span></div>
        <div><b>Type 2 / CCS2</b><span>Connectors</span></div>
      </div>
      <span class="lbl">Rates</span>
      <table class="rates">
        <tr><td>Per day</td><td>${money0(c.price)}</td></tr>
        <tr><td>Per week <span class="tag">1 day free</span></td><td>${money0(rc.weekly)}</td></tr>
        <tr><td>Per month <span class="tag">save ~25%</span></td><td>${money0(rc.monthly)}</td></tr>
      </table>
      <ul class="incl"><li>Basic cover and 24/7 roadside assistance</li><li>Unlimited mileage within Singapore</li><li>Delivered fully charged</li></ul>
      <button class="btn btn-volt btn-block" ${a.ok?'':'disabled'} onclick="closeM('m-car');startBooking(${c.id})">${a.ok?'Book this car':'Not available for these dates'}</button>
    </div></div>`;
  openM('m-car');
}

/* =========================================================
   9. BOOKING FLOW (Extras → Driver → Payment → Confirmed)
   ========================================================= */
let bk = null, pendingCar = null;
function startBooking(id){
  if (!user){ pendingCar = id; openAuth('login'); toast('Sign in or create an account to book'); return; }
  if (user.role !== 'customer'){ toast('Staff accounts can\u2019t make bookings'); return; }
  const s = readSearch(); if (s.error){ toast(s.error); go('home','search'); return; }
  const car = getFleet().find(c=>c.id===id);
  if (!availability(car, s).ok){ toast('Sorry, that car is no longer available for these dates'); renderFleet(); return; }
  bk = { carId:id, step:1, search:s, prot:'basic', extras:[], driver:{}, card:null };
  renderBk(); openM('m-book');
}
function bkQuote(){ const car = getFleet().find(c=>c.id===bk.carId); return quote(car, bk.search.days, bk.prot, bk.extras); }
function renderBk(){
  const car = getFleet().find(c=>c.id===bk.carId), q = bkQuote(), s = bk.search;
  const steps = ['Protection & extras','Driver','Payment'];
  const stepper = `<div class="stepper">${steps.map((t,i)=>`<div class="${i+1===bk.step?'on':i+1<bk.step?'done':''}">${i+1}. ${t}</div>`).join('')}</div>`;
  let html = '';
  if (bk.step === 1){
    html = `${stepper}<h3 style="margin-bottom:12px">Protection</h3>
      ${PROTECTION.map(p=>`<label class="opt ${bk.prot===p.id?'on':''}"><input type="radio" name="prot" ${bk.prot===p.id?'checked':''} onchange="bk.prot='${p.id}';renderBk()">
        <span class="t"><b>${p.name}${p.tag?`<span class="tag">${p.tag}</span>`:''}</b><small>${p.desc}</small></span>
        <span class="p">${p.rate?`+${money0(p.rate)}/day`:'Included'}</span></label>`).join('')}
      <h3 style="margin:22px 0 12px">Extras</h3>
      ${EXTRAS.map(e=>`<label class="opt ${bk.extras.includes(e.id)?'on':''}"><input type="checkbox" ${bk.extras.includes(e.id)?'checked':''} onchange="toggleExtra('${e.id}')">
        <span class="t"><b>${e.name}</b><small>${e.desc}</small></span>
        <span class="p">${e.flat?`${money0(e.flat)} flat`:`+${money0(e.rate)}/day`}</span></label>`).join('')}
      <button class="btn btn-ink btn-block" style="margin-top:14px" onclick="bk.step=2;renderBk()">Continue to driver details</button>`;
  } else if (bk.step === 2){
    const d = bk.driver;
    html = `${stepper}<h3 style="margin-bottom:14px">Main driver</h3>
      <div class="row2">
        <div class="field"><label>Full name</label><input class="input" value="${esc(user.name)}" readonly></div>
        <div class="field"><label for="dPhone">Mobile</label><input class="input" id="dPhone" placeholder="+65 9123 4567" value="${esc(d.phone||'')}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="dDob">Date of birth</label><input class="input" type="date" id="dDob" value="${esc(d.dob||'')}"></div>
        <div class="field"><label for="dIssue">Licence issue date</label><input class="input" type="date" id="dIssue" value="${esc(d.issue||'')}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="dLicType">Licence type</label>
          <select class="input" id="dLicType" onchange="bk.driver.lic=this.value;$('transGrp').classList.toggle('hidden',this.value!=='foreign-other')">
            <option value="sg" ${d.lic==='sg'?'selected':''}>Singapore Class 3 / 3A</option>
            <option value="foreign-en" ${d.lic==='foreign-en'?'selected':''}>Foreign licence (English)</option>
            <option value="foreign-other" ${d.lic==='foreign-other'?'selected':''}>Foreign licence (non-English)</option>
          </select></div>
        <div class="field"><label for="dLicNo">Licence number</label><input class="input" id="dLicNo" value="${esc(d.licNo||'')}" placeholder="S1234567A"></div>
      </div>
      <div class="field"><label>Licence photo (front)</label><input class="input" type="file" accept="image/*,.pdf"></div>
      <div class="field ${d.lic==='foreign-other'?'':'hidden'}" id="transGrp"><label>International Driving Permit or certified translation</label><input class="input" type="file" accept="image/*,.pdf"></div>
      ${s.branch==='ch' ? `<div class="field"><label for="dFlight">Flight number (optional)</label><input class="input" id="dFlight" value="${esc(d.flight||'')}" placeholder="SQ 321"><span class="hint">We'll hold your car if your flight is delayed.</span></div>`:''}
      <label class="check" style="margin:6px 0 14px"><input type="checkbox" id="dTerms" ${d.terms?'checked':''}> I am 23 or older, have held my licence for 2+ years, and accept the rental terms.</label>
      <p class="err-msg" id="drvErr"></p>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="btn btn-line" onclick="saveDriver(false);bk.step=1;renderBk()">Back</button><button class="btn btn-ink" style="flex:1" onclick="saveDriver(true)">Continue to payment</button></div>`;
  } else if (bk.step === 3){
    html = `${stepper}<h3 style="margin-bottom:14px">Pay by credit card</h3>
      <div class="cardbox" aria-hidden="true"><div class="row"><span>AZoom secure checkout</span><span id="cBrand">Card</span></div><div class="num" id="cPreview">•••• •••• •••• ••••</div><div class="row"><span id="cNamePrev">${esc(user.name)}</span><span id="cExpPrev">MM/YY</span></div></div>
      <div class="field"><label for="cNum">Card number</label><input class="input mono" id="cNum" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="19" oninput="fmtCard(this)"></div>
      <div class="row2">
        <div class="field"><label for="cExp">Expiry</label><input class="input mono" id="cExp" placeholder="MM/YY" maxlength="5" autocomplete="cc-exp" oninput="fmtExp(this)"></div>
        <div class="field"><label for="cCvc">CVC</label><input class="input mono" id="cCvc" placeholder="123" maxlength="4" inputmode="numeric" autocomplete="cc-csc"></div>
      </div>
      <div class="field"><label for="cName">Name on card</label><input class="input" id="cName" value="${esc(user.name)}" oninput="$('cNamePrev').textContent=this.value||' '"></div>
      <p class="hint" style="margin-bottom:6px">Demo: use test card 4242 4242 4242 4242, any future date and any CVC. Nothing is charged.</p>
      <p class="err-msg" id="payErr"></p>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn btn-line" onclick="bk.step=2;renderBk()">Back</button><button class="btn btn-volt" style="flex:1" id="payBtn" onclick="pay()">Pay ${money(q.total)}</button></div>
      <p class="hint" style="text-align:center;margin-top:10px">🔒 A further ${money0(DEPOSIT)} deposit is held on this card at pick-up and released after inspection.</p>`;
  }
  $('bkMain').innerHTML = html;
  $('bkSide').innerHTML = `
    <div class="sum-car"><div class="t">${carPic(car)}</div><div><b>${esc(carName(car))}</b><div class="hint">${car.type} · ${car.seats} seats</div></div></div>
    <div class="sum-line"><span>Pick-up</span><span style="text-align:right">${BRANCHES[s.branch].name}<br><b>${dtfmt(s.start)}</b></span></div>
    <div class="sum-line"><span>Return</span><span style="text-align:right">Any AZoom car park<br><b>${dtfmt(s.end)}</b></span></div>
    <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
    ${q.lines.map(l=>`<div class="sum-line"><span>${esc(l.label)}</span><span>${money(l.amount)}</span></div>`).join('')}
    <div class="sum-line"><span>GST (9%)</span><span>${money(q.gst)}</span></div>
    <div class="sum-line total"><span>Total now</span><span>${money(q.total)}</span></div>
    <p class="hint" style="margin-top:12px">Free cancellation until ${dtfmt(new Date(s.start.getTime()-24*3600e3))}.</p>`;
}
function toggleExtra(id){ const i = bk.extras.indexOf(id); i>-1 ? bk.extras.splice(i,1) : bk.extras.push(id); renderBk(); }
function saveDriver(validate){
  const d = bk.driver;
  d.phone = $('dPhone').value.trim(); d.dob = $('dDob').value; d.issue = $('dIssue').value;
  d.lic = $('dLicType').value; d.licNo = $('dLicNo').value.trim(); d.terms = $('dTerms').checked;
  if ($('dFlight')) d.flight = $('dFlight').value.trim();
  if (!validate) return;
  const age = d.dob ? (bk.search.start - new Date(d.dob)) / (365.25*86400e3) : 0;
  const held = d.issue ? (bk.search.start - new Date(d.issue)) / (365.25*86400e3) : 0;
  let err = '';
  if (!/^\+?[\d\s]{8,15}$/.test(d.phone)) err = 'Enter a valid mobile number.';
  else if (!d.dob) err = 'Enter your date of birth.';
  else if (age < 23) err = 'Drivers must be at least 23 years old.';
  else if (age > 75) err = 'Drivers over 75 need to contact us to book.';
  else if (!d.issue || held < 2) err = 'You must have held your licence for at least 2 years.';
  else if (d.licNo.length < 5) err = 'Enter your licence number.';
  else if (!d.terms) err = 'Please accept the rental terms.';
  if (err){ $('drvErr').textContent = err; return; }
  bk.step = 3; renderBk();
}
function cardBrand(n){ if (/^4/.test(n)) return 'Visa'; if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard'; if (/^3[47]/.test(n)) return 'Amex'; return 'Card'; }
function luhn(n){ let s=0, alt=false; for (let i=n.length-1;i>=0;i--){ let d=+n[i]; if (alt){ d*=2; if (d>9) d-=9; } s+=d; alt=!alt; } return n.length>=13 && s%10===0; }
function fmtCard(el){
  const n = el.value.replace(/\D/g,'').slice(0,16); el.value = n.replace(/(\d{4})(?=\d)/g,'$1 ');
  $('cPreview').textContent = (n + '•'.repeat(16-n.length)).replace(/(.{4})(?=.)/g,'$1 ');
  $('cBrand').textContent = cardBrand(n);
}
function fmtExp(el){ let v = el.value.replace(/\D/g,'').slice(0,4); if (v.length>2) v = v.slice(0,2)+'/'+v.slice(2); el.value = v; $('cExpPrev').textContent = v || 'MM/YY'; }
function pay(){
  const n = $('cNum').value.replace(/\s/g,''), exp = $('cExp').value, cvc = $('cCvc').value, name = $('cName').value.trim();
  const [mm, yy] = exp.split('/').map(Number);
  const expDate = new Date(2000+yy, mm, 0, 23, 59);
  let err = '';
  if (!luhn(n)) err = 'That card number isn\u2019t valid.';
  else if (!(mm>=1 && mm<=12) || isNaN(yy)) err = 'Enter expiry as MM/YY.';
  else if (expDate < bk.search.end) err = 'Card must be valid until after the rental ends.';
  else if (!/^\d{3,4}$/.test(cvc)) err = 'Enter the 3 or 4 digit CVC.';
  else if (!name) err = 'Enter the name on the card.';
  if (err){ $('payErr').textContent = err; return; }
  const btn = $('payBtn'); btn.disabled = true; btn.textContent = 'Authorising…';
  setTimeout(() => confirmBooking({ brand:cardBrand(n), last4:n.slice(-4) }), 1200);
}
function confirmBooking(card){
  const car = getFleet().find(c=>c.id===bk.carId), q = bkQuote(), s = bk.search;
  const b = {
    id:Date.now(), ref:newRef(), carId:car.id, carName:carName(car), plate:car.plate,
    userEmail:user.email, userName:user.name, branch:s.branch,
    pickupAt:s.start.toISOString(), returnAt:s.end.toISOString(), days:s.days,
    lines:q.lines, subtotal:q.subtotal, gst:q.gst, total:q.total,
    protection:q.prot.id, extras:[...bk.extras], driver:{...bk.driver}, card,
    status:'reserved', createdAt:new Date().toISOString(),
    payments:[{ label:'Reservation payment', amount:q.total, at:new Date().toISOString() }],
    charges:[], dispute:{ status:'none', reason:'', reply:'' }
  };
  const all = getBookings(); all.push(b); setBookings(all);
  $('bkSide').innerHTML = `<h4 style="margin-bottom:10px">What happens next</h4><ol style="padding-left:18px;font-size:.88rem;display:grid;gap:8px">
    <li>Bring your licence and this card to <b>${BRANCHES[b.branch].name}</b>.</li><li>Show the QR code at the counter.</li><li>A ${money0(DEPOSIT)} deposit is held when you collect.</li><li>Return to any AZoom car park by <b>${dtfmt(b.returnAt)}</b>.</li></ol>`;
  $('bkMain').innerHTML = `<div class="done-box">
    <div class="done-ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0F2019" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg></div>
    <h2>You're booked</h2><p class="hint">Confirmation sent to ${esc(user.email)}</p>
    <div class="kv">
      <div><span>Booking reference</span><b class="mono">${b.ref}</b></div>
      <div><span>Car</span><b>${esc(b.carName)} · ${b.plate}</b></div>
      <div><span>Pick-up</span><b>${dtfmt(b.pickupAt)}</b></div>
      <div><span>Paid</span><b>${money(b.total)} · ${card.brand} •••• ${card.last4}</b></div>
    </div>
    <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${b.ref}" alt="Booking QR code ${b.ref}" onerror="qrFail(this,'${b.ref}')"></div>
    <p class="hint" style="margin:8px 0 18px">Show this at the counter</p>
    <button class="btn btn-ink btn-block" onclick="closeM('m-book');go('bookings')">Go to my bookings</button></div>`;
  renderFleet(); toast('Booking confirmed · ' + b.ref);
}

/* =========================================================
   10. MY BOOKINGS
   ========================================================= */
const FLOW = ['reserved','active','returned','inspected','closed'];
const FLOW_LABEL = ['Reserved','Picked up','Returned','Inspected','Settled'];
function timeline(st){
  const i = FLOW.indexOf(st);
  return `<div class="timeline">${FLOW_LABEL.map((l,k)=>`<div class="${k<=i?'done':''} ${k===i?'now':''}">${l}</div>`).join('')}</div>`;
}
const chargesTotal = b => r2(b.charges.reduce((s,c)=>s+c.amount,0) * (1+GST));
const balanceDue = b => (b.status==='inspected' && b.dispute.status!=='accepted') ? chargesTotal(b) : 0;

function renderBookings(){
  const car = id => getFleet().find(c=>c.id===id);
  const list = getBookings().filter(b=>b.userEmail===user.email).sort((a,b)=>b.id-a.id);
  if (!list.length){ $('bookingsList').innerHTML = `<div class="card empty-page"><h3>No bookings yet</h3><p class="hint" style="margin-bottom:16px">Pick some dates and choose a car to get started.</p><button class="btn btn-volt" onclick="go('home','fleet')">Browse cars</button></div>`; return; }
  $('bookingsList').innerHTML = list.map(b => {
    const st = STATUS_INFO[b.status]; let actions = '';
    if (b.status==='reserved') actions = `<div class="qr" style="align-self:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${b.ref}" alt="QR" style="width:90px;height:90px" onerror="qrFail(this,'${b.ref}')"></div><button class="btn btn-line btn-sm" onclick="cancelBooking(${b.id})">Cancel booking</button>`;
    if (b.status==='active') actions = `<button class="btn btn-volt btn-sm" onclick="go('return');setTimeout(()=>{$('rBooking').value='${b.id}'},50)">Return car</button><button class="btn btn-line btn-sm" onclick="extendBooking(${b.id})">Extend by 1 day</button>`;
    if (b.status==='inspected') actions = `<button class="btn btn-ink btn-sm" onclick="viewBill(${b.id})">View final bill</button>`;
    if (b.status==='closed' || b.status==='cancelled') actions = `<button class="btn btn-line btn-sm" onclick="viewBill(${b.id})">View invoice</button>`;
    if (b.status==='returned') actions = `<span class="hint" style="text-align:center">We'll notify you once inspection is done.</span>`;
    return `<article class="card bk">
      <div class="thumb">${carPic(car(b.carId))}</div>
      <div>
        <span class="pill ${st.cls}">${st.label}</span> <span class="hint mono" style="margin-left:6px">${b.ref}</span>
        <h3>${esc(b.carName)} <span class="plate" style="vertical-align:middle">${b.plate}</span></h3>
        <div class="meta">
          <span><b>Pick-up</b>${dtfmt(b.pickupAt)} · ${BRANCHES[b.branch].name}</span>
          <span><b>Return by</b>${dtfmt(b.returnAt)}</span>
          <span><b>Paid</b>${money(b.payments.reduce((s,p)=>s+p.amount,0))}</span>
        </div>
        ${b.status==='cancelled' ? `<p class="hint" style="margin-top:10px">Cancelled · refund ${money(b.refund||0)}</p>` : timeline(b.status)}
      </div>
      <div class="bk-actions">${actions}</div>
    </article>`;
  }).join('');
}
function cancelBooking(id){
  const all = getBookings(), b = all.find(x=>x.id===id);
  const free = new Date(b.pickupAt) - new Date() > 24*3600e3;
  const car = getFleet().find(c=>c.id===b.carId);
  const fee = free ? 0 : r2(car.price*(1+GST));
  if (!confirm(free ? 'Cancel this booking? You will get a full refund.' : `Pick-up is within 24 hours, so a late cancellation fee of ${money(fee)} applies. Cancel anyway?`)) return;
  b.status = 'cancelled'; b.refund = r2(b.total - fee); b.cancelledAt = new Date().toISOString();
  b.payments.push({ label:'Refund', amount:-b.refund, at:b.cancelledAt });
  setBookings(all); renderBookings(); toast(`Booking cancelled · ${money(b.refund)} refunded`);
}
function extendBooking(id){
  const all = getBookings(), b = all.find(x=>x.id===id);
  const car = getFleet().find(c=>c.id===b.carId);
  const newEnd = new Date(new Date(b.returnAt).getTime()+86400e3);
  const clash = all.some(o => o.id!==b.id && o.carId===b.carId && o.status==='reserved' && new Date(o.pickupAt) < newEnd);
  if (clash) return toast('This car is booked by someone else right after you, so it can\u2019t be extended.');
  const q = quote(car, b.days+1, b.protection, b.extras);
  const diff = r2(q.total - b.total);
  if (!confirm(`Extend to ${dtfmt(newEnd)}? ${money(diff)} will be charged to your ${b.card.brand} •••• ${b.card.last4}.`)) return;
  Object.assign(b, { days:b.days+1, returnAt:newEnd.toISOString(), lines:q.lines, subtotal:q.subtotal, gst:q.gst, total:q.total });
  b.payments.push({ label:'Extension (1 day)', amount:diff, at:new Date().toISOString() });
  setBookings(all); renderBookings(); toast(`Extended · ${money(diff)} charged`);
}

/* =========================================================
   11. RETURN CAR (customer self check-out)
   ========================================================= */
function renderReturn(){
  const active = getBookings().filter(b=>b.userEmail===user.email && b.status==='active');
  if (!active.length){ $('returnForm').innerHTML = `<div class="empty-page" style="padding:30px 10px"><h3>No car to return</h3><p class="hint">Cars show up here once you've collected them from a branch.</p></div>`; return; }
  $('returnForm').innerHTML = `
    <div class="field"><label for="rBooking">Rental</label><select class="input" id="rBooking">${active.map(b=>`<option value="${b.id}">${esc(b.carName)} · ${b.plate} · ${b.ref}</option>`).join('')}</select></div>
    <div class="field"><label for="rPark">Car park</label><select class="input" id="rPark">${CARPARKS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
    <div class="row2">
      <div class="field"><label for="rBatt">Battery level (%)</label><input class="input" type="number" id="rBatt" min="0" max="100" placeholder="e.g. 64"></div>
      <div class="field"><label for="rLot">Lot number</label><input class="input" id="rLot" placeholder="e.g. B1-44"></div>
    </div>
    <div class="field"><label>Photos (front, rear, left, right)</label><input class="input" type="file" id="rPhotos" accept="image/*" multiple><span class="hint" id="rPhotoHint">0 of 4 photos added</span></div>
    <label class="check" style="margin-bottom:8px"><input type="checkbox" id="rPlug"> The car is plugged into the bay charger</label>
    <label class="check" style="margin-bottom:16px"><input type="checkbox" id="rKey"> Key card is in the glovebox and the car is locked</label>
    <p class="err-msg" id="rErr"></p>
    <button class="btn btn-ink btn-block" onclick="submitReturn()">Check out & end rental</button>`;
  $('rPhotos').onchange = e => $('rPhotoHint').textContent = `${Math.min(e.target.files.length,4)} of 4 photos added`;
}
function submitReturn(){
  const id = +$('rBooking').value, batt = parseInt($('rBatt').value);
  let err = '';
  if (isNaN(batt) || batt<0 || batt>100) err = 'Enter the battery level shown on the dashboard (0–100).';
  else if ($('rPhotos').files.length < 4) err = 'Please add all 4 photos so we can compare at inspection.';
  else if (!$('rPlug').checked || !$('rKey').checked) err = 'Please confirm the car is plugged in and locked.';
  if (err){ $('rErr').textContent = err; return; }
  const all = getBookings(), b = all.find(x=>x.id===id);
  Object.assign(b, { status:'returned', returnedAt:new Date().toISOString(), batteryIn:batt, carpark:$('rPark').value, lot:$('rLot').value.trim() });
  setBookings(all);
  const fleet = getFleet(); const car = fleet.find(c=>c.id===b.carId); car.status='returned'; car.battery=batt; setFleet(fleet);
  toast('Rental ended. Our team will inspect the car shortly.'); go('bookings');
}

/* =========================================================
   12. BILLS & INVOICE
   ========================================================= */
function billStatus(b){
  if (b.status==='cancelled') return { t:'Cancelled', cls:'neutral', color:'#6B7280' };
  if (b.dispute.status==='pending') return { t:'Under review', cls:'warn', color:'#B45309' };
  if (b.status==='inspected') return { t:'Balance due', cls:'bad', color:'#B91C1C' };
  if (b.status==='closed') return { t:'Paid', cls:'ok', color:'#15803D' };
  return { t:'Paid · rental open', cls:'info', color:'#1D4ED8' };
}
function renderBills(){
  const list = getBookings().filter(b=>b.userEmail===user.email).sort((a,b)=>b.id-a.id);
  if (!list.length){ $('billsList').innerHTML = `<div class="card empty-page" style="grid-column:1/-1"><h3>No bills yet</h3><p class="hint">Your invoices appear here after you book.</p></div>`; return; }
  $('billsList').innerHTML = list.map(b => {
    const st = billStatus(b), due = balanceDue(b);
    return `<article class="card bill" onclick="viewBill(${b.id})" tabindex="0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span class="mono hint">${b.ref}</span><span class="pill ${st.cls}">${st.t}</span></div>
      <h3 style="font-size:1.15rem">${esc(b.carName)}</h3>
      <p class="hint">${dfmt(b.pickupAt)} – ${dfmt(b.returnAt)}</p>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;padding-top:14px;border-top:1px dashed var(--line)">
        <span class="hint">${due?'Balance due':'Total paid'}</span>
        <span class="amt" style="${due?'color:var(--bad)':''}">${money(due || b.payments.reduce((s,p)=>s+p.amount,0))}</span>
      </div></article>`;
  }).join('');
}
function viewBill(id){
  const b = getBookings().find(x=>x.id===id), st = billStatus(b), due = balanceDue(b);
  const waived = b.dispute.status==='accepted';
  const cSub = r2(b.charges.reduce((s,c)=>s+c.amount,0)), cGst = r2(cSub*GST);
  let disputeBox = '';
  if (b.charges.length){
    if (b.dispute.status==='none' && b.status==='inspected') disputeBox = `<div class="alert warn no-print">Think a charge is wrong? <button class="btn btn-line btn-sm" style="margin-left:8px" onclick="openDispute(${b.id})">Appeal charge</button></div>`;
    if (b.dispute.status==='pending') disputeBox = `<div class="alert warn"><b>Appeal under review.</b> Payment of the disputed amount is on hold.<br>Your reason: “${esc(b.dispute.reason)}”</div>`;
    if (b.dispute.status==='accepted') disputeBox = `<div class="alert ok"><b>Appeal accepted.</b> The post-rental charges have been waived.${b.dispute.reply?`<br>AZoom: “${esc(b.dispute.reply)}”`:''}</div>`;
    if (b.dispute.status==='rejected') disputeBox = `<div class="alert bad"><b>Appeal declined.</b> The charges stand.${b.dispute.reply?`<br>AZoom: “${esc(b.dispute.reply)}”`:''}</div>`;
  }
  $('billDetail').innerHTML = `<div class="invoice">
    <div class="inv-head">
      <div><h2>AZoom</h2><p style="color:#555;font-size:.85rem">AZoom Car Rental Pte Ltd (fictional)<br>1 Raffles Place, #B1-12, Singapore 048616<br>GST Reg. No. 201912345K</p></div>
      <div style="text-align:right"><div style="font-size:.75rem;letter-spacing:.15em;font-weight:800;color:#666">TAX INVOICE</div>
        <div class="mono" style="font-size:1.2rem;font-weight:700">${b.ref}</div><div style="font-size:.85rem;color:#555">Issued ${dfmt(b.createdAt)}</div>
        <div class="stamp" style="color:${st.color};border-color:${st.color}">${st.t}</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:10px;font-size:.88rem">
      <div><div class="inv-sec" style="margin:0 0 4px;color:#666">Billed to</div><b>${esc(b.userName)}</b><br>${esc(b.userEmail)}</div>
      <div style="text-align:right"><div class="inv-sec" style="margin:0 0 4px;color:#666">Rental</div><b>${esc(b.carName)} · ${b.plate}</b><br>${dtfmt(b.pickupAt)} → ${dtfmt(b.returnAt)}<br>${BRANCHES[b.branch].name}</div>
    </div>
    <div class="inv-sec">Reservation</div>
    <table class="inv-table"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
      ${b.lines.map(l=>`<tr><td>${esc(l.label)}</td><td>${money(l.amount)}</td></tr>`).join('')}
      <tr><td>GST 9%</td><td>${money(b.gst)}</td></tr>
      <tr class="sub"><td>Reservation total</td><td>${money(b.total)}</td></tr>
    </tbody></table>
    ${b.charges.length ? `<div class="inv-sec">Post-rental charges · inspected ${dtfmt(b.inspectedAt)}</div>
      <table class="inv-table"><tbody>
        ${b.charges.map(c=>`<tr class="${waived?'strike':''}"><td>${esc(c.label)}</td><td>${money(c.amount)}</td></tr>`).join('')}
        <tr class="${waived?'strike':''}"><td>GST 9%</td><td>${money(cGst)}</td></tr>
        <tr class="sub ${waived?'strike':''}"><td>Charges total</td><td>${money(cSub+cGst)}</td></tr>
      </tbody></table>${b.inspectionNotes?`<p style="font-size:.85rem;color:#555;margin:-10px 0 14px">Inspector notes: ${esc(b.inspectionNotes)}</p>`:''}` : ''}
    <div class="inv-sec">Payments · ${b.card.brand} •••• ${b.card.last4}</div>
    <table class="inv-table"><tbody>${b.payments.map(p=>`<tr><td>${esc(p.label)} · ${dfmt(p.at)}</td><td>${money(p.amount)}</td></tr>`).join('')}</tbody></table>
    <div class="balance"><span>Balance due</span><b style="color:${due?'var(--bad)':'inherit'}">${money(due)}</b></div>
    ${disputeBox}
    <div class="no-print" style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap">
      <button class="btn btn-line" onclick="window.print()">Print / save PDF</button>
      ${due && b.dispute.status!=='pending' ? `<button class="btn btn-volt" onclick="payBalance(${b.id})">Pay ${money(due)}</button>` : ''}
    </div>
    <p style="text-align:center;font-size:.78rem;color:#888;margin-top:22px">Coursework demo invoice. No real payment has been taken.</p>
  </div>`;
  openM('m-bill');
}
function payBalance(id){
  const all = getBookings(), b = all.find(x=>x.id===id), due = balanceDue(b);
  if (!confirm(`Pay ${money(due)} with ${b.card.brand} •••• ${b.card.last4}?`)) return;
  b.payments.push({ label:'Final bill payment', amount:due, at:new Date().toISOString() });
  b.status = 'closed'; b.closedAt = new Date().toISOString();
  setBookings(all); toast('Payment received. Your deposit has been released.');
  viewBill(id); renderBills();
}
function openDispute(id){ closeM('m-bill'); $('dId').value=id; $('dReason').value=''; $('dErr').textContent=''; openM('m-dispute'); }
function submitDispute(){
  const reason = $('dReason').value.trim();
  if (reason.length < 15) return $('dErr').textContent = 'Please describe the issue in a little more detail (15+ characters).';
  const all = getBookings(), b = all.find(x=>x.id===+$('dId').value);
  b.dispute = { status:'pending', reason, reply:'', at:new Date().toISOString() };
  setBookings(all); closeM('m-dispute'); toast('Appeal sent. We reply within 24 hours.'); renderBills();
}

/* =========================================================
   13. STAFF CONSOLE
   ========================================================= */
let staffTab = 'pickups';
function renderStaff(){
  const all = getBookings(), fleet = getFleet();
  $('staffDate').textContent = new Date().toLocaleDateString('en-SG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) + ' · signed in as ' + user.name;
  const pick = all.filter(b=>b.status==='reserved'), insp = all.filter(b=>b.status==='returned'), disp = all.filter(b=>b.dispute.status==='pending');
  const revenue = all.reduce((s,b)=>s+b.payments.reduce((t,p)=>t+p.amount,0),0);
  $('kpis').innerHTML = `
    <div class="kpi"><b>${fleet.filter(c=>c.status==='available').length}<small style="font-size:1rem;color:var(--muted)">/${fleet.length}</small></b><span>Cars ready</span></div>
    <div class="kpi"><b>${all.filter(b=>b.status==='active').length}</b><span>On rent now</span></div>
    <div class="kpi ${insp.length?'hl':''}"><b>${insp.length}</b><span>Awaiting inspection</span></div>
    <div class="kpi"><b>${money0(revenue)}</b><span>Revenue collected</span></div>`;
  const tabs = [['pickups','Pick-ups',pick.length],['inspect','Inspections',insp.length],['disputes','Disputes',disp.length],['fleet','Fleet',0],['all','All bookings',0]];
  $('staffTabs').innerHTML = tabs.map(([k,l,n])=>`<button class="${staffTab===k?'on':''}" onclick="staffTab='${k}';renderStaff()">${l}${n?`<span class="n">${n}</span>`:''}</button>`).join('');
  const body = $('staffBody');
  const none = msg => `<div class="card empty-page"><p class="hint">${msg}</p></div>`;

  if (staffTab==='pickups'){
    body.innerHTML = pick.length ? `<div class="insp">${pick.sort((a,b)=>new Date(a.pickupAt)-new Date(b.pickupAt)).map(b=>{
      const car = fleet.find(c=>c.id===b.carId);
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px"><span class="mono hint">${b.ref}</span><span class="pill info">${dtfmt(b.pickupAt)}</span></div>
        <h3 style="margin:6px 0 2px">${esc(b.carName)} <span class="plate">${b.plate}</span></h3>
        <p class="hint">${esc(b.userName)} · ${esc(b.userEmail)} · ${BRANCHES[b.branch].name}</p>
        <p class="hint" style="margin-bottom:12px">Licence ${esc(b.driver.licNo)} (${esc(b.driver.lic)}) · ${esc(b.driver.phone)}${b.driver.flight?` · Flight ${esc(b.driver.flight)}`:''}</p>
        <div class="field"><label>Battery out (%)</label><input class="input" type="number" id="bo-${b.id}" value="${car.battery}" min="0" max="100"></div>
        <label class="check" style="margin-bottom:6px"><input type="checkbox" id="lv-${b.id}"> Licence checked against booking</label>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" id="dp-${b.id}"> ${money0(DEPOSIT)} deposit held on ${b.card.brand} •••• ${b.card.last4}</label>
        <button class="btn btn-ink btn-block" onclick="handOver(${b.id})">Hand over keys</button></div>`;}).join('')}</div>` : none('No reservations waiting for pick-up.');
  }
  if (staffTab==='inspect'){
    body.innerHTML = insp.length ? `<div class="insp">${insp.map(b=>{
      const prot = PROTECTION.find(p=>p.id===b.protection), late = Math.max(0, Math.ceil((new Date(b.returnedAt)-new Date(b.returnAt)-3600e3)/86400e3));
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px"><span class="mono hint">${b.ref}</span><span class="pill warn">Returned ${dtfmt(b.returnedAt)}</span></div>
        <h3 style="margin:6px 0 2px">${esc(b.carName)} <span class="plate">${b.plate}</span></h3>
        <p class="hint">${esc(b.userName)} · ${CARPARKS.find(c=>c.id===b.carpark).name}${b.lot?` · Lot ${esc(b.lot)}`:''}</p>
        <p class="hint" style="margin-bottom:12px">${prot.name} (excess ${money0(prot.excess)}) · ${b.extras.includes('prepaid')?'Pre-paid charging':'No pre-paid charging'}${late?` · <b style="color:var(--bad)">${late} day(s) late</b>`:''}</p>
        <div class="field"><label>Battery in (%) · customer reported ${b.batteryIn}%</label><input class="input" type="number" id="bi-${b.id}" value="${b.batteryIn}" min="0" max="100"></div>
        <span class="lbl">Damage checklist</span>
        <div style="margin:8px 0 12px">${DAMAGE_ITEMS.map(d=>`<div class="dmg"><label><input type="checkbox" id="dm-${b.id}-${d.id}"> ${d.label}</label><span class="mono">${money0(d.fee)}</span></div>`).join('')}</div>
        <div class="row2"><div class="field"><label>Other charge (S$)</label><input class="input" type="number" id="ot-${b.id}" min="0" placeholder="0"></div><div class="field"><label>Photos</label><input class="input" type="file" accept="image/*" multiple></div></div>
        <div class="field"><label>Inspector notes</label><textarea class="input" id="nt-${b.id}" rows="2" placeholder="Location and size of any damage…"></textarea></div>
        <button class="btn btn-ink btn-block" onclick="inspect(${b.id})">Complete inspection & issue bill</button></div>`;}).join('')}</div>` : none('No cars waiting for inspection.');
  }
  if (staffTab==='disputes'){
    body.innerHTML = disp.length ? `<div class="insp">${disp.map(b=>`<div class="card">
      <span class="mono hint">${b.ref}</span><h3 style="margin:4px 0">${esc(b.carName)}</h3><p class="hint" style="margin-bottom:12px">${esc(b.userName)} · appealed ${dtfmt(b.dispute.at)}</p>
      <div class="alert info" style="margin-top:0"><b>Charges (incl. GST): ${money(chargesTotal(b))}</b><br>${b.charges.map(c=>esc(c.label)+' '+money(c.amount)).join('<br>')}${b.inspectionNotes?`<br><i>Notes: ${esc(b.inspectionNotes)}</i>`:''}</div>
      <div class="alert warn"><b>Customer says:</b> “${esc(b.dispute.reason)}”</div>
      <div class="field" style="margin-top:14px"><label>Reply to customer</label><textarea class="input" id="rp-${b.id}" rows="2" placeholder="Explain your decision…"></textarea></div>
      <div style="display:flex;gap:10px"><button class="btn btn-ink" style="flex:1" onclick="resolveDispute(${b.id},'accepted')">Accept · waive</button><button class="btn btn-line" style="flex:1" onclick="resolveDispute(${b.id},'rejected')">Decline</button></div></div>`).join('')}</div>` : none('No open disputes.');
  }
  if (staffTab==='fleet'){
    body.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Vehicle</th><th>Plate</th><th>Status</th><th>Battery</th><th>Notes</th><th>Set status</th></tr></thead><tbody>
      ${fleet.map(c=>{ const cls = c.battery<20?'low':c.battery<60?'mid':''; const lab = {available:['Available','ok'],rented:['On rent','info'],returned:['Awaiting inspection','warn'],charging:['Charging','warn'],maintenance:['Maintenance','violet']}[c.status]||[c.status,'neutral'];
      return `<tr><td><b>${esc(carName(c))}</b></td><td><span class="plate">${c.plate}</span></td><td><span class="pill ${lab[1]}">${lab[0]}</span></td>
        <td><div class="batt">${c.battery}%<i><s class="${cls}" style="width:${c.battery}%"></s></i></div></td>
        <td><input class="input" style="padding:7px 10px;font-size:.85rem" value="${esc(c.notes)}" onchange="setCar(${c.id},'notes',this.value)"></td>
        <td><select class="input" style="padding:7px 10px;font-size:.85rem" onchange="setCar(${c.id},'status',this.value)">
          ${['available','charging','maintenance','rented','returned'].map(s=>`<option value="${s}" ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></td></tr>`;}).join('')}
    </tbody></table></div>`;
  }
  if (staffTab==='all'){
    const rows = [...all].sort((a,b)=>b.id-a.id);
    body.innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Ref</th><th>Customer</th><th>Car</th><th>Dates</th><th>Status</th><th>Paid</th></tr></thead><tbody>
      ${rows.map(b=>`<tr><td class="mono">${b.ref}</td><td>${esc(b.userName)}</td><td>${esc(b.carName)}</td><td>${dfmt(b.pickupAt)} – ${dfmt(b.returnAt)}</td><td><span class="pill ${STATUS_INFO[b.status].cls}">${STATUS_INFO[b.status].label}</span></td><td>${money(b.payments.reduce((s,p)=>s+p.amount,0))}</td></tr>`).join('')}
    </tbody></table></div>` : none('No bookings yet.');
  }
}
function setCar(id, key, val){
  const fleet = getFleet(), c = fleet.find(x=>x.id===id);
  c[key] = val; if (key==='status' && val==='available' && c.battery<100) c.battery = 100;
  setFleet(fleet); toast(`${carName(c)} updated`); renderStaff();
}
function handOver(id){
  if (!$('lv-'+id).checked || !$('dp-'+id).checked) return toast('Check the licence and hold the deposit first');
  const bo = parseInt($('bo-'+id).value); if (isNaN(bo)) return toast('Enter the battery level');
  const all = getBookings(), b = all.find(x=>x.id===id);
  Object.assign(b, { status:'active', pickedUpAt:new Date().toISOString(), batteryOut:bo, pickedUpBy:user.name });
  setBookings(all);
  const fleet = getFleet(), c = fleet.find(x=>x.id===b.carId); c.status='rented'; c.battery=bo; setFleet(fleet);
  toast(`Keys handed to ${b.userName}`); renderStaff();
}
function inspect(id){
  const all = getBookings(), b = all.find(x=>x.id===id);
  const car = getFleet().find(c=>c.id===b.carId);
  const bi = parseInt($('bi-'+id).value); if (isNaN(bi) || bi<0 || bi>100) return toast('Enter a valid battery level');
  const prot = PROTECTION.find(p=>p.id===b.protection);
  const charges = [];
  // Damage, capped by the customer's protection excess
  const items = DAMAGE_ITEMS.filter(d=>$(`dm-${id}-${d.id}`).checked);
  const other = Math.max(0, parseFloat($('ot-'+id).value)||0);
  items.forEach(d => charges.push({ label:d.label, amount:d.fee }));
  if (other) charges.push({ label:'Other damage / repair', amount:other });
  const dmgSum = items.reduce((s,d)=>s+d.fee,0) + other;
  if (dmgSum > prot.excess) charges.push({ label:`${prot.name}: amount above ${money0(prot.excess)} excess`, amount:-(dmgSum-prot.excess) });
  // Low battery
  if (bi < 20 && !b.extras.includes('prepaid')) charges.push({ label:`Recharging fee (returned at ${bi}%)`, amount:LOW_BATT_FEE });
  // Late return (after 1-hour grace)
  const late = Math.max(0, Math.ceil((new Date(b.returnedAt)-new Date(b.returnAt)-3600e3)/86400e3));
  if (late) charges.push({ label:`Late return · ${late} day(s) @ ${money0(car.price)}`, amount:late*car.price });

  Object.assign(b, { batteryIn:bi, charges, inspectionNotes:$('nt-'+id).value.trim(), inspectedAt:new Date().toISOString(), inspectedBy:user.name });
  const total = charges.reduce((s,c)=>s+c.amount,0);
  b.status = total > 0 ? 'inspected' : 'closed';
  if (b.status==='closed') b.closedAt = b.inspectedAt;
  setBookings(all);
  const fleet = getFleet(), c = fleet.find(x=>x.id===b.carId);
  c.battery = bi; c.status = dmgSum>0 ? 'maintenance' : 'charging'; c.notes = dmgSum>0 ? (b.inspectionNotes || 'Damage reported at inspection') : '';
  setFleet(fleet);
  toast(total>0 ? `Bill issued · ${money(total*(1+GST))} due` : 'No charges · rental closed, deposit released');
  renderStaff();
}
function resolveDispute(id, status){
  const all = getBookings(), b = all.find(x=>x.id===id);
  b.dispute.status = status; b.dispute.reply = $('rp-'+id).value.trim(); b.dispute.resolvedAt = new Date().toISOString();
  if (status==='accepted'){ b.status='closed'; b.closedAt = b.dispute.resolvedAt; }
  setBookings(all); toast(status==='accepted' ? 'Appeal accepted · charges waived' : 'Appeal declined · customer notified'); renderStaff();
}

/* =========================================================
   14. MAP (Leaflet + CARTO light tiles)
   ========================================================= */
let map, layer;
const PIN_COLORS = { branch:'#0F2019', carpark:'#14523C', charger:'#9FCB12' };
function initMap(){
  if (typeof L === 'undefined'){ $('map').innerHTML = '<p style="padding:20px">Map could not load. Check your connection.</p>'; return; }
  map = L.map('map',{scrollWheelZoom:false}).setView([1.3215,103.9],11);
  // OpenStreetMap tiles: free, no API key needed.
  // If they fail to load, switch to Esri street tiles (also no key).
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap contributors', maxZoom:19, className:'map-tiles' }).addTo(map);
  let errors = 0;
  osm.on('tileerror', () => {
    if (++errors !== 3) return;
    map.removeLayer(osm);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{ attribution:'Tiles &copy; Esri', maxZoom:19, className:'map-tiles' }).addTo(map);
  });
  layer = L.layerGroup().addTo(map);
  renderMap('branch');
}
function renderMap(kind, btn){
  if (btn) document.querySelectorAll('#mapSeg button').forEach(b=>b.classList.toggle('on', b===btn));
  if (!map) return;
  const items = kind==='branch' ? Object.values(BRANCHES).map(b=>({...b, tag:'Pick-up & returns · 8am–9pm'}))
              : kind==='carpark' ? CARPARKS.map(c=>({...c, tag:'Return 24/7'}))
              : CHARGERS.map(c=>({...c, tag:'Public DC charger'}));
  layer.clearLayers(); $('locList').innerHTML = '';
  const icon = L.divIcon({ className:'', html:`<div class="pin" style="background:${PIN_COLORS[kind]}"></div>`, iconSize:[28,28], iconAnchor:[14,28], popupAnchor:[0,-26] });
  items.forEach(loc => {
    const m = L.marker([loc.lat,loc.lng],{icon}).addTo(layer).bindPopup(`<b>${esc(loc.name)}</b><br>${esc(loc.address)}`);
    const el = document.createElement('div'); el.className='loc'; el.tabIndex=0;
    el.innerHTML = `<h4>${esc(loc.name)}</h4><p>${esc(loc.address)}</p><span class="pill ${kind==='charger'?'warn':'ok'}">${loc.tag}</span>`;
    el.onclick = () => { map.flyTo([loc.lat,loc.lng],15); m.openPopup(); document.querySelectorAll('.loc').forEach(x=>x.classList.remove('on')); el.classList.add('on'); };
    $('locList').appendChild(el);
  });
  map.fitBounds(items.map(i=>[i.lat,i.lng]),{padding:[50,50],maxZoom:14});
}

/* =========================================================
   15. MODALS & INIT
   ========================================================= */
function openM(id){ $(id).classList.add('on'); document.body.style.overflow='hidden'; }
function closeM(id){ $(id).classList.remove('on'); if (!document.querySelector('.overlay.on')) document.body.style.overflow=''; }
function bgClose(e){ if (e.target.classList.contains('overlay')) closeM(e.target.id); }
document.addEventListener('keydown', e => { if (e.key==='Escape') document.querySelectorAll('.overlay.on').forEach(o=>closeM(o.id)); });

document.addEventListener('DOMContentLoaded', () => {
    initSearch(); renderChips();
  updateAuthUI();
  initMap();
});
