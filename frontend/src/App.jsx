import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { api, clearSession, getStoredToken, saveSession } from './api.js';

const money = cents => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((cents || 0) / 100);
const dateLabel = value => value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Not provided';
const shortDate = value => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const orderRef = id => id.slice(0, 8).toUpperCase();
const CATEGORIES = ['Bakery', 'Produce', 'Packaged', 'Meals', 'Dairy', 'Other'];

// Flat tints per category for listings without a photo: [background, lettering].
const CATEGORY_TINT = {
  Bakery: ['#F1DDB0', '#D9BC7C'],
  Produce: ['#D3E5BE', '#A9CB86'],
  Packaged: ['#DCDFE6', '#B8BEC9'],
  Meals: ['#F4CDBC', '#E6A78C'],
  Dairy: ['#D2E2F0', '#A7C3DC'],
  Other: ['#E4E7E0', '#C4C9BD']
};

function timeLeft(expiry) {
  const ms = new Date(expiry) - Date.now();
  if (ms <= 0) return { text: 'Expired', level: 'danger', expired: true };
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  if (h < 1) return { text: `${m}m left`, level: 'danger' };
  if (h < 6) return { text: `${h}h ${m}m left`, level: 'danger' };
  if (h < 24) return { text: `${h}h left`, level: 'amber' };
  return { text: `${Math.floor(h / 24)}d left`, level: 'green' };
}

const STATUS_TONE = {
  DELIVERED: 'good', PICKED_UP: 'info', ASSIGNED: 'info', ACCEPTED: 'info', CONFIRMED: 'info',
  PENDING_ASSIGNMENT: 'warn', DEMO_PENDING: 'warn', CANCELLED: 'bad', EXPIRED: 'bad', INACTIVE: 'bad', SOLD_OUT: 'warn', AVAILABLE: 'good'
};
function Status({ value }) {
  const text = String(value || 'Pending').replace(/_/g, ' ').toLowerCase();
  return <span className={`status status-${STATUS_TONE[value] || 'info'}`}>{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}

function Brand() {
  return <a className="brand" href="#" aria-label="ReShare home"><span className="brand-tag" aria-hidden="true"/>ReShare</a>;
}

function Bar({ user, tabs, tab, onTab, onLogout, adminLabel }) {
  return <header className="bar">
    <Brand/>
    {tabs && <nav className="bar-nav" aria-label="Main">{tabs.map(([id, label]) =>
      <button key={id} className={tab === id ? 'is-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)}>{label}</button>)}</nav>}
    <div className="bar-user">
      {adminLabel && <span className="admin-flag">{adminLabel}</span>}
      <span className="bar-name">{user.name}</span>
      <button className="link-button" onClick={onLogout}>Sign out</button>
    </div>
  </header>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // login, signup, admin
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('buyer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [welcome, setWelcome] = useState(null);
  const useBy = useMemo(() => shortDate(Date.now() + 36e5 * 30), []);

  function changeMode(next) { setMode(next); setError(''); setPassword(''); }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = mode === 'signup'
        ? await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) })
        : await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, portal: mode === 'admin' ? 'admin' : 'user' }) });
      if (mode === 'admin' && result.user.role !== 'admin') throw new Error('Administrator access is required.');
      saveSession(result.token, result.user);
      // Hold the home page back for the welcome animation (skipped when the user prefers reduced motion).
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setWelcome({ user: result.user, signup: mode === 'signup' });
      setTimeout(() => onAuthenticated(result.user), still ? 0 : 1900);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return <div className="auth">
    {welcome && <div className="welcome" role="status" aria-live="polite">
      <div className="welcome-inner">
        <h2><span>{welcome.signup ? 'Welcome to ReShare,' : 'Welcome back,'}</span><span>{welcome.user.name.split(' ')[0]}.</span></h2>
        <div className="stamp stamp-green welcome-stamp" aria-hidden="true"><small>Signed in</small><b>{shortDate(Date.now())}</b></div>
      </div>
    </div>}
    <section className="auth-poster">
      <Brand/>
      <div className="auth-poster-copy">
        <h1>Good food, running out of time.</h1>
        <p>Local shops mark down food that's close to its date. Reserve it here, get it delivered, and pay far less for something that's still perfectly good.</p>
      </div>
      <div className="stamp stamp-danger auth-stamp" aria-hidden="true"><small>Use by</small><b>{useBy}</b></div>
    </section>
    <section className="auth-panel">
      <div className="auth-form-wrap">
        <h2>{mode === 'signup' ? 'Create your account' : mode === 'admin' ? 'Administrator sign in' : 'Sign in'}</h2>
        <p className="muted">{mode === 'signup' ? 'Buy surplus food or sell yours.' : mode === 'admin' ? 'For pre-authorised administrators only.' : 'Welcome back. Pick up where you left off.'}</p>
        {mode !== 'admin' && <div className="auth-switch" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => changeMode('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'is-active' : ''} onClick={() => changeMode('signup')}>Create account</button>
        </div>}
        <form className="stack" onSubmit={submit}>
          {mode === 'signup' && <label>Full name<input autoComplete="name" required minLength="2" maxLength="100" value={name} onChange={e => setName(e.target.value)}/></label>}
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={mode === 'admin' ? 'admin@reshare.demo' : 'you@example.com'}/></label>
          <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 10 : 1} value={password} onChange={e => setPassword(e.target.value)}/>{mode === 'signup' && <small>At least 10 characters. Avoid common passwords.</small>}</label>
          {mode === 'signup' && <label>I want to<select value={role} onChange={e => setRole(e.target.value)}><option value="buyer">Buy surplus food</option><option value="seller">Sell surplus food</option></select></label>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>
        {mode === 'admin'
          ? <button className="link-button" onClick={() => changeMode('login')}>Back to sign in</button>
          : <button className="link-button" onClick={() => changeMode('admin')}>Administrator sign in</button>}      </div>
    </section>
  </div>;
}

function ListingCard({ listing, onBuy, role }) {
  const [imgFailed, setImgFailed] = useState(false);
  const left = timeLeft(listing.expiry_at);
  const [tint, ink] = CATEGORY_TINT[listing.category] || CATEGORY_TINT.Other;
  const discount = listing.original_price_cents > listing.price_cents ? Math.round((1 - listing.price_cents / listing.original_price_cents) * 100) : 0;
  const lowStock = listing.quantity_available > 0 && listing.quantity_available <= 3;
  return <article className="tag-card">
    <div className="tag-photo">
      {listing.image_url && !imgFailed
        ? <img src={listing.image_url} alt={listing.title} loading="lazy" onError={() => setImgFailed(true)}/>
        : <div className="photo-fallback" style={{ background: tint, color: ink }} aria-hidden="true">{listing.category || 'Food'}</div>}
      {discount > 0 && <span className="markdown">-{discount}%</span>}
      <div className={`stamp stamp-${left.level}`}><small>Use by</small><b>{shortDate(listing.expiry_at)}</b><span>{left.text}</span></div>
    </div>
    <div className="tag-body">
      <p className="tag-where">{listing.seller_name || 'Community seller'}, {listing.pickup_area}</p>
      <h3>{listing.title}</h3>
      <p className="tag-desc">{listing.description || 'Surplus food looking for a new home.'}</p>
    </div>
    <div className="tag-buy">
      <div>
        <div className="price"><strong>{money(listing.price_cents)}</strong>{discount > 0 && <del>{money(listing.original_price_cents)}</del>}</div>
        <p className={`stock${lowStock ? ' stock-low' : ''}`}>{lowStock ? `Only ${listing.quantity_available} left` : `${listing.quantity_available} ${listing.quantity_unit || 'item'} available`}</p>
      </div>
      <button className="btn btn-primary" disabled={role !== 'buyer' || left.expired || listing.quantity_available < 1} onClick={() => onBuy(listing)}>{role !== 'buyer' ? 'Buyers only' : 'Reserve'}</button>
    </div>
  </article>;
}

function BarChart({ title, data, value, label, format = String }) {
  const max = Math.max(1, ...data.map(d => Number(d[value])));
  return <div className="chart"><h3>{title}</h3>
    {data.every(d => !Number(d[value])) ? <p className="muted">Nothing to show yet.</p> : <div className="bars">{data.map(d => <div className="bar-col" key={d[label]} title={`${d[label]}: ${format(Number(d[value]))}`}><span className="bar-value">{Number(d[value]) ? format(Number(d[value])) : ''}</span><div className="chart-bar" style={{ height: `${Math.max(2, Number(d[value]) / max * 100)}%` }}/><small>{d[label].slice(5)}</small></div>)}</div>}
  </div>;
}

function RankList({ title, rows, name, value, format }) {
  const max = Math.max(1, ...rows.map(r => Number(r[value])));
  return <div className="chart"><h3>{title}</h3>
    {!rows.length ? <p className="muted">Nothing to show yet.</p> : rows.map(r => <div className="rank-row" key={r[name]}><span>{r[name]}</span><div className="rank-track"><div className="rank-fill" style={{ width: `${Number(r[value]) / max * 100}%` }}/></div><strong>{format(Number(r[value]))}</strong></div>)}
  </div>;
}

function BarcodeScanner({ onCode, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let controls; let stopped = false;
    new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, video.current, (result, _err, c) => {
      controls = c;
      if (result && !stopped) { stopped = true; c.stop(); onCode(result.getText()); }
    }).then(c => { controls = c; if (stopped) c.stop(); })
      .catch(() => setError('Camera not available. Allow camera access (it needs HTTPS or localhost), or type the number under the barcode.'));
    return () => { stopped = true; controls?.stop(); };
  }, []);
  return <div className="scanner span-two"><video ref={video} muted playsInline/><div className="scan-line"/>{error && <p className="error">{error}</p>}<button type="button" className="btn btn-light" onClick={onClose}>Close camera</button></div>;
}

// Rekognition reads only JPEG/PNG and phone photos are large, so send a resized JPEG copy for recognition.
async function toJpeg(file, max = 1280) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not read this image.')), 'image/jpeg', 0.85));
}

const EMPTY_FORM = { title: '', description: '', category: 'Bakery', price: '30', originalPrice: '50', quantity: '1', unit: 'item', expiry: '', pickupAddress: '', area: '', imageUrl: '' };

function CreateListing({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [allergens, setAllergens] = useState([]);
  const [photoMsg, setPhotoMsg] = useState('');
  const [barcode, setBarcode] = useState(''); const [scanning, setScanning] = useState(false); const [scanMsg, setScanMsg] = useState('');
  async function lookup(code) {
    code = code.trim(); setBarcode(code); setScanning(false); setScanMsg('');
    if (!code) return;
    try {
      const r = await api(`/api/products/barcode/${encodeURIComponent(code)}`);
      if (!r.found) { setScanMsg('This product is not in the database. Fill in the details by hand.'); return; }
      setForm(old => ({ ...old, title: r.name, category: r.category, description: r.description || old.description, imageUrl: r.image_url || old.imageUrl }));
      setAllergens(r.allergens); setFile(null);
      setScanMsg(`Filled in from the barcode${r.quantity_text ? ` (pack size ${r.quantity_text})` : ''}. Add the price, quantity and expiry date, which barcodes don't hold.`);
    } catch (e) { setScanMsg(e.message); }
  }
  async function identify(f) {
    setPhotoMsg('Reading your photo...');
    try {
      const r = await api('/api/products/identify', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await toJpeg(f) });
      if (!r.found) { setPhotoMsg("Couldn't tell what food this is. Fill in the details by hand."); return; }
      const keep = !!form.title; // never overwrite a name the seller (or a barcode scan) already filled in
      if (!keep) setForm(old => ({ ...old, title: r.name, category: r.category, description: old.description || r.description }));
      setPhotoMsg(`Looks like ${r.name.toLowerCase()} (${r.confidence}% sure).${keep ? ' Your food name was kept.' : ' Check the name and category.'}`);
    } catch (e) { setPhotoMsg(e.message); }
  }
  const preview = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  const update = (key, value) => setForm(old => ({ ...old, [key]: value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      let imageKey = null, imageUrl = form.imageUrl || null;
      if (file) {
        const p = await api('/api/uploads/presign', { method: 'POST', body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }) });
        const put = await fetch(p.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!put.ok) throw new Error('Image upload failed. Please try again.');
        imageKey = p.key; imageUrl = p.imageUrl || imageUrl;
      }
      const payload = { title: form.title, description: form.description, category: form.category, price_cents: Math.round(Number(form.price) * 100), original_price_cents: form.originalPrice ? Math.round(Number(form.originalPrice) * 100) : null, quantity_available: Number(form.quantity), quantity_unit: form.unit, expiry_at: new Date(form.expiry).toISOString(), pickup_address: form.pickupAddress, pickup_area: form.area, image_key: imageKey, image_url: imageUrl, allergens };
      await api('/api/listings', { method: 'POST', body: JSON.stringify(payload) });
      setForm(EMPTY_FORM); setFile(null); setAllergens([]); setBarcode(''); setScanMsg(''); setPhotoMsg(''); onCreated();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <form className="page form-page" onSubmit={submit}>
    <div className="page-head"><h2>List food</h2><p className="muted">Scan the barcode or add a photo to fill in the product, then add the price and expiry date.</p></div>
    <div className="scan-strip">
      <label>Barcode
        <span className="inline-row">
          <input inputMode="numeric" value={barcode} onChange={e => setBarcode(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup(barcode); } }} placeholder="Scan, or type the number under the barcode"/>
          <button type="button" className="btn btn-light" onClick={() => lookup(barcode)}>Look up</button>
          <button type="button" className="btn btn-primary" onClick={() => setScanning(s => !s)}>{scanning ? 'Stop camera' : 'Scan with camera'}</button>
        </span>
      </label>
      {scanMsg && <p className="muted scan-msg">{scanMsg}</p>}
    </div>
    <div className="form-grid">
      {scanning && <BarcodeScanner onCode={lookup} onClose={() => setScanning(false)}/>}
      <label>Food name<input required minLength="2" maxLength="120" value={form.title} onChange={e => update('title', e.target.value)} placeholder="Fresh bread pack"/></label>
      <label>Category<select value={form.category} onChange={e => update('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Sale price (₹)<input required type="number" min="0" step="0.01" value={form.price} onChange={e => update('price', e.target.value)}/></label>
      <label>Original price (₹)<input type="number" min="0" step="0.01" value={form.originalPrice} onChange={e => update('originalPrice', e.target.value)}/></label>
      <label>Quantity<input required type="number" min="0" max="100000" value={form.quantity} onChange={e => update('quantity', e.target.value)}/></label>
      <label>Unit<select value={form.unit} onChange={e => update('unit', e.target.value)}><option>item</option><option>packet</option><option>kg</option><option>gram</option><option>portion</option><option>box</option><option>litre</option></select></label>
      <label>Use by<input required type="datetime-local" value={form.expiry} onChange={e => update('expiry', e.target.value)}/></label>
      <label>Pickup area<input required value={form.area} onChange={e => update('area', e.target.value)} placeholder="Viman Nagar"/></label>
      <label className="span-two">Pickup address<input required minLength="5" value={form.pickupAddress} onChange={e => update('pickupAddress', e.target.value)} placeholder="Shop name, street"/></label>
      <label className="span-two">Description<textarea rows="3" value={form.description} onChange={e => update('description', e.target.value)} placeholder="What's in it, how to store it, allergens"/></label>
      <label className="span-two">Photo (JPEG, PNG or WebP, up to 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files[0]; if (!f) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image up to 5 MB.'); e.target.value = ''; return; } setError(''); setFile(f); identify(f); }}/>{photoMsg && <small className="photo-msg">{photoMsg}</small>}</label>
      <label className="span-two">Or paste an image link<input type="url" value={form.imageUrl} onChange={e => update('imageUrl', e.target.value)} placeholder="https://..."/>{allergens.length > 0 && <small>Allergens from the barcode: {allergens.join(', ')}</small>}<small>Uploaded photos go to Amazon S3. When uploads aren't configured (local development), paste a link instead.</small></label>
      {(preview || form.imageUrl) && <div className="span-two upload-preview"><img src={preview || form.imageUrl} alt="Listing preview"/></div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="btn btn-primary btn-wide" disabled={busy}>{busy ? 'Publishing...' : 'Publish listing'}</button>
  </form>;
}

function Table({ head, children, empty }) {
  return children.length === 0
    ? <p className="empty">{empty}</p>
    : <div className="table-wrap"><table><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Orders({ refreshKey }) {
  const [orders, setOrders] = useState([]); const [error, setError] = useState('');
  useEffect(() => { api('/api/orders/mine').then(d => setOrders(d.orders)).catch(e => setError(e.message)); }, [refreshKey]);
  return <section className="page">
    <div className="page-head"><h2>My orders</h2><p className="muted">Everything you've reserved, newest first.</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    <Table head={['Order', 'Items', 'Total', 'Status', 'Delivery', 'Placed']} empty="No orders yet. Reserve something from Browse and it will show up here.">
      {orders.map(o => <tr key={o.id}><td className="mono">{orderRef(o.id)}</td><td>{(o.items || []).map(i => `${i.title} ×${i.quantity}`).join(', ')}</td><td className="num">{money(o.total_cents)}</td><td><Status value={o.order_status}/></td><td><Status value={o.delivery_status}/></td><td>{dateLabel(o.created_at)}</td></tr>)}
    </Table>
  </section>;
}

function SellerDashboard({ refreshKey, onChanged }) {
  const [listings, setListings] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  async function load() { try { const data = await api('/api/listings/mine'); setListings(data.listings); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, [refreshKey]);
  async function deactivate(id) { setBusy(id); setError(''); try { await api(`/api/listings/${id}`, { method: 'DELETE' }); await load(); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  return <section className="page">
    <div className="page-head"><h2>My listings</h2><p className="muted">{listings.length} listed. Only your own listings appear here.</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    <Table head={['Product', 'Price', 'Available', 'Sold', 'Use by', 'Status', '']} empty="You haven't listed anything yet. Choose List food to add your first item.">
      {listings.map(l => <tr key={l.id}><td><strong>{l.title}</strong><br/><small>{l.pickup_area}</small></td><td className="num">{money(l.price_cents)}</td><td>{l.quantity_available} {l.quantity_unit}</td><td>{l.units_sold}</td><td>{dateLabel(l.expiry_at)}</td><td><Status value={l.expiry_at && new Date(l.expiry_at) < new Date() ? 'EXPIRED' : l.status}/></td><td>{l.status !== 'INACTIVE' && <button className="link-button" disabled={busy === l.id} onClick={() => deactivate(l.id)}>{busy === l.id ? 'Removing...' : 'Deactivate'}</button>}</td></tr>)}
    </Table>
  </section>;
}

function SellerSales({ refreshKey }) {
  const [orders, setOrders] = useState([]); const [stats, setStats] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api('/api/orders/sales').then(d => setOrders(d.orders)).catch(e => setError(e.message)); api('/api/orders/sales/stats').then(setStats).catch(() => {}); }, [refreshKey]);
  return <section className="page">
    <div className="page-head"><h2>Sales</h2><p className="muted">The last 14 days, and every order that includes your products.</p></div>
    {stats && <div className="chart-grid"><BarChart title="Revenue per day" data={stats.daily} value="revenue_cents" label="day" format={money}/><RankList title="Top products" rows={stats.top_listings} name="title" value="revenue_cents" format={money}/></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <Table head={['Order', 'Buyer', 'Items', 'Your total', 'Status', 'Placed']} empty="No sales yet. Orders show up here as soon as a buyer reserves your food.">
      {orders.map(o => <tr key={o.id}><td className="mono">{orderRef(o.id)}</td><td>{o.buyer_name}</td><td>{(o.items || []).map(i => `${i.title} ×${i.quantity}`).join(', ')}</td><td className="num">{money(o.seller_total_cents)}</td><td><Status value={o.order_status}/></td><td>{dateLabel(o.created_at)}</td></tr>)}
    </Table>
  </section>;
}

function DeliveryBoard({ refreshKey }) {
  const [deliveries, setDeliveries] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  async function load() { try { setDeliveries((await api('/api/deliveries/mine')).deliveries); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, [refreshKey]);
  async function update(id, status) { setBusy(id); try { await api(`/api/deliveries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  return <section className="page">
    <div className="page-head page-head-row"><div><h2>Deliveries</h2><p className="muted">Orders assigned to you.</p></div><button className="btn btn-light" onClick={load}>Refresh</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {!deliveries.length && !error ? <p className="empty">Nothing assigned to you yet. New orders appear here when they're matched to you.</p>
      : deliveries.map(d => <div className="job" key={d.id}>
        <div>
          <h3>Order {orderRef(d.order_id)} <Status value={d.delivery_status}/></h3>
          <dl><dt>Pick up</dt><dd>{d.pickup_address}</dd><dt>Deliver to</dt><dd>{d.delivery_address}</dd></dl>
        </div>
        <div className="job-actions">
          {d.delivery_status === 'ASSIGNED' && <button className="btn btn-light" disabled={busy === d.id} onClick={() => update(d.id, 'ACCEPTED')}>Accept</button>}
          {d.delivery_status === 'ACCEPTED' && <button className="btn btn-light" disabled={busy === d.id} onClick={() => update(d.id, 'PICKED_UP')}>Mark picked up</button>}
          {d.delivery_status === 'PICKED_UP' && <button className="btn btn-primary" disabled={busy === d.id} onClick={() => update(d.id, 'DELIVERED')}>Mark delivered</button>}
        </div>
      </div>)}
  </section>;
}

function AdminPanel() {
  const [data, setData] = useState(null); const [pending, setPending] = useState([]); const [partners, setPartners] = useState([]); const [stats, setStats] = useState(null);
  const [choice, setChoice] = useState({}); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  async function load() { try { const [summary, p, pt, st] = await Promise.all([api('/api/admin/summary'), api('/api/admin/pending-deliveries'), api('/api/admin/delivery-partners'), api('/api/admin/stats')]); setData(summary); setPending(p.deliveries); setPartners(pt.partners); setStats(st); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function assign(id) { setBusy(id); try { await api(`/api/admin/deliveries/${id}/assign`, { method: 'POST', body: JSON.stringify({ partner_id: choice[id] }) }); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  return <section className="page">
    <div className="page-head page-head-row"><div><h2>Marketplace overview</h2><p className="muted">Listings, orders and deliveries that need a decision.</p></div><button className="btn btn-light" onClick={load}>Refresh</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {data && <>
      <dl className="figures">
        <div><dt>Listings</dt><dd>{data.listings.total}</dd></div>
        <div><dt>Available now</dt><dd>{data.listings.available}</dd></div>
        <div><dt>Orders</dt><dd>{data.orders.total}</dd></div>
        <div className={data.delivery.pending ? 'figure-alert' : ''}><dt>Awaiting a partner</dt><dd>{data.delivery.pending}</dd></div>
      </dl>
      {stats && <div className="chart-grid"><BarChart title="Orders per day, last 14 days" data={stats.daily} value="orders" label="day"/><RankList title="Top sellers by revenue" rows={stats.top_sellers} name="name" value="revenue_cents" format={money}/></div>}
      <div className="admin-cols">
        <div>
          <h3 className="block-title">Deliveries awaiting a partner</h3>
          {!pending.length ? <p className="empty">All deliveries are assigned.</p> : pending.map(d => <div className="job" key={d.id}>
            <div><h3>Order {orderRef(d.order_id)}</h3><p className="muted">{d.pickup_address}, {d.pickup_area}</p></div>
            <div className="assign-box">
              <select aria-label="Delivery partner" value={choice[d.id] || ''} onChange={e => setChoice(c => ({ ...c, [d.id]: e.target.value }))}><option value="">Choose a partner</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}, {p.service_area || 'any area'}, {p.active_deliveries} active</option>)}</select>
              <button className="btn btn-primary" disabled={!choice[d.id] || busy === d.id} onClick={() => assign(d.id)}>{busy === d.id ? 'Assigning...' : 'Assign'}</button>
            </div>
          </div>)}
        </div>
        <div>
          <h3 className="block-title">Accounts</h3>
          <Table head={['Role', 'Accounts']} empty="No accounts.">{data.users.map(u => <tr key={u.role}><td>{u.role}</td><td className="num">{u.count}</td></tr>)}</Table>
        </div>
      </div>
    </>}
  </section>;
}

export default function App() {
  const [user, setUser] = useState(null); const [authChecking, setAuthChecking] = useState(true);
  const [listings, setListings] = useState([]); const [search, setSearch] = useState(''); const [area, setArea] = useState(''); const [category, setCategory] = useState('');
  const [tab, setTab] = useState('browse'); const [notice, setNotice] = useState(''); const [refreshKey, setRefreshKey] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const home = u => u.role === 'admin' ? 'admin' : u.role === 'seller' ? 'myListings' : u.role === 'delivery' ? 'delivery' : 'browse';

  useEffect(() => {
    let alive = true;
    async function restore() {
      if (!getStoredToken()) { if (alive) setAuthChecking(false); return; }
      try { const result = await api('/api/auth/me'); if (alive) { setUser(result.user); setTab(home(result.user)); } }
      catch { clearSession(); }
      finally { if (alive) setAuthChecking(false); }
    }
    restore(); return () => { alive = false; };
  }, []);

  async function loadListings() {
    setLoading(true);
    try { const params = new URLSearchParams(); if (search) params.set('search', search); if (area) params.set('area', area); if (category) params.set('category', category); const data = await api(`/api/listings?${params.toString()}`); setListings(data.listings); setError(''); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (!user || user.role === 'admin') return; loadListings(); }, [user, search, area, category, refreshKey]);

  function authenticated(nextUser) { setUser(nextUser); setTab(home(nextUser)); setNotice(''); }
  function logout() { clearSession(); setUser(null); setListings([]); setNotice(''); setTab('browse'); setSearch(''); setArea(''); setCategory(''); }

  async function buy(listing) {
    const address = window.prompt('Where should we deliver this demo order?'); if (!address) return;
    try { const result = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ listing_id: listing.id, quantity: 1 }], delivery_address: address, idempotency_key: crypto.randomUUID() }) }); setNotice(`Reserved. Order ${orderRef(result.order.id)} is confirmed (demo order, nothing was charged).`); setRefreshKey(k => k + 1); setTab('orders'); }
    catch (e) { setNotice(e.message); }
  }

  if (authChecking) return <div className="auth-loading"><Brand/><p className="muted">Checking your session...</p></div>;
  if (!user) return <AuthScreen onAuthenticated={authenticated}/>;
  if (user.role === 'admin') return <div className="shell"><Bar user={user} adminLabel="Admin" onLogout={logout}/><main><AdminPanel/></main><footer className="foot">ReShare administrator console</footer></div>;

  const isSeller = user.role === 'seller';
  const tabs = [['browse', 'Browse'],
    ...(isSeller ? [['sell', 'List food'], ['myListings', 'My listings'], ['sales', 'Sales']] : []),
    ...(user.role === 'buyer' ? [['orders', 'My orders']] : []),
    ...(user.role === 'delivery' ? [['delivery', 'Deliveries']] : [])];
  const endingSoon = listings.filter(l => new Date(l.expiry_at) - Date.now() < 864e5).length;

  return <div className="shell">
    <Bar user={user} tabs={tabs} tab={tab} onTab={setTab} onLogout={logout}/>
    <main>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">Dismiss</button></div>}
      {tab === 'browse' && <section className="page browse">
        <div className="masthead">
          <h1>Good food, running out of time.</h1>
          <p className="masthead-note">{loading ? 'Loading deals...' : endingSoon ? `${endingSoon} ${endingSoon === 1 ? 'deal ends' : 'deals end'} within 24 hours.` : 'Soonest-expiring food is listed first.'}</p>
        </div>
        <div className="filters">
          <label className="search"><span className="sr-only">Search</span><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M13 13l5 5" stroke="currentColor" strokeWidth="2"/></svg><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bread, vegetables, meals"/></label>
          <label className="area"><span className="sr-only">Pickup area</span><input value={area} onChange={e => setArea(e.target.value)} placeholder="Pickup area"/></label>
        </div>
        <div className="chips" role="group" aria-label="Category">
          {['', ...CATEGORIES].map(c => <button key={c || 'all'} className={category === c ? 'is-active' : ''} aria-pressed={category === c} onClick={() => setCategory(c)}>{c || 'All'}</button>)}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {!loading && !listings.length && !error
          ? <div className="empty-block"><h3>Nothing matches yet</h3><p>Clear the search or pick another category. New food is listed through the day.</p></div>
          : <div className="tag-grid">{listings.map(item => <ListingCard key={item.id} listing={item} role={user.role} onBuy={buy}/>)}</div>}
        <aside className="safety"><strong>Check before you eat.</strong> Sellers list their own expiry dates, storage advice and allergens. Read them, and skip anything that looks or smells off.</aside>
      </section>}
      {tab === 'sell' && isSeller && <CreateListing onCreated={() => { setRefreshKey(k => k + 1); setTab('myListings'); setNotice('Published. Your listing is live.'); }}/>}
      {tab === 'myListings' && isSeller && <SellerDashboard refreshKey={refreshKey} onChanged={() => setRefreshKey(k => k + 1)}/>}
      {tab === 'sales' && isSeller && <SellerSales refreshKey={refreshKey}/>}
      {tab === 'orders' && user.role === 'buyer' && <Orders refreshKey={refreshKey}/>}
      {tab === 'delivery' && user.role === 'delivery' && <DeliveryBoard refreshKey={refreshKey}/>}
    </main>
    <footer className="foot">ReShare. Demo checkout, no real payments are collected.</footer>
  </div>;
}
