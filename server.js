const express=require("express");
const XLSX=require("xlsx");
const path=require("path");
const crypto=require("crypto");
const {Pool}=require("pg");
const app=express();
const PORT=process.env.PORT||3000;
const ADMIN_KEY=process.env.ADMIN_KEY||"";
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;

app.use(express.json());

function escHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function xmlEsc(v){return escHtml(v);}
function siteBase(req){return String(process.env.SITE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");}
function absoluteUrl(base,u){if(!u)return `${base}/images/sns-share.svg`;if(/^https?:\/\//i.test(u))return u;return `${base}${u.startsWith('/')?'':'/'}${u}`;}
function verificationMeta(settings={}){const n=String(settings.naverSiteVerification||'').trim(),g=String(settings.googleSiteVerification||'').trim();const val=(raw,name)=>{if(!raw)return '';const m=raw.match(/content=[\"']([^\"']+)[\"']/i);return `<meta name=\"${name}\" content=\"${escHtml(m?m[1]:raw)}\">`};return val(n,'naver-site-verification')+val(g,'google-site-verification');}
async function publicSettings(){const settings={naverSiteVerification:'',googleSiteVerification:''};if(pool){try{const r=await pool.query("SELECT key,value FROM store_settings WHERE key IN ('naverSiteVerification','googleSiteVerification')");for(const x of r.rows)settings[x.key]=x.value}catch{}}return settings;}
function seoLayout({title,description,canonical,image,body,jsonLd='',verification=''}){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title><meta name="description" content="${escHtml(description)}"><link rel="canonical" href="${escHtml(canonical)}"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="website"><meta property="og:site_name" content="메이저코인 쇼핑몰"><meta property="og:title" content="${escHtml(title)}"><meta property="og:description" content="${escHtml(description)}"><meta property="og:url" content="${escHtml(canonical)}"><meta property="og:image" content="${escHtml(image)}"><meta name="twitter:card" content="summary_large_image">${verification||''}${jsonLd?`<script type="application/ld+json">${jsonLd.replace(/<\//g,'<\\/')}</script>`:''}<link rel="stylesheet" href="/style.css?v=1.6.19"></head><body>${body}</body></html>`;}

app.get('/robots.txt',(req,res)=>{const b=siteBase(req);res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${b}/sitemap.xml\n`)});
app.get('/sitemap.xml',async(req,res)=>{const b=siteBase(req);const ps=(await effectiveProducts()).filter(x=>x.active!==false);const cats=[...new Set(ps.map(x=>x.category).filter(Boolean))];const urls=[`${b}/`,...cats.map(c=>`${b}/category/${encodeURIComponent(c)}`),...ps.map(p=>`${b}/product/${p.id}`)];res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u,i)=>`<url><loc>${xmlEsc(u)}</loc><changefreq>${i?'daily':'hourly'}</changefreq><priority>${i?0.8:1.0}</priority></url>`).join('')}</urlset>`)});
app.get('/product/:id',async(req,res)=>{const p=await effectiveProduct(req.params.id);if(!p||p.active===false)return res.status(404).send('상품을 찾을 수 없습니다.');const b=siteBase(req),canonical=`${b}/product/${p.id}`,img=absoluteUrl(b,(p.images||[])[0]);const desc=(p.desc||p.detail||`${p.name} - 메이저코인 쇼핑몰`).slice(0,180);const ld=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:p.name,description:desc,image:(p.images||[]).map(x=>absoluteUrl(b,x)),category:p.category||'',offers:{'@type':'Offer',url:canonical,price:Number(p.price),priceCurrency:'KRW',availability:Number(p.stock||0)>0?'https://schema.org/InStock':'https://schema.org/OutOfStock'}});const body=`<main class="seo-product-page"><a href="/" class="seo-back">← 메이저코인 쇼핑몰</a><article><img src="${escHtml(img)}" alt="${escHtml(p.name)}"><div><p>${escHtml(p.category||'상품')}</p><h1>${escHtml(p.name)}</h1><p>${escHtml(desc)}</p><strong>${Math.round(Number(p.price)).toLocaleString('ko-KR')}원</strong><p>${escHtml(p.shippingText||'')}</p><a class="seo-open" href="/?product=${p.id}">Blog24에서 상품 보기</a></div></article></main>`;const settings=await publicSettings();res.send(seoLayout({title:`${p.name} | Blog24`,description:desc,canonical,image:img,body,jsonLd:ld,verification:verificationMeta(settings)}));});
app.get('/category/:name',async(req,res)=>{const name=decodeURIComponent(req.params.name),b=siteBase(req);const ps=(await effectiveProducts()).filter(x=>x.active!==false&&x.category===name);if(!ps.length)return res.status(404).send('카테고리를 찾을 수 없습니다.');const canonical=`${b}/category/${encodeURIComponent(name)}`;const cards=ps.map(p=>`<a class="seo-card" href="/product/${p.id}"><img src="${escHtml(absoluteUrl(b,(p.images||[])[0]))}" alt="${escHtml(p.name)}"><h2>${escHtml(p.name)}</h2><strong>${Math.round(Number(p.price)).toLocaleString('ko-KR')}원</strong></a>`).join('');const settings=await publicSettings();res.send(seoLayout({title:`${name} 상품 | Blog24`,description:`Blog24 ${name} 카테고리 상품을 확인하세요.`,canonical,image:`${b}/images/sns-share.svg`,verification:verificationMeta(settings),body:`<main class="seo-category-page"><a href="/" class="seo-back">← 메이저코인 쇼핑몰</a><h1>${escHtml(name)} 상품</h1><div class="seo-grid">${cards}</div></main>`}));});

app.get('/',async(req,res,next)=>{try{const html=await require('fs').promises.readFile(path.join(__dirname,'public','index.html'),'utf8');const settings=await publicSettings();res.type('html').send(html.replace('</head>',verificationMeta(settings)+'</head>'));}catch(e){next(e)}});

app.use(express.static(path.join(__dirname,"public")));

const DEFAULT_PRODUCTS=require("./public/default-products.json");
async function effectiveProducts(){
 if(!pool)return DEFAULT_PRODUCTS;
 try{
  const r=await pool.query("SELECT * FROM products ORDER BY sort_order,id");
  if(!r.rows.length)return DEFAULT_PRODUCTS;
  return r.rows.map(x=>({id:x.id,productCode:x.product_code||`MAJOR-P-${String(x.id).padStart(6,'0')}`,name:x.name,price:Number(x.price),shipping:Number(x.shipping||0),shippingText:x.shipping_text||'',category:x.category||'기타',desc:x.description||'',detail:x.detail||'',options:x.options||['기본'],images:x.images||[],detailImages:x.detail_images||[],youtube:x.youtube_url||'',active:x.active!==false,sortOrder:x.sort_order||x.id,stock:Number.isFinite(Number(x.stock))?Number(x.stock):9999}));
 }catch(e){console.error('products fallback',e.message);return DEFAULT_PRODUCTS}
}
async function effectiveProduct(id){return (await effectiveProducts()).find(x=>Number(x.id)===Number(id));}

async function initDb(){
 if(!pool)return;
 await pool.query(`
 CREATE TABLE IF NOT EXISTS orders(
  id BIGSERIAL PRIMARY KEY, order_id TEXT UNIQUE NOT NULL,
  pi_username TEXT,pi_uid TEXT,orderer_name TEXT,orderer_phone TEXT,recipient_name TEXT NOT NULL,phone TEXT NOT NULL,
  postal_code TEXT,address TEXT NOT NULL,address_detail TEXT,delivery_memo TEXT,
  item_total NUMERIC(18,7) NOT NULL DEFAULT 0,shipping_total NUMERIC(18,7) NOT NULL DEFAULT 0,
  paid_total NUMERIC(18,7) NOT NULL DEFAULT 0,payment_id TEXT UNIQUE,txid TEXT,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',order_status TEXT NOT NULL DEFAULT 'PENDING',
  courier TEXT,tracking_number TEXT,ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  preparing_at TIMESTAMPTZ,shipped_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,confirmed_at TIMESTAMPTZ);
 CREATE TABLE IF NOT EXISTS order_items(
  id BIGSERIAL PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id INT NOT NULL,product_name TEXT NOT NULL,quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(18,7) NOT NULL,shipping_fee NUMERIC(18,7) NOT NULL DEFAULT 0,
  item_status TEXT NOT NULL DEFAULT 'PAID');
 CREATE TABLE IF NOT EXISTS refunds(
  id BIGSERIAL PRIMARY KEY,refund_id TEXT UNIQUE NOT NULL,order_id TEXT NOT NULL REFERENCES orders(order_id),
  order_item_id BIGINT REFERENCES order_items(id),refund_type TEXT NOT NULL,
  product_amount NUMERIC(18,7) NOT NULL DEFAULT 0,shipping_amount NUMERIC(18,7) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18,7) NOT NULL,refund_wallet TEXT NOT NULL,reason TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED',refund_txid TEXT,requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,refunded_at TIMESTAMPTZ);
 CREATE TABLE IF NOT EXISTS products(
  id INT PRIMARY KEY,name TEXT NOT NULL,price NUMERIC(18,7) NOT NULL DEFAULT 0,shipping NUMERIC(18,7) NOT NULL DEFAULT 0,
  shipping_text TEXT,category TEXT,description TEXT,detail TEXT,options JSONB NOT NULL DEFAULT '["기본"]'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,detail_images JSONB NOT NULL DEFAULT '[]'::jsonb,youtube_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INT NOT NULL DEFAULT 0,stock INT NOT NULL DEFAULT 9999,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS store_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS categories(name TEXT PRIMARY KEY,active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INT NOT NULL DEFAULT 0,stock INT NOT NULL DEFAULT 9999,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS members(
  id BIGSERIAL PRIMARY KEY,login_id TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,email TEXT,point_balance BIGINT NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS point_ledger(
  id BIGSERIAL PRIMARY KEY,member_id BIGINT NOT NULL REFERENCES members(id),kind TEXT NOT NULL,amount BIGINT NOT NULL,balance_after BIGINT NOT NULL,reference TEXT,memo TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS recharge_requests(
  id BIGSERIAL PRIMARY KEY,recharge_id TEXT UNIQUE NOT NULL,member_id BIGINT NOT NULL REFERENCES members(id),method TEXT NOT NULL,requested_amount BIGINT NOT NULL,bonus_amount BIGINT NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'PENDING',coin_symbol TEXT,deposit_address TEXT,expected_coin_amount NUMERIC(30,12),txid TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ);
 `);
 await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS orderer_name TEXT");
 await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS orderer_phone TEXT");
 await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS member_id BIGINT");
 await pool.query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_option TEXT");
 const defaultCats=["생활","디지털","패션","식품","뷰티","기타"]; for(let i=0;i<defaultCats.length;i++) await pool.query("INSERT INTO categories(name,active,sort_order) VALUES($1,TRUE,$2) ON CONFLICT(name) DO NOTHING",[defaultCats[i],i+1]);
 const pc=Number((await pool.query("SELECT COUNT(*)::int n FROM products")).rows[0].n);
 if(pc===0){for(const p of DEFAULT_PRODUCTS){await pool.query(`INSERT INTO products(id,name,price,shipping,shipping_text,category,description,detail,options,images,detail_images,youtube_url,active,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14)`,[p.id,p.name,p.price,p.shipping,p.shippingText,p.category,p.desc,p.detail,JSON.stringify(p.options),JSON.stringify(p.images),JSON.stringify(p.detailImages),p.youtube,p.active,p.sortOrder])}}
 console.log("DB tables ready");
}

async function ensureV16Schema(){
  if(!pool) return;
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_deliver_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_confirm_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 9999`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT`);
  await pool.query(`UPDATE products SET product_code='MAJOR-P-' || LPAD(id::text,6,'0') WHERE product_code IS NULL OR product_code=''`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_uq ON products(product_code) WHERE product_code IS NOT NULL`);
}
async function applyAutomaticOrderStatuses(){
  if(!pool) return;
  await pool.query(`DELETE FROM orders WHERE order_status='PENDING' AND payment_status='PENDING' AND COALESCE(pending_expires_at,ordered_at+INTERVAL '6 hours') <= NOW()`);
  await pool.query(`UPDATE orders
    SET order_status='DELIVERED', delivered_at=COALESCE(delivered_at,NOW()),
        auto_confirm_at=COALESCE(auto_confirm_at,NOW()+INTERVAL '5 days')
    WHERE order_status='SHIPPED' AND shipped_at IS NOT NULL
      AND shipped_at <= NOW()-INTERVAL '3 days'`);
  await pool.query(`UPDATE orders
    SET order_status='CONFIRMED', confirmed_at=COALESCE(confirmed_at,NOW())
    WHERE order_status='DELIVERED' AND delivered_at IS NOT NULL
      AND delivered_at <= NOW()-INTERVAL '5 days'`);
}

function needDb(req,res,next){if(!pool)return res.status(503).json({ok:false,error:"DATABASE_URL missing"});next()}
const adminSessions=new Map();
function cookieValue(req,name){const raw=req.headers.cookie||"";for(const part of raw.split(";")){const [k,...v]=part.trim().split("=");if(k===name)return decodeURIComponent(v.join("="));}return "";}
function needAdmin(req,res,next){if(!ADMIN_KEY)return res.status(503).json({ok:false,error:"ADMIN_KEY missing"});const token=cookieValue(req,"blog24_admin_session");const exp=adminSessions.get(token);if(!token||!exp||exp<Date.now()){if(token)adminSessions.delete(token);return res.status(401).json({ok:false,error:"관리자 로그인이 필요합니다."});}adminSessions.set(token,Date.now()+8*60*60*1000);next();}
app.post("/api/admin/login",(req,res)=>{if(!ADMIN_KEY)return res.status(503).json({ok:false,error:"ADMIN_KEY missing"});if(String(req.body?.key||"")!==ADMIN_KEY)return res.status(401).json({ok:false,error:"관리자 키가 올바르지 않습니다."});const token=crypto.randomBytes(32).toString("hex");adminSessions.set(token,Date.now()+8*60*60*1000);res.setHeader("Set-Cookie",`blog24_admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);res.json({ok:true});});
app.get("/api/admin/session",needAdmin,(req,res)=>res.json({ok:true}));
app.post("/api/admin/logout",needAdmin,(req,res)=>{const token=cookieValue(req,"blog24_admin_session");adminSessions.delete(token);res.setHeader("Set-Cookie","blog24_admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");res.json({ok:true});});

const memberSessions=new Map();
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){const h=crypto.scryptSync(String(password),salt,64).toString("hex");return `${salt}:${h}`;}
function verifyPassword(password,stored){try{const [salt,h]=String(stored).split(":");const got=crypto.scryptSync(String(password),salt,64);return crypto.timingSafeEqual(got,Buffer.from(h,"hex"));}catch{return false;}}
async function currentMemberFromReq(req){if(!pool)return null;const token=cookieValue(req,"majorcoin_member_session");const x=memberSessions.get(token);if(!x||x.exp<Date.now()){if(token)memberSessions.delete(token);return null;}x.exp=Date.now()+7*24*60*60*1000;const r=await pool.query("SELECT id,login_id,name,phone,email,point_balance FROM members WHERE id=$1",[x.memberId]);return r.rows[0]||null;}
app.post("/api/auth/register",needDb,async(req,res)=>{try{const {loginId,password,name,phone,email}=req.body||{};if(!/^[A-Za-z0-9_.-]{4,30}$/.test(String(loginId||"")))return res.status(400).json({ok:false,error:"아이디는 영문/숫자 4~30자로 입력해주세요."});if(String(password||"").length<6)return res.status(400).json({ok:false,error:"비밀번호는 6자 이상 입력해주세요."});if(!String(name||"").trim())return res.status(400).json({ok:false,error:"이름을 입력해주세요."});const r=await pool.query("INSERT INTO members(login_id,password_hash,name,phone,email) VALUES($1,$2,$3,$4,$5) RETURNING id,login_id,name,phone,email,point_balance",[loginId,hashPassword(password),String(name).trim(),phone||null,email||null]);const token=crypto.randomBytes(32).toString("hex");memberSessions.set(token,{memberId:r.rows[0].id,exp:Date.now()+7*24*60*60*1000});res.setHeader("Set-Cookie",`majorcoin_member_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);res.json({ok:true,user:r.rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({ok:false,error:"이미 사용 중인 아이디입니다."});res.status(500).json({ok:false,error:e.message});}});
app.post("/api/auth/login",needDb,async(req,res)=>{const {loginId,password}=req.body||{};const r=await pool.query("SELECT * FROM members WHERE login_id=$1",[loginId]);if(!r.rows.length||!verifyPassword(password,r.rows[0].password_hash))return res.status(401).json({ok:false,error:"아이디 또는 비밀번호가 올바르지 않습니다."});const token=crypto.randomBytes(32).toString("hex");memberSessions.set(token,{memberId:r.rows[0].id,exp:Date.now()+7*24*60*60*1000});res.setHeader("Set-Cookie",`majorcoin_member_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);res.json({ok:true,user:{id:r.rows[0].id,login_id:r.rows[0].login_id,name:r.rows[0].name,phone:r.rows[0].phone,email:r.rows[0].email,point_balance:r.rows[0].point_balance}});});
app.get("/api/auth/me",needDb,async(req,res)=>{const user=await currentMemberFromReq(req);res.json({ok:true,user});});
app.post("/api/auth/logout",async(req,res)=>{const token=cookieValue(req,"majorcoin_member_session");memberSessions.delete(token);res.setHeader("Set-Cookie","majorcoin_member_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");res.json({ok:true});});
app.post("/api/points/recharge-request",needDb,async(req,res)=>{const user=await currentMemberFromReq(req);if(!user)return res.status(401).json({ok:false,error:"로그인이 필요합니다."});const amount=Number(req.body?.amount),method=String(req.body?.method||""),coinSymbol=String(req.body?.coinSymbol||"").toUpperCase();const bonuses={100000:0,300000:30000,500000:50000,1000000:100000};if(!(amount in bonuses)||!['COIN','BANK'].includes(method))return res.status(400).json({ok:false,error:"충전 금액 또는 방법이 올바르지 않습니다."});let coin=null;if(method==='COIN'){const r=await pool.query("SELECT value FROM store_settings WHERE key='majorCoinsJson'");let coins=[];try{coins=JSON.parse(r.rows[0]?.value||'[]')}catch{}coin=(Array.isArray(coins)?coins:[]).find(x=>x.active!==false&&String(x.symbol||'').toUpperCase()===coinSymbol&&x.address);if(!coin)return res.status(400).json({ok:false,error:"사용 가능한 코인을 선택해주세요."});}const rid=`RC-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;await pool.query("INSERT INTO recharge_requests(recharge_id,member_id,method,requested_amount,bonus_amount,coin_symbol,deposit_address) VALUES($1,$2,$3,$4,$5,$6,$7)",[rid,user.id,method,amount,bonuses[amount],coin?.symbol||null,coin?.address||null]);res.json({ok:true,rechargeId:rid,amount,bonus:bonuses[amount],coin:coin?{symbol:coin.symbol,name:coin.name||coin.symbol,network:coin.network||'',address:coin.address,memo:coin.memo||''}:null,message:method==='COIN'?'충전요청이 생성되었습니다. 표시된 주소로 선택한 코인을 전송해주세요.':'지정 계좌 입금 확인 후 포인트가 적립됩니다.'});});
app.post("/api/orders/:orderId/pay-points",needDb,async(req,res)=>{const user=await currentMemberFromReq(req);if(!user)return res.status(401).json({ok:false,error:"로그인이 필요합니다."});const c=await pool.connect();try{await c.query('BEGIN');const q=await c.query("SELECT * FROM orders WHERE order_id=$1 AND member_id=$2 FOR UPDATE",[req.params.orderId,user.id]);if(!q.rows.length)throw new Error('주문을 찾을 수 없습니다.');const o=q.rows[0];if(o.order_status!=='PENDING')throw new Error('결제대기 주문이 아닙니다.');const m=await c.query("SELECT point_balance FROM members WHERE id=$1 FOR UPDATE",[user.id]);const bal=Number(m.rows[0].point_balance),need=Math.round(Number(o.paid_total));if(bal<need){await c.query('ROLLBACK');return res.status(409).json({ok:false,error:'포인트가 부족합니다.',code:'INSUFFICIENT_POINTS',balance:bal,required:need});}const after=bal-need;await c.query("UPDATE members SET point_balance=$1 WHERE id=$2",[after,user.id]);await c.query("INSERT INTO point_ledger(member_id,kind,amount,balance_after,reference,memo) VALUES($1,'PURCHASE',$2,$3,$4,$5)",[user.id,-need,after,o.order_id,'쇼핑몰 상품 결제']);await c.query("UPDATE orders SET payment_status='PAID',order_status='PAID',payment_id=$1 WHERE order_id=$2",[`POINT-${o.order_id}`,o.order_id]);await c.query('COMMIT');res.json({ok:true,balance:after});}catch(e){try{await c.query('ROLLBACK')}catch{}res.status(400).json({ok:false,error:e.message});}finally{c.release();}});
app.get("/api/products",async(req,res)=>{let products=(await effectiveProducts()).filter(x=>x.active!==false);if(pool){try{const r=await pool.query("SELECT name FROM categories WHERE active=TRUE");const visible=new Set(r.rows.map(x=>x.name));products=products.filter(x=>visible.has(x.category));}catch(e){console.error(e.message)}}res.json({ok:true,products});});
app.get("/api/categories",async(req,res)=>{let categories=["생활","디지털","패션","식품","뷰티","기타"];if(pool){try{const r=await pool.query("SELECT name FROM categories WHERE active=TRUE ORDER BY sort_order,name");categories=r.rows.map(x=>x.name)}catch{}}res.json({ok:true,categories});});
app.get("/api/store-settings",async(req,res)=>{let settings={slideYoutube:"",shortsUrl:"",slidesJson:"[]",slideTime:"5",homeSectionsJson:"[]",footerText:"회사명: Blog24\n고객센터: 02-000-8282",copyright:"Copyright © 2026 Blog24. All rights reserved.",terms:"제1조(목적)\n본 약관은 메이저코인 쇼핑몰의 서비스 이용 조건과 절차를 정합니다.\n\n제2조(주문 및 결제)\n상품 주문, 결제, 배송 및 취소는 화면에 표시된 절차와 관련 법령에 따릅니다.\n\n제3조(환불)\n환불 및 교환은 상품 특성과 관련 법령, 판매자가 고지한 기준에 따릅니다.",naverSiteVerification:"",googleSiteVerification:"",exchangeName:"",majorCoinsJson:"[]",privacy:"Blog24는 주문 처리와 배송을 위해 필요한 범위에서 개인정보를 처리합니다.\n\n수집 항목: 주문자/수령인 이름, 연락처, 배송지, 주문 및 결제 식별정보\n이용 목적: 주문 확인, 결제 확인, 배송, 고객 문의 처리\n보유 기간: 관련 법령 및 운영상 필요한 기간 동안 보관 후 파기합니다.\n\n이 기본 문안은 운영자가 실제 사업 내용과 적용 법령에 맞게 검토·수정해야 합니다."};if(pool){try{const r=await pool.query("SELECT key,value FROM store_settings");for(const x of r.rows)settings[x.key]=x.value}catch{}}res.json({ok:true,settings});});
app.get("/api/admin/products",needDb,needAdmin,async(req,res)=>res.json({ok:true,products:await effectiveProducts()}));
app.get("/api/admin/categories",needDb,needAdmin,async(req,res)=>{const r=await pool.query("SELECT name,active,sort_order FROM categories ORDER BY sort_order,name");res.json({ok:true,categories:r.rows})});
app.post("/api/admin/categories",needDb,needAdmin,async(req,res)=>{try{const c=req.body||{};const old=String(c.oldName||c.name||'').trim(),name=String(c.name||'').trim();if(!name)return res.status(400).json({ok:false,error:'카테고리명을 입력하세요.'});if(old&&old!==name){await pool.query("UPDATE products SET category=$1 WHERE category=$2",[name,old]);await pool.query("DELETE FROM categories WHERE name=$1",[old]);}await pool.query("INSERT INTO categories(name,active,sort_order,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(name) DO UPDATE SET active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,stock=EXCLUDED.stock,updated_at=NOW()",[name,c.active!==false,Number(c.sortOrder)||0]);res.json({ok:true})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.delete("/api/admin/categories/:name",needDb,needAdmin,async(req,res)=>{const name=decodeURIComponent(req.params.name);const n=Number((await pool.query("SELECT COUNT(*)::int n FROM products WHERE category=$1",[name])).rows[0].n);if(n)return res.status(400).json({ok:false,error:`등록 상품 ${n}개가 있어 삭제할 수 없습니다. 숨김을 사용하세요.`});await pool.query("DELETE FROM categories WHERE name=$1",[name]);res.json({ok:true})});
app.post("/api/admin/products",needDb,needAdmin,async(req,res)=>{try{const p=req.body||{};const id=Number(p.id)||Number((await pool.query("SELECT COALESCE(MAX(id),0)+1 id FROM products")).rows[0].id);const existing=Number(p.id)?(await pool.query('SELECT product_code FROM products WHERE id=$1',[id])).rows[0]:null;const productCode=existing?.product_code||`MAJOR-P-${String(id).padStart(6,'0')}`;await pool.query(`INSERT INTO products(id,product_code,name,price,shipping,shipping_text,category,description,detail,options,images,detail_images,youtube_url,active,sort_order,stock,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,NOW()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,shipping=EXCLUDED.shipping,shipping_text=EXCLUDED.shipping_text,category=EXCLUDED.category,description=EXCLUDED.description,detail=EXCLUDED.detail,options=EXCLUDED.options,images=EXCLUDED.images,detail_images=EXCLUDED.detail_images,youtube_url=EXCLUDED.youtube_url,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,stock=EXCLUDED.stock,updated_at=NOW()`,[id,productCode,p.name||'상품',Number(p.price)||0,Number(p.shipping)||0,p.shippingText||'',p.category||'기타',p.desc||'',p.detail||'',JSON.stringify(p.options||['기본']),JSON.stringify(p.images||[]),JSON.stringify(p.detailImages||[]),p.youtube||'',p.active!==false,Number(p.sortOrder)||id,Number.isFinite(Number(p.stock))?Math.max(0,Math.floor(Number(p.stock))):9999]);res.json({ok:true,id})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get("/api/admin/products/:id/delete-check",needDb,needAdmin,async(req,res)=>{const id=Number(req.params.id);const r=await pool.query("SELECT COUNT(DISTINCT order_id)::int n FROM order_items WHERE product_id=$1",[id]);res.json({ok:true,orderCount:Number(r.rows[0]?.n||0)})});
app.delete("/api/admin/products/:id",needDb,needAdmin,async(req,res)=>{await pool.query("DELETE FROM products WHERE id=$1",[Number(req.params.id)]);res.json({ok:true})});
app.post("/api/admin/seed-products",needDb,needAdmin,async(req,res)=>{try{for(const p of DEFAULT_PRODUCTS){await pool.query(`INSERT INTO products(id,name,price,shipping,shipping_text,category,description,detail,options,images,detail_images,youtube_url,active,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14) ON CONFLICT(id) DO NOTHING`,[p.id,p.name,p.price,p.shipping,p.shippingText,p.category,p.desc,p.detail,JSON.stringify(p.options),JSON.stringify(p.images),JSON.stringify(p.detailImages),p.youtube,p.active,p.sortOrder])}res.json({ok:true})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.post("/api/admin/store-settings",needDb,needAdmin,async(req,res)=>{try{for(const [k,v] of Object.entries(req.body||{})){if(!['slideYoutube','shortsUrl','slidesJson','slideTime','homeSectionsJson','footerText','copyright','terms','privacy','naverSiteVerification','googleSiteVerification','exchangeName','majorCoinsJson'].includes(k))continue;await pool.query("INSERT INTO store_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[k,String(v||'')])}res.json({ok:true})}catch(e){res.status(500).json({ok:false,error:e.message})}});

app.get("/api/coin-config",async(req,res)=>{let coins=[];if(pool){try{const r=await pool.query("SELECT value FROM store_settings WHERE key='majorCoinsJson'");coins=JSON.parse(r.rows[0]?.value||'[]')}catch{}}coins=(Array.isArray(coins)?coins:[]).filter(x=>x&&x.active!==false&&x.symbol&&x.address).map(x=>({symbol:String(x.symbol).toUpperCase(),name:String(x.name||x.symbol),network:String(x.network||''),address:String(x.address),memo:String(x.memo||'')}));res.json({ok:true,coins});});
app.get("/api/admin/exchange-api-status",needAdmin,async(req,res)=>{let exchange='';if(pool){try{const r=await pool.query("SELECT value FROM store_settings WHERE key='exchangeName'");exchange=String(r.rows[0]?.value||'').toUpperCase()}catch{}}const envMap={UPBIT:['UPBIT_ACCESS_KEY','UPBIT_SECRET_KEY'],BITHUMB:['BITHUMB_API_KEY','BITHUMB_API_SECRET'],BITGET:['BITGET_API_KEY','BITGET_API_SECRET','BITGET_API_PASSPHRASE']};const keys=envMap[exchange]||[];const missing=keys.filter(k=>!process.env[k]);res.json({ok:true,exchange,configured:!!keys.length&&!missing.length,required:keys,missing});});
app.get("/health",(req,res)=>res.json({ok:true,app:"메이저코인 쇼핑몰",databaseConfigured:!!pool,adminConfigured:!!ADMIN_KEY}));

app.post("/api/orders/draft",needDb,async(req,res)=>{
 try{
  const {orderId,shipping,items}=req.body||{}; const member=await currentMemberFromReq(req); if(!member)return res.status(401).json({ok:false,error:"로그인이 필요합니다."});
  if(!orderId||!shipping?.recipientName||!shipping?.phone||!shipping?.address||!items?.length)
   return res.status(400).json({ok:false,error:"주문/배송 정보가 부족합니다."});
  let itemTotal=0,shippingTotal=0; const verified=[];
  for(const x of items){
   const p=await effectiveProduct(Number(x.id)); if(!p||p.active===false)return res.status(400).json({ok:false,error:"판매중이 아닌 상품입니다."}); if(Number(p.stock)<Number(x.qty||1))return res.status(409).json({ok:false,error:`${p.name} 재고가 부족합니다.`});
   const qty=Math.max(1,Math.min(99,Number(x.qty)||1)), option=String(x.option||"기본").slice(0,100);
   itemTotal+=p.price*qty; shippingTotal+=p.shipping*qty; verified.push({...p,qty,option});
  }
  const total=Number((itemTotal+shippingTotal).toFixed(7)),c=await pool.connect();
  try{await c.query("BEGIN");
   await c.query(`INSERT INTO orders(order_id,member_id,orderer_name,orderer_phone,recipient_name,phone,postal_code,address,address_detail,delivery_memo,item_total,shipping_total,paid_total,pending_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()+INTERVAL '6 hours') ON CONFLICT(order_id) DO NOTHING`,
    [orderId,member.id,shipping.ordererName||member.name||null,shipping.ordererPhone||member.phone||null,shipping.recipientName,shipping.phone,shipping.postalCode||null,shipping.address,shipping.addressDetail||null,shipping.deliveryMemo||null,itemTotal,shippingTotal,total]);
   const exists=await c.query("SELECT COUNT(*)::int n FROM order_items WHERE order_id=$1",[orderId]);
   if(Number(exists.rows[0].n)===0) for(const p of verified) await c.query(`INSERT INTO order_items(order_id,product_id,product_name,product_option,quantity,unit_price,shipping_fee)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[orderId,p.id,p.name,p.option,p.qty,p.price,p.shipping]);
   await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
  res.json({ok:true,orderId,amount:total,itemTotal:Number(itemTotal.toFixed(7)),shippingTotal:Number(shippingTotal.toFixed(7))});
 }catch(e){console.error(e);res.status(500).json({ok:false,error:e.message})}
});

app.get("/api/orders/mine",needDb,async(req,res)=>{
 try{await applyAutomaticOrderStatuses();}catch(e){console.error(e)}
 try{
  const member=await currentMemberFromReq(req); if(!member)return res.status(401).json({ok:false,error:"로그인이 필요합니다."});
  const r=await pool.query(`SELECT o.*,COALESCE(json_agg(json_build_object('id',i.id,'productId',i.product_id,'productName',i.product_name,'option',i.product_option,'quantity',i.quantity,'unitPrice',i.unit_price,'shippingFee',i.shipping_fee,'itemStatus',i.item_status) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),'[]') items FROM orders o LEFT JOIN order_items i ON i.order_id=o.order_id WHERE o.member_id=$1 GROUP BY o.id ORDER BY o.ordered_at DESC LIMIT 100`,[member.id]);
  res.json({ok:true,orders:r.rows});
 }catch(e){console.error(e);res.status(500).json({ok:false,error:e.message})}
});

app.get("/api/orders/:orderId",needDb,async(req,res)=>{
 try{await applyAutomaticOrderStatuses();}catch(e){console.error(e)}
 try{const member=await currentMemberFromReq(req);if(!member)return res.status(401).json({ok:false,error:"로그인이 필요합니다."});
  const o=await pool.query("SELECT * FROM orders WHERE order_id=$1 AND member_id=$2",[req.params.orderId,member.id]);if(!o.rows.length)return res.status(404).json({ok:false,error:"주문을 찾을 수 없습니다."});
  const i=await pool.query("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id",[req.params.orderId]);res.json({ok:true,order:{...o.rows[0],items:i.rows}});
 }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.delete("/api/orders/:orderId/pending",needDb,async(req,res)=>{
 try{
  const member=await currentMemberFromReq(req); if(!member)return res.status(401).json({ok:false,error:"로그인이 필요합니다."});
  const q=await pool.query("DELETE FROM orders WHERE order_id=$1 AND member_id=$2 AND order_status='PENDING' AND payment_status='PENDING' RETURNING order_id",[req.params.orderId,member.id]);
  if(!q.rows.length)return res.status(409).json({ok:false,error:"삭제할 수 있는 결제대기 주문이 아닙니다."});
  res.json({ok:true});
 }catch(e){res.status(500).json({ok:false,error:e.message})}
});

function parseProductWorkbook(base64){
 const buf=Buffer.from(String(base64||'').replace(/^data:.*?;base64,/,''),'base64');
 if(!buf.length)throw new Error('엑셀 파일이 비어 있습니다.');
 const wb=XLSX.read(buf,{type:'buffer'}),ws=wb.Sheets[wb.SheetNames[0]];
 if(!ws)throw new Error('첫 번째 시트를 읽을 수 없습니다.');
 return XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
}
function splitDetailImages(v){return String(v||'').split(/\r?\n|\|/).map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/<img[^>]+src=["']([^"']+)["']/i);return (m?m[1]:x).trim()}).filter(Boolean)}
function normalizeImportRow(r,rowNo){
 const g=(...ks)=>{for(const k of ks)if(r[k]!==undefined&&String(r[k]).trim()!=='')return String(r[k]).trim();return ''};
 const name=g('상품명'),price=Number(g('가격(원)','가격','가격(π)')),category=g('카테고리'),shipping=Number(g('배송비(원)','배송비','배송비(π)')||0),stock=Number(g('재고수량','재고')||9999),sortOrder=Number(g('노출순서')||rowNo-1),active=!['N','NO','FALSE','0','숨김','판매중지'].includes(g('판매중').toUpperCase());
 const options=g('옵션').split(',').map(x=>x.trim()).filter(Boolean);const images=[g('대표이미지 URL 1'),g('이미지 URL 2'),g('이미지 URL 3')].filter(Boolean);const detailImages=splitDetailImages(g('상세페이지 이미지 URL/HTML'));
 const youtube=g('YouTube URL'),desc=g('간단/상세 설명');const errors=[];
 if(!name)errors.push('상품명 누락');if(!Number.isFinite(price)||price<0)errors.push('가격 오류');if(!category)errors.push('카테고리 누락');if(!Number.isFinite(shipping)||shipping<0)errors.push('배송비 오류');if(!Number.isFinite(stock)||stock<0||!Number.isInteger(stock))errors.push('재고수량 오류');
 for(const [label,u] of [['대표이미지',images[0]],['이미지2',images[1]],['이미지3',images[2]],['YouTube',youtube],...detailImages.map((u,i)=>['상세이미지'+(i+1),u])])if(u&&!/^https?:\/\//i.test(u)&&!u.startsWith('/'))errors.push(label+' URL 오류');
 return {rowNo,name,price,category,shipping,options:options.length?options:['기본'],youtube,images,detailImages,sortOrder:Number.isFinite(sortOrder)?sortOrder:rowNo-1,stock,desc,active,errors};
}
async function validateProductImport(base64){const rows=parseProductWorkbook(base64);const normalized=rows.map((r,i)=>normalizeImportRow(r,i+2));const cats=new Set((await pool.query('SELECT name FROM categories')).rows.map(x=>x.name));for(const x of normalized)if(x.category&&!cats.has(x.category))x.errors.push('등록되지 않은 카테고리');return normalized}
app.post('/api/admin/products-import/validate',needDb,needAdmin,async(req,res)=>{try{const rows=await validateProductImport(req.body?.fileBase64);res.json({ok:true,total:rows.length,valid:rows.filter(x=>!x.errors.length).length,invalid:rows.filter(x=>x.errors.length).length,rows:rows.map(x=>({rowNo:x.rowNo,name:x.name,errors:x.errors}))})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/admin/products-import/commit',needDb,needAdmin,async(req,res)=>{let c;try{const rows=await validateProductImport(req.body?.fileBase64);const bad=rows.filter(x=>x.errors.length);if(!rows.length)return res.status(400).json({ok:false,error:'등록할 상품이 없습니다.'});if(bad.length)return res.status(400).json({ok:false,error:'검사 오류가 있어 등록하지 않았습니다.',rows:bad.map(x=>({rowNo:x.rowNo,name:x.name,errors:x.errors}))});c=await pool.connect();await c.query('BEGIN');for(const x of rows){const id=Number((await c.query('SELECT COALESCE(MAX(id),0)+1 id FROM products')).rows[0].id),code=`MAJOR-P-${String(id).padStart(6,'0')}`;await c.query(`INSERT INTO products(id,product_code,name,price,shipping,shipping_text,category,description,detail,options,images,detail_images,youtube_url,active,sort_order,stock,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,NOW())`,[id,code,x.name,x.price,x.shipping,x.shipping?`${Math.round(x.shipping).toLocaleString('ko-KR')}원`:'무료배송',x.category,x.desc,x.desc,JSON.stringify(x.options),JSON.stringify(x.images),JSON.stringify(x.detailImages),x.youtube,x.active,x.sortOrder,x.stock])}await c.query('COMMIT');res.json({ok:true,count:rows.length})}catch(e){if(c)try{await c.query('ROLLBACK')}catch{}res.status(500).json({ok:false,error:e.message})}finally{if(c)c.release()}});

app.get("/api/admin/orders",needDb,needAdmin,async(req,res)=>{
  await applyAutomaticOrderStatuses();
  const status=(req.query.status||"ALL").toUpperCase();
  const allowed=["ALL","PAID","PREPARING","SHIPPED","DELIVERED","CONFIRMED","CANCELLED","REFUND_REQUESTED","REFUNDED"];
  if(!allowed.includes(status)) return res.status(400).json({ok:false,error:"잘못된 상태"});
  const sql=status==="ALL"
    ? "SELECT * FROM orders ORDER BY ordered_at DESC LIMIT 1000"
    : "SELECT * FROM orders WHERE order_status=$1 ORDER BY ordered_at DESC LIMIT 1000";
  const r=await pool.query(sql,status==="ALL"?[]:[status]);
  const counts=(await pool.query(`SELECT order_status,COUNT(*)::int count FROM orders GROUP BY order_status`)).rows;
  res.json({ok:true,orders:r.rows,counts});
});
app.post("/api/admin/orders/:orderId/preparing",needDb,needAdmin,async(req,res)=>{
 const q=await pool.query("UPDATE orders SET order_status='PREPARING',preparing_at=NOW() WHERE order_id=$1 AND order_status IN ('PAID','PENDING') RETURNING order_id,order_status",[req.params.orderId]);
 if(!q.rows.length)return res.status(409).json({ok:false,error:"결제완료 주문만 상품준비 처리할 수 있습니다."});
 res.json({ok:true,order:q.rows[0]});
});
app.post("/api/admin/orders/:orderId/ship",needDb,needAdmin,async(req,res)=>{
 const {courier,trackingNumber}=req.body||{};if(!trackingNumber)return res.status(400).json({ok:false,error:"송장번호 필요"});
 await pool.query("UPDATE orders SET order_status='SHIPPED',courier=$1,tracking_number=$2,shipped_at=NOW(),auto_deliver_at=NOW()+INTERVAL '3 days' WHERE order_id=$3",[courier||null,trackingNumber,req.params.orderId]);res.json({ok:true});
});
app.post("/api/admin/orders/:orderId/delivered",needDb,needAdmin,async(req,res)=>{const q=await pool.query("UPDATE orders SET order_status='DELIVERED',delivered_at=NOW(),auto_confirm_at=NOW()+INTERVAL '5 days' WHERE order_id=$1 AND order_status='SHIPPED' RETURNING order_id",[req.params.orderId]);if(!q.rows.length)return res.status(409).json({ok:false,error:'배송중 주문만 배송완료 처리할 수 있습니다.'});res.json({ok:true});});
app.post("/api/refunds/request",needDb,async(req,res)=>{
 try{
  const {orderId,orderItemId,refundWallet,reason}=req.body||{};if(!orderId||!refundWallet)return res.status(400).json({ok:false,error:"주문번호/환불지갑 필요"});
  let pa=0,sa=0,type="FULL";
  if(orderItemId){type="PARTIAL";const r=await pool.query("SELECT unit_price,quantity,shipping_fee FROM order_items WHERE id=$1 AND order_id=$2",[orderItemId,orderId]);if(!r.rows.length)return res.status(404).json({ok:false,error:"주문상품 없음"});pa=Number(r.rows[0].unit_price)*Number(r.rows[0].quantity);sa=Number(r.rows[0].shipping_fee)*Number(r.rows[0].quantity)}
  else{const r=await pool.query("SELECT item_total,shipping_total FROM orders WHERE order_id=$1",[orderId]);if(!r.rows.length)return res.status(404).json({ok:false,error:"주문 없음"});pa=Number(r.rows[0].item_total);sa=Number(r.rows[0].shipping_total)}
  const amount=Number((pa+sa).toFixed(7)),rid=`RF-${Date.now()}`;
  await pool.query(`INSERT INTO refunds(refund_id,order_id,order_item_id,refund_type,product_amount,shipping_amount,refund_amount,refund_wallet,reason)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[rid,orderId,orderItemId||null,type,pa,sa,amount,refundWallet,reason||null]);
  res.json({ok:true,refundId:rid,refundAmount:amount});
 }catch(e){res.status(500).json({ok:false,error:e.message})}
});
app.post("/api/admin/refunds/:refundId/approve",needDb,needAdmin,async(req,res)=>{
 await pool.query("UPDATE refunds SET status='APPROVED',approved_at=NOW() WHERE refund_id=$1",[req.params.refundId]);res.json({ok:true});
});
app.post("/api/admin/refunds/:refundId/complete",needDb,needAdmin,async(req,res)=>{
 const {txid}=req.body||{};if(!txid)return res.status(400).json({ok:false,error:"환불 TXID 필요"});
 await pool.query("UPDATE refunds SET status='REFUNDED',refund_txid=$1,refunded_at=NOW() WHERE refund_id=$2",[txid,req.params.refundId]);res.json({ok:true});
});
app.get("/api/admin/stats",needDb,needAdmin,async(req,res)=>{
 const s=(await pool.query(`SELECT
 COALESCE(SUM(paid_total) FILTER(WHERE payment_status='PAID' AND ordered_at::date=CURRENT_DATE),0) day_sales,
 COALESCE(SUM(paid_total) FILTER(WHERE payment_status='PAID' AND date_trunc('month',ordered_at)=date_trunc('month',NOW())),0) month_sales,
 COALESCE(SUM(paid_total) FILTER(WHERE payment_status='PAID' AND date_trunc('year',ordered_at)=date_trunc('year',NOW())),0) year_sales,
 COALESCE(SUM(paid_total) FILTER(WHERE payment_status='PAID'),0) gross_sales FROM orders`)).rows[0];
 const refunded=Number((await pool.query("SELECT COALESCE(SUM(refund_amount) FILTER(WHERE status='REFUNDED'),0) refunded FROM refunds")).rows[0].refunded);
 res.json({ok:true,...s,refunded,net_sales:Number(s.gross_sales)-refunded});
});
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));

app.post("/api/orders/:orderId/confirm",needDb,async(req,res)=>{
  const q=await pool.query("SELECT * FROM orders WHERE order_id=$1",[req.params.orderId]);
  if(!q.rows.length) return res.status(404).json({ok:false,error:"주문 없음"});
  const o=q.rows[0];
  if(o.order_status!=="DELIVERED") return res.status(409).json({ok:false,error:"배송완료 주문만 구매확정할 수 있습니다."});
  await pool.query("UPDATE orders SET order_status='CONFIRMED',confirmed_at=NOW() WHERE order_id=$1",[req.params.orderId]);
  res.json({ok:true});
});

app.get("/api/admin/orders-export.csv",needDb,needAdmin,async(req,res)=>{
  await applyAutomaticOrderStatuses();
  const status=(req.query.status||"ALL").toUpperCase();
  const args=status==="ALL"?[]:[status];
  const where=status==="ALL"?"":"WHERE o.order_status=$1";
  const q=await pool.query(`SELECT o.order_id,o.ordered_at,o.orderer_name AS member_name,o.recipient_name,o.phone,
    o.postal_code,o.address,o.address_detail,o.item_total,o.shipping_total,o.paid_total,o.order_status,
    o.courier,o.tracking_number,o.payment_id,o.txid,
    COALESCE(string_agg(oi.product_name||' x'||oi.quantity, ', '),'') products
    FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.order_id
    ${where} GROUP BY o.id ORDER BY o.ordered_at DESC`,args);
  const heads=["주문번호","주문일시","회원","수령인","전화번호","우편번호","주소","상세주소","상품","상품금액","배송비","결제금액","상태","택배사","송장번호","결제 ID","TXID"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const rows=q.rows.map(o=>[o.order_id,o.ordered_at,o.member_name,o.recipient_name,o.phone,o.postal_code,o.address,o.address_detail,o.products,o.item_total,o.shipping_total,o.paid_total,o.order_status,o.courier,o.tracking_number,o.payment_id,o.txid].map(esc).join(","));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="blog24-orders-${status}.csv"`);
  res.send("\uFEFF"+heads.map(esc).join(",")+"\n"+rows.join("\n"));
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0",async()=>{console.log(`메이저코인 쇼핑몰 running on port ${PORT}`);console.log(`Database configured: ${!!pool}`);console.log(`Admin configured: ${!!ADMIN_KEY}`);try{await initDb();await ensureV16Schema();await applyAutomaticOrderStatuses()}catch(e){console.error("DB init failed:",e)}});
