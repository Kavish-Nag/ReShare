import React, { useEffect, useState } from 'react';
import { api, clearSession, getStoredToken, getStoredUser, saveSession } from './api.js';

const money = cents => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((cents || 0) / 100);
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Not provided';

function Brand({ subtitle = 'Good food, shared better.' }) {
  return <a className="brand" href="#"><span className="brand-mark">R</span><span>ReShare<small>{subtitle}</small></span></a>;
}

function Header({ user, onLogout }) {
  return <header className="topbar">
    <Brand />
    <div className="header-right">
      <div className="account-chip"><span className="account-avatar">{(user?.name || 'R').charAt(0).toUpperCase()}</span><span className="account-details"><strong>{user?.name}</strong><small>{user?.role === 'seller' ? 'Seller account' : user?.role === 'delivery' ? 'Delivery partner' : 'Buyer account'}</small></span></div>
      <button className="button button-secondary logout-button" onClick={onLogout}>Sign out</button>
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

  function changeMode(next) { setMode(next); setError(''); setPassword(''); }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = mode === 'signup'
        ? await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) })
        : await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, portal: mode === 'admin' ? 'admin' : 'user' }) });
      if (mode === 'admin' && result.user.role !== 'admin') throw new Error('Administrator access is required.');
      saveSession(result.token, result.user);
      onAuthenticated(result.user);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div className="auth-page">
    <div className="auth-brandbar"><Brand subtitle="A community marketplace for surplus food"/><span className="auth-top-note">A little less waste starts here.</span></div>
    <main className="auth-layout">
      <section className="auth-story">
        <span className="hero-pill">LESS WASTE. MORE VALUE.</span>
        <h1>Good food deserves<br/><em>another chance.</em></h1>
        <p>Find affordable surplus food nearby, share items you cannot use, and help good food reach someone who needs it.</p>
        <div className="auth-benefits"><div><span>01</span><div><strong>Discover local deals</strong><small>Browse food listed by nearby sellers.</small></div></div><div><span>02</span><div><strong>Give surplus a purpose</strong><small>List extras instead of throwing them away.</small></div></div><div><span>03</span><div><strong>Your account, your history</strong><small>Orders and listings are saved to your own account.</small></div></div></div>
        <div className="auth-decoration" aria-hidden="true"><div className="auth-decoration-circle">R<span>↻</span></div></div>
      </section>
      <section className="auth-card">
        <div className="auth-card-head"><p className="eyebrow">{mode === 'admin' ? 'RESTRICTED ACCESS' : 'WELCOME TO RESHARE'}</p><h2>{mode === 'signup' ? 'Create your account' : mode === 'admin' ? 'Administrator sign in' : 'Sign in to ReShare'}</h2><p className="muted">{mode === 'signup' ? 'Join the community as a buyer or seller.' : mode === 'admin' ? 'Sign in with your pre-authorised administrator account.' : 'Continue to your personalised marketplace.'}</p></div>
        {mode !== 'admin' && <div className="auth-switch"><button type="button" className={mode==='login'?'selected':''} onClick={()=>changeMode('login')}>Sign in</button><button type="button" className={mode==='signup'?'selected':''} onClick={()=>changeMode('signup')}>Create account</button></div>}
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <label>Full name<input autoComplete="name" required minLength="2" maxLength="100" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>}
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={mode==='admin'?'admin@reshare.demo':'you@example.com'}/></label>
          <label>Password<input type="password" autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={mode==='signup'?8:1} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'At least 8 characters':'Enter your password'}/>{mode==='signup' && <small>Use at least 8 characters.</small>}</label>
          {mode === 'signup' && <label>Account type<select value={role} onChange={e=>setRole(e.target.value)}><option value="buyer">Buyer</option><option value="seller">Seller</option></select><small>You can create a buyer or seller account. Administrator accounts are created separately.</small></label>}
          {error && <p className="error auth-error">{error}</p>}
          <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>
        {mode === 'admin' ? <button className="auth-text-link" onClick={()=>changeMode('login')}>← Return to user sign in</button> : <button className="auth-text-link" onClick={()=>changeMode('admin')}>Administrator? Sign in here</button>}
        <div className="auth-footnote">Demo checkout only. No real payments are collected.</div>
      </section>
    </main>
    <footer className="auth-footer"><span>ReShare</span><span>Good food, shared better.</span><span>Cloud Computing Mini Project</span></footer>
  </div>;
}

function ListingCard({ listing, onBuy, role }) {
  const expired = new Date(listing.expiry_at) <= new Date();
  return <article className="listing-card">
    <div className="listing-image">
      {listing.image_url ? <img src={listing.image_url} alt={listing.title} onError={e=>{e.currentTarget.style.display='none';}} /> : null}
      {!listing.image_url && <div className="image-placeholder">Fresh finds<br/><span>ReShare</span></div>}
      <span className={`tag ${expired ? 'tag-danger' : 'tag-green'}`}>{expired ? 'Expired' : `Expires ${new Date(listing.expiry_at).toLocaleDateString()}`}</span>
    </div>
    <div className="listing-content">
      <div className="listing-category">{listing.category || 'Surplus food'} · {listing.pickup_area}</div>
      <h3>{listing.title}</h3><p className="description">{listing.description || 'Surplus food looking for a new home.'}</p>
      <div className="price-row"><strong>{money(listing.price_cents)}</strong>{listing.original_price_cents > listing.price_cents && <del>{money(listing.original_price_cents)}</del>}</div>
      <div className="listing-meta"><span>{listing.quantity_available} {listing.quantity_unit || 'item'} available</span><span>Seller: {listing.seller_name || 'Community seller'}</span></div>
      <button className="button button-primary full" disabled={role !== 'buyer' || expired || listing.quantity_available < 1} onClick={()=>onBuy(listing)}>{role !== 'buyer' ? 'Buyer account required' : 'Reserve item'}</button>
    </div>
  </article>;
}

function CreateListing({ onCreated }) {
  const [form, setForm] = useState({ title:'',description:'',category:'Bakery',price:'30',originalPrice:'50',quantity:'1',unit:'item',expiry:'',pickupAddress:'',area:'',imageUrl:'' });
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const update=(key,value)=>setForm(old=>({...old,[key]:value}));
  async function submit(e) {
    e.preventDefault();setBusy(true);setError('');
    try {
      const payload={title:form.title,description:form.description,category:form.category,price_cents:Math.round(Number(form.price)*100),original_price_cents:form.originalPrice?Math.round(Number(form.originalPrice)*100):null,quantity_available:Number(form.quantity),quantity_unit:form.unit,expiry_at:new Date(form.expiry).toISOString(),pickup_address:form.pickupAddress,pickup_area:form.area,image_url:form.imageUrl||null,allergens:[]};
      await api('/api/listings',{method:'POST',body:JSON.stringify(payload)});
      setForm({title:'',description:'',category:'Bakery',price:'30',originalPrice:'50',quantity:'1',unit:'item',expiry:'',pickupAddress:'',area:'',imageUrl:''});onCreated();
    } catch(e){setError(e.message);} finally{setBusy(false);}
  }
  return <form className="form-card" onSubmit={submit}>
    <div className="section-heading"><div><p className="eyebrow">SELL SURPLUS</p><h2>List food on ReShare</h2></div><span className="step-pill">Seller account</span></div>
    <div className="form-grid">
      <label>Food name<input required minLength="2" maxLength="120" value={form.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. Fresh bread pack"/></label>
      <label>Category<select value={form.category} onChange={e=>update('category',e.target.value)}><option>Bakery</option><option>Produce</option><option>Packaged</option><option>Meals</option><option>Dairy</option><option>Other</option></select></label>
      <label>Discounted price (₹)<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>update('price',e.target.value)}/></label>
      <label>Original price (₹)<input type="number" min="0" step="0.01" value={form.originalPrice} onChange={e=>update('originalPrice',e.target.value)}/></label>
      <label>Quantity<input required type="number" min="0" max="100000" value={form.quantity} onChange={e=>update('quantity',e.target.value)}/></label>
      <label>Unit<select value={form.unit} onChange={e=>update('unit',e.target.value)}><option>item</option><option>packet</option><option>kg</option><option>gram</option><option>portion</option><option>box</option><option>litre</option></select></label>
      <label>Expiry date and time<input required type="datetime-local" value={form.expiry} onChange={e=>update('expiry',e.target.value)}/></label>
      <label>Pickup area<input required value={form.area} onChange={e=>update('area',e.target.value)} placeholder="e.g. Viman Nagar"/></label>
      <label className="span-two">Pickup address<input required minLength="5" value={form.pickupAddress} onChange={e=>update('pickupAddress',e.target.value)} placeholder="Pickup location"/></label>
      <label className="span-two">Description<textarea rows="3" value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Quantity details, storage instructions, allergens..."/></label>
      <label className="span-two">Image URL (optional)<input type="url" value={form.imageUrl} onChange={e=>update('imageUrl',e.target.value)} placeholder="https://..."/><small>For cloud deployment, use the S3 presigned upload endpoint instead of public image URLs.</small></label>
    </div>
    {error && <p className="error">{error}</p>}<button className="button button-primary" disabled={busy}>{busy?'Publishing...':'Publish listing'}</button>
  </form>;
}

function Orders({ refreshKey }) {
  const [orders,setOrders]=useState([]);const [error,setError]=useState('');
  useEffect(()=>{api('/api/orders/mine').then(d=>setOrders(d.orders)).catch(e=>setError(e.message));},[refreshKey]);
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">YOUR PURCHASES</p><h2>Order history</h2><p className="muted">Only orders placed by your signed-in account are shown here.</p></div></div>
    {error&&<p className="error">{error}</p>}
    {!orders.length&&!error?<p className="muted">Your orders will appear here after you reserve an item.</p>:<div className="table-wrap"><table><thead><tr><th>Order</th><th>Items</th><th>Total</th><th>Order status</th><th>Delivery</th><th>Created</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.id.slice(0,8).toUpperCase()}</td><td>{(o.items||[]).map(i=>`${i.title} ×${i.quantity}`).join(', ')}</td><td>{money(o.total_cents)}</td><td><span className="status">{o.order_status}</span></td><td>{o.delivery_status||'Pending'}</td><td>{dateLabel(o.created_at)}</td></tr>)}</tbody></table></div>}
  </section>;
}

function SellerDashboard({ refreshKey, onChanged }) {
  const [listings,setListings]=useState([]);const [error,setError]=useState('');const [busy,setBusy]=useState('');
  async function load(){try{const data=await api('/api/listings/mine');setListings(data.listings);setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[refreshKey]);
  async function deactivate(id){setBusy(id);setError('');try{await api(`/api/listings/${id}`,{method:'DELETE'});await load();onChanged();}catch(e){setError(e.message);}finally{setBusy('');}}
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">SELLER WORKSPACE</p><h2>My listings</h2><p className="muted">This page shows listings created by your seller account only.</p></div><span className="count-pill">{listings.length} listings</span></div>
    {error&&<p className="error">{error}</p>}
    {!listings.length&&!error?<p className="muted">You have not listed any food yet. Select Sell surplus to create your first listing.</p>:<div className="table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Available</th><th>Units sold</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>{listings.map(l=><tr key={l.id}><td><strong>{l.title}</strong><br/><small>{l.pickup_area}</small></td><td>{money(l.price_cents)}</td><td>{l.quantity_available} {l.quantity_unit}</td><td>{l.units_sold}</td><td>{dateLabel(l.expiry_at)}</td><td><span className="status">{l.expiry_at && new Date(l.expiry_at)<new Date()?'EXPIRED':l.status}</span></td><td>{l.status!=='INACTIVE'&&<button className="button button-secondary mini-button" disabled={busy===l.id} onClick={()=>deactivate(l.id)}>{busy===l.id?'...':'Deactivate'}</button>}</td></tr>)}</tbody></table></div>}
  </section>;
}

function SellerSales({ refreshKey }) {
  const [orders,setOrders]=useState([]);const [error,setError]=useState('');
  useEffect(()=>{api('/api/orders/sales').then(d=>setOrders(d.orders)).catch(e=>setError(e.message));},[refreshKey]);
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">SALES & FULFILMENT</p><h2>Orders containing your products</h2><p className="muted">Only order items linked to your seller account are displayed.</p></div></div>
    {error&&<p className="error">{error}</p>}
    {!orders.length&&!error?<p className="muted">No sales yet. Your orders will appear here when buyers purchase your listings.</p>:<div className="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Items sold</th><th>Your subtotal</th><th>Status</th><th>Placed</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.id.slice(0,8).toUpperCase()}</td><td>{o.buyer_name}</td><td>{(o.items||[]).map(i=>`${i.title} ×${i.quantity}`).join(', ')}</td><td>{money(o.seller_total_cents)}</td><td><span className="status">{o.order_status}</span></td><td>{dateLabel(o.created_at)}</td></tr>)}</tbody></table></div>}
  </section>;
}

function DeliveryBoard({ refreshKey }) {
  const [deliveries,setDeliveries]=useState([]);const [error,setError]=useState('');const [busy,setBusy]=useState('');
  async function load(){try{setDeliveries((await api('/api/deliveries/mine')).deliveries);setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[refreshKey]);
  async function update(id,status){setBusy(id);try{await api(`/api/deliveries/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});await load();}catch(e){setError(e.message);}finally{setBusy('');}}
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">LAST-MILE LOGISTICS</p><h2>Delivery assignments</h2><p className="muted">Assignments are linked to the signed-in delivery account.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>
    {error&&<p className="error">{error}</p>}
    {!deliveries.length&&!error?<p className="muted">No delivery assignments available for this account yet.</p>:deliveries.map(d=><div className="delivery-row" key={d.id}><div><strong>Order {d.order_id.slice(0,8).toUpperCase()}</strong><p><strong>Pickup:</strong> {d.pickup_address}<br/><strong>Delivery:</strong> {d.delivery_address}</p><span className="status">{d.delivery_status}</span></div><div className="button-stack">{d.delivery_status==='ASSIGNED'&&<button className="button button-secondary" disabled={busy===d.id} onClick={()=>update(d.id,'ACCEPTED')}>Accept</button>}{d.delivery_status==='ACCEPTED'&&<button className="button button-secondary" disabled={busy===d.id} onClick={()=>update(d.id,'PICKED_UP')}>Mark picked up</button>}{d.delivery_status==='PICKED_UP'&&<button className="button button-primary" disabled={busy===d.id} onClick={()=>update(d.id,'DELIVERED')}>Mark delivered</button>}</div></div>)}
  </section>;
}

function AdminPanel() {
  const [data,setData]=useState(null);const [pending,setPending]=useState([]);const [error,setError]=useState('');
  async function load(){try{const [summary,p]=await Promise.all([api('/api/admin/summary'),api('/api/admin/pending-deliveries')]);setData(summary);setPending(p.deliveries);setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  return <section className="panel admin-panel"><div className="section-heading"><div><p className="eyebrow">RESTRICTED OPERATIONS</p><h2>Administrator dashboard</h2><p className="muted">Marketplace overview and delivery exceptions.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>
    {error&&<p className="error">{error}</p>}
    {data&&<><div className="stats-grid"><div className="stat"><span>Total listings</span><strong>{data.listings.total}</strong></div><div className="stat"><span>Available listings</span><strong>{data.listings.available}</strong></div><div className="stat"><span>Total orders</span><strong>{data.orders.total}</strong></div><div className="stat"><span>Pending delivery assignment</span><strong>{data.delivery.pending}</strong></div></div><div className="admin-detail-grid"><div><h3 className="subheading">Users by role</h3><div className="table-wrap"><table><thead><tr><th>Role</th><th>Accounts</th></tr></thead><tbody>{data.users.map(u=><tr key={u.role}><td>{u.role}</td><td>{u.count}</td></tr>)}</tbody></table></div></div><div><h3 className="subheading">Pending assignments</h3>{!pending.length?<p className="muted">No pending deliveries.</p>:pending.map(d=><div className="delivery-row" key={d.id}><div><strong>Order {d.order_id.slice(0,8).toUpperCase()}</strong><p>{d.pickup_area} · {d.pickup_address}</p></div><span className="status">{d.delivery_status}</span></div>)}</div></div></>}
  </section>;
}

function AdminShell({ user, onLogout }) {
  return <div className="app-shell admin-shell"><header className="topbar"><Brand subtitle="Administrator console"/><div className="header-right"><span className="admin-access-label">ADMIN ACCESS</span><span className="account-name">{user.name}</span><button className="button button-secondary logout-button" onClick={onLogout}>Sign out</button></div></header><main className="admin-main"><div className="admin-welcome"><div><p className="eyebrow">RESHARE OPERATIONS</p><h1>Welcome back, {user.name.split(' ')[0]}</h1><p className="muted">Manage listings and monitor the marketplace from one place.</p></div><span className="admin-stamp">Administrator</span></div><AdminPanel/></main><footer><a className="footer-brand" href="#">ReShare</a><span>Administrator console</span><span>Secure access</span></footer></div>;
}

export default function App() {
  const [user,setUser]=useState(null);const [authChecking,setAuthChecking]=useState(true);
  const [listings,setListings]=useState([]);const [search,setSearch]=useState('');const [area,setArea]=useState('');const [category,setCategory]=useState('');
  const [tab,setTab]=useState('browse');const [notice,setNotice]=useState('');const [refreshKey,setRefreshKey]=useState(0);const [loading,setLoading]=useState(false);const [error,setError]=useState('');

  useEffect(()=>{
    let alive=true;
    async function restore(){
      if(!getStoredToken()){if(alive)setAuthChecking(false);return;}
      try{const result=await api('/api/auth/me');if(alive){setUser(result.user);setTab(result.user.role==='admin'?'admin':result.user.role==='seller'?'myListings':result.user.role==='delivery'?'delivery':'browse');}}
      catch{clearSession();}
      finally{if(alive)setAuthChecking(false);}
    }
    restore();return()=>{alive=false;};
  },[]);

  async function loadListings(){
    setLoading(true);
    try{const params=new URLSearchParams();if(search)params.set('search',search);if(area)params.set('area',area);if(category)params.set('category',category);const data=await api(`/api/listings?${params.toString()}`);setListings(data.listings);setError('');}
    catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{if(!user||user.role==='admin')return;loadListings();},[user,search,area,category,refreshKey]);

  function authenticated(nextUser){setUser(nextUser);setTab(nextUser.role==='admin'?'admin':nextUser.role==='seller'?'myListings':nextUser.role==='delivery'?'delivery':'browse');setNotice('');}
  function logout(){clearSession();setUser(null);setListings([]);setNotice('');setTab('browse');setSearch('');setArea('');setCategory('');}

  async function buy(listing){
    const address=window.prompt('Enter the delivery address for this DEMO order:');if(!address)return;
    try{const result=await api('/api/orders',{method:'POST',body:JSON.stringify({items:[{listing_id:listing.id,quantity:1}],delivery_address:address,idempotency_key:crypto.randomUUID()})});setNotice(`${result.message} Order ${result.order.id.slice(0,8).toUpperCase()} created.`);setRefreshKey(k=>k+1);setTab('orders');}
    catch(e){setNotice(e.message);}
  }

  if(authChecking)return <div className="auth-loading"><div className="brand-mark">R</div><h2>Loading ReShare...</h2><p className="muted">Checking your session.</p></div>;
  if(!user)return <AuthScreen onAuthenticated={authenticated}/>;
  if(user.role==='admin')return <AdminShell user={user} onLogout={logout}/>;

  const canList=user.role==='seller';
  return <div className="app-shell"><Header user={user} onLogout={logout}/><main>
    <section className="hero"><div className="hero-copy"><span className="hero-pill">LESS WASTE. MORE VALUE.</span><h1>Good food deserves<br/><em>another chance.</em></h1><p>Discover surplus and near-expiry food at better prices. Help local sellers reduce waste while keeping good food in circulation.</p><div className="hero-actions"><button className="button button-light" onClick={()=>setTab('browse')}>Explore food <span>↗</span></button><span className="hero-note">Local food. Fair prices. Less waste.</span></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="food-circle"><span>GOOD<br/>FOOD</span><b>↻</b></div><div className="floating-card floating-one">Waste less</div><div className="floating-card floating-two">₹ <span>Save more</span></div></div></section>
    <section className="impact-strip"><div><strong>01</strong><span>List surplus food</span></div><div><strong>02</strong><span>Find local deals</span></div><div><strong>03</strong><span>Share more, waste less</span></div></section>
    {notice&&<div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notice">×</button></div>}
    <nav className="tabs"><button className={tab==='browse'?'active':''} onClick={()=>setTab('browse')}>Browse food</button>{canList&&<><button className={tab==='sell'?'active':''} onClick={()=>setTab('sell')}>Sell surplus</button><button className={tab==='myListings'?'active':''} onClick={()=>setTab('myListings')}>My listings</button><button className={tab==='sales'?'active':''} onClick={()=>setTab('sales')}>Sales & orders</button></>}{user.role==='buyer'&&<button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>My orders</button>}{user.role==='delivery'&&<button className={tab==='delivery'?'active':''} onClick={()=>setTab('delivery')}>Deliveries</button>}</nav>
    {tab==='browse'&&<section className="market-section"><div className="section-heading market-heading"><div><p className="eyebrow">THE RE-SHARE MARKET</p><h2>Find your next good deal</h2><p className="muted">Listings are ordered by expiry so you can discover time-sensitive deals.</p></div><span className="count-pill">{listings.length} available</span></div><div className="filters"><label className="search-field"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bread, produce, meals..."/></label><input aria-label="Filter by area" value={area} onChange={e=>setArea(e.target.value)} placeholder="Pickup area"/><select aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option><option>Bakery</option><option>Produce</option><option>Packaged</option><option>Meals</option><option>Dairy</option><option>Other</option></select></div>{error&&<div className="error-box">{error}</div>}{loading?<p className="muted">Loading available food...</p>:listings.length?<div className="listing-grid">{listings.map(item=><ListingCard key={item.id} listing={item} role={user.role} onBuy={buy}/>)}</div>:<div className="empty-state"><div className="empty-icon">↻</div><h3>No listings found yet</h3><p>Try another search, or select Sell surplus to add the first listing.</p></div>}</section>}
    {tab==='sell'&&canList&&<CreateListing onCreated={()=>{setRefreshKey(k=>k+1);setTab('myListings');setNotice('Your listing has been published.');}}/>}
    {tab==='myListings'&&canList&&<SellerDashboard refreshKey={refreshKey} onChanged={()=>setRefreshKey(k=>k+1)}/>}
    {tab==='sales'&&canList&&<SellerSales refreshKey={refreshKey}/>}
    {tab==='orders'&&user.role==='buyer'&&<Orders refreshKey={refreshKey}/>}{tab==='delivery'&&user.role==='delivery'&&<DeliveryBoard refreshKey={refreshKey}/>}
    <section className="safety-note"><div className="safety-icon">i</div><div><strong>Food safety comes first</strong><p>Only list food that is safe to consume. Clearly disclose expiry or best-before information, storage conditions and allergens. ReShare's demo checkout does not collect real payments.</p></div></section>
  </main><footer><a className="footer-brand" href="#">ReShare</a><span>Good food, shared better.</span><span>Cloud Computing Mini Project</span></footer></div>;
}
