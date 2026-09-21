let products = [];
let storeSettings={slideYoutube:"",shortsUrl:"",footerText:"회사명: Blog24\n고객센터: 02-000-8282",copyright:"Copyright © 2026 Blog24. All rights reserved.",terms:"",privacy:""};
async function loadStoreData(){
 try{const [pr,sr,cr]=await Promise.all([fetch('/api/products').then(r=>r.json()),fetch('/api/store-settings').then(r=>r.json()),fetch('/api/categories').then(r=>r.json())]);if(pr.ok)products=pr.products||[];if(sr.ok)storeSettings=sr.settings||storeSettings;if(cr.ok)renderCategoryNav(cr.categories||[]);}catch(e){console.error(e)}
 renderProducts();setupCategories();setupHero();setupShorts();renderHomeSections();setTimeout(applyFooter,0);
 const shared=Number(new URLSearchParams(location.search).get('product'));if(shared&&products.some(p=>p.id===shared))setTimeout(()=>openProductDetail(shared),250);
}

const CART_TTL_MS=6*60*60*1000;
let cart = [];
try{cart=JSON.parse(localStorage.getItem("blog24_cart")||"[]")}catch{cart=[]}
function purgeExpiredCart(){const now=Date.now();cart=cart.filter(x=>now-Number(x.addedAt||0)<CART_TTL_MS);saveCart()}
function saveCart(){try{localStorage.setItem("blog24_cart",JSON.stringify(cart))}catch{}}
function leftHms(ms){ms=Math.max(0,ms);const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),sec=t%60;return [h,m,sec].map(x=>String(x).padStart(2,"0")).join(":")}
purgeExpiredCart();
let currentUser = null;
let paymentInProgress = false;

const grid = document.getElementById("productGrid");
const cartBar = document.getElementById("cartBar");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const loginBtn = document.getElementById("loginBtn");

function toast(message){
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function renderProducts(list=products){
  grid.innerHTML = list.map(p => `<article class="card" onclick="openProductDetail(${p.id})"><a class="seo-product-link" href="/product/${p.id}" onclick="event.preventDefault()"><div class="product-img"><img src="${(p.images&&p.images[0])||'/images/sample-1.svg'}" alt="${p.name}"></div></a><div class="card-body"><h3>${p.name}</h3><div class="desc">${p.desc||''}</div><div class="ship-badge">${Number(p.shipping||0)===0?'무료배송':`배송 ${Math.round(Number(p.shipping)).toLocaleString("ko-KR")}원`}</div><div class="price-row"><span class="price">${Math.round(Number(p.price)).toLocaleString("ko-KR")}원</span><button class="add" onclick="event.stopPropagation(); addToCart(${p.id})">담기</button></div></div></article>`).join("");
}

window.addToCart = function(id){
  const p = products.find(x => x.id === id);
  const option = p.id === 1 ? "기본" : "기본";
  const found = cart.find(x => x.id === id && x.option === option);
  if (found) { found.qty += 1; if(!found.addedAt) found.addedAt=Date.now(); }
  else cart.push({...p, option, qty: 1, addedAt:Date.now()});
  saveCart(); updateCart();
  toast(`${p.name} 장바구니에 담음`);
}


function updateCart(){
  purgeExpiredCart();
  const total = cart.reduce((sum,p) => sum + (p.price * (p.qty || 1)), 0);
  cartCount.textContent = cart.reduce((n,p)=>n+(p.qty||1),0);
  cartTotal.textContent = total.toFixed(2);
  cartBar.classList.toggle("hidden", cart.length === 0);
  saveCart();
}

async function refreshMe(){
  try{const r=await fetch('/api/auth/me');const d=await r.json();currentUser=d.user||null;}catch{currentUser=null}
  loginBtn.textContent=currentUser?`${currentUser.name} · ${Number(currentUser.point_balance||0).toLocaleString()}P`:'로그인';
  document.getElementById("ordersBtn").classList.toggle("hidden",!currentUser);
}
function openLogin(){
 const m=document.createElement("div");m.className="shipping-modal";m.innerHTML=`<div class="shipping-box"><h2>회원 로그인</h2><input id="lid" placeholder="아이디"><input id="lpw" type="password" placeholder="비밀번호"><div class="shipping-actions"><button id="lclose">닫기</button><button id="ldo">로그인</button></div><button id="goJoin" class="outline" style="width:100%;margin-top:10px">회원가입</button></div>`;document.body.appendChild(m);
 m.querySelector('#lclose').onclick=()=>m.remove();m.querySelector('#goJoin').onclick=()=>{m.remove();openJoin()};m.querySelector('#ldo').onclick=async()=>{try{const d=await postJSON('/api/auth/login',{loginId:m.querySelector('#lid').value.trim(),password:m.querySelector('#lpw').value});currentUser=d.user;m.remove();await refreshMe();toast('로그인되었습니다.')}catch(e){toast(e.message)}};
}
function openJoin(){
 const m=document.createElement("div");m.className="shipping-modal";m.innerHTML=`<div class="shipping-box"><h2>회원가입</h2><input id="jid" placeholder="아이디 (영문/숫자 4자 이상)"><input id="jpw" type="password" placeholder="비밀번호 6자 이상"><input id="jname" placeholder="이름"><input id="jphone" placeholder="휴대폰번호"><input id="jemail" type="email" placeholder="이메일 (선택)"><div class="shipping-actions"><button id="jclose">닫기</button><button id="jdo">가입하기</button></div></div>`;document.body.appendChild(m);m.querySelector('#jclose').onclick=()=>m.remove();m.querySelector('#jdo').onclick=async()=>{try{const d=await postJSON('/api/auth/register',{loginId:m.querySelector('#jid').value.trim(),password:m.querySelector('#jpw').value,name:m.querySelector('#jname').value.trim(),phone:m.querySelector('#jphone').value.trim(),email:m.querySelector('#jemail').value.trim()});currentUser=d.user;m.remove();await refreshMe();toast('회원가입이 완료되었습니다.')}catch(e){toast(e.message)}};
}
async function postJSON(url, body = {}) {
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false){const e=new Error(data.error||`HTTP ${response.status}`);e.data=data;throw e}return data;
}
function openRecharge(required=0){
 const m=document.createElement('div');m.className='shipping-modal';m.innerHTML=`<div class="shipping-box"><h2>포인트 충전</h2><p>결제는 쇼핑몰 포인트로 가능합니다.</p><p>현재 <b>${Number(currentUser?.point_balance||0).toLocaleString()}P</b>${required?` · 필요 ${Math.round(required).toLocaleString()}P`:''}</p><div class="recharge-grid"><button data-a="100000">10만원<br><b>100,000P</b></button><button data-a="300000">30만원 + 3만<br><b>330,000P</b></button><button data-a="500000">50만원 + 5만<br><b>550,000P</b></button><button data-a="1000000">100만원 + 10만<br><b>1,100,000P</b></button></div><h3>충전 방법</h3><div class="shipping-actions"><button id="coinCharge">코인 충전</button><button id="bankCharge">현금이체 충전</button></div><div class="shipping-actions"><button id="rclose">닫기</button></div></div>`;document.body.appendChild(m);let amount=100000;m.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{amount=Number(b.dataset.a);m.querySelectorAll('[data-a]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')});m.querySelector('[data-a="100000"]').classList.add('selected');const req=async method=>{try{const d=await postJSON('/api/points/recharge-request',{amount,method});toast(d.message);m.remove()}catch(e){toast(e.message)}};m.querySelector('#coinCharge').onclick=async()=>{try{const c=await fetch('/api/coin-config').then(r=>r.json());if(!c.coins?.length)return toast('관리자가 아직 코인 입금주소를 등록하지 않았습니다.');const chooser=document.createElement('div');chooser.className='shipping-modal';chooser.innerHTML=`<div class="shipping-box"><h2>충전 코인 선택</h2><div class="recharge-grid">${c.coins.map(x=>`<button data-symbol="${x.symbol}">${x.name||x.symbol}<br><b>${x.symbol}</b><small>${x.network||''}</small></button>`).join('')}</div><div class="shipping-actions"><button id="ccancel">취소</button></div></div>`;document.body.appendChild(chooser);chooser.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=async()=>{try{const d=await postJSON('/api/points/recharge-request',{amount,method:'COIN',coinSymbol:b.dataset.symbol});chooser.remove();m.remove();const x=d.coin;const info=document.createElement('div');info.className='shipping-modal';info.innerHTML=`<div class="shipping-box"><h2>${x.symbol} 충전요청</h2><p>충전금액 <b>${Number(d.amount).toLocaleString()}원</b>${d.bonus?` + 보너스 ${Number(d.bonus).toLocaleString()}P`:''}</p><p>네트워크 <b>${x.network||'-'}</b></p><p>입금주소</p><div style="word-break:break-all;padding:12px;background:#f6f7f9;border-radius:8px"><b>${x.address}</b></div>${x.memo?`<p>MEMO/TAG <b>${x.memo}</b></p>`:''}<p>입금 수량과 원화 환산은 거래소 시세 API 연결 버전에서 자동 표시됩니다.</p><div class="shipping-actions"><button id="iclose">확인</button></div></div>`;document.body.appendChild(info);info.querySelector('#iclose').onclick=()=>info.remove()}catch(e){toast(e.message)}});chooser.querySelector('#ccancel').onclick=()=>chooser.remove()}catch(e){toast(e.message)}};m.querySelector('#bankCharge').onclick=()=>req('BANK');m.querySelector('#rclose').onclick=()=>m.remove();
}

function openCartReview(){
 return new Promise(resolve=>{
  const m=document.createElement("div");m.className="shipping-modal";
  const rows=cart.map((p,i)=>`<div class="cart-review-row">
    <div><b>${p.name}</b><small>옵션: ${p.option||"기본"}</small><small class="cart-expire" data-exp="${Number(p.addedAt||Date.now())+CART_TTL_MS}">⏱ ${leftHms(Number(p.addedAt||Date.now())+CART_TTL_MS-Date.now())} 후 자동 삭제</small></div>
    <div class="qtyctl"><button data-i="${i}" data-d="-1">−</button><b>${p.qty||1}</b><button data-i="${i}" data-d="1">＋</button></div>
    <div>${Math.round(p.price*(p.qty||1)).toLocaleString("ko-KR")}원</div>
    <button class="delitem" data-del="${i}">삭제</button>
  </div>`).join("");
  const total=cart.reduce((a,p)=>a+p.price*(p.qty||1),0);
  m.innerHTML=`<div class="shipping-box cart-review"><h2>장바구니</h2>${rows}
   <div class="cart-review-total">상품 합계 <b>${Math.round(total).toLocaleString("ko-KR")}원</b></div>
   <div class="shipping-actions"><button id="ccancel">계속 쇼핑</button><button id="corder">주문하기</button></div></div>`;
  document.body.appendChild(m);
  const tick=setInterval(()=>{m.querySelectorAll(".cart-expire").forEach(el=>el.textContent=`⏱ ${leftHms(Number(el.dataset.exp)-Date.now())} 후 자동 삭제`);if(cart.some(x=>Date.now()-Number(x.addedAt||0)>=CART_TTL_MS)){clearInterval(tick);purgeExpiredCart();m.remove();updateCart();if(cart.length)openCartReview().then(resolve);else resolve(false)}},1000);
  m.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{clearInterval(tick);const i=+b.dataset.i,d=+b.dataset.d;cart[i].qty=Math.max(1,(cart[i].qty||1)+d);saveCart();m.remove();updateCart();openCartReview().then(resolve)});
  m.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{clearInterval(tick);cart.splice(+b.dataset.del,1);saveCart();m.remove();updateCart();if(cart.length)openCartReview().then(resolve);else resolve(false)});
  m.querySelector("#ccancel").onclick=()=>{clearInterval(tick);m.remove();resolve(false)};
  m.querySelector("#corder").onclick=()=>{clearInterval(tick);m.remove();resolve(true)};
 });
}

function askShippingInfo(){
 return new Promise(resolve=>{
  const savedRecipient=JSON.parse(localStorage.getItem("blog24_recipient")||"null");
  const savedOrderer=JSON.parse(localStorage.getItem("blog24_orderer")||"null");
  const recipient=savedRecipient||{recipientName:"홍길동",phone:"010-0000-8282",postalCode:"08282",address:"서울시 관악구 주문로 8282",addressDetail:"8282호",deliveryMemo:"테스트 주문입니다"};
  const orderer=savedOrderer||{ordererName:"홍길동",ordererPhone:"010-0000-8282"};
  const m=document.createElement("div");m.className="shipping-modal";
  m.innerHTML=`<div class="shipping-box"><h2>주문자 · 배송정보</h2>
  <h3 class="form-subtitle">주문자 정보</h3>
  <input id="on" value="${orderer.ordererName||""}" placeholder="주문자 이름"><input id="op" value="${orderer.ordererPhone||""}" placeholder="주문자 휴대폰 번호">
  <label class="remember-row"><input type="checkbox" id="rememberOrderer" ${savedOrderer?"checked":""}> 주문자 정보 기억하기</label>
  <h3 class="form-subtitle">받는 사람 정보</h3>
  <input id="sn" value="${recipient.recipientName||""}" placeholder="받는 분 이름"><input id="sp" value="${recipient.phone||""}" placeholder="휴대폰 번호">
  <input id="sz" value="${recipient.postalCode||""}" placeholder="우편번호"><input id="sa" value="${recipient.address||""}" placeholder="배송 주소">
  <input id="sd" value="${recipient.addressDetail||""}" placeholder="상세 주소"><input id="sm" value="${recipient.deliveryMemo||""}" placeholder="배송 메모 (선택)">
  <label class="remember-row"><input type="checkbox" id="rememberRecipient" ${savedRecipient?"checked":""}> 받는 사람 정보 기억하기</label>
  <div class="shipping-actions"><button id="sc">취소</button><button id="so">주문 확인 및 포인트 결제</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector("#sc").onclick=()=>{m.remove();resolve(null)};
  m.querySelector("#so").onclick=()=>{
    const ordererInfo={ordererName:m.querySelector("#on").value.trim(),ordererPhone:m.querySelector("#op").value.trim()};
    const v={recipientName:m.querySelector("#sn").value.trim(),phone:m.querySelector("#sp").value.trim(),postalCode:m.querySelector("#sz").value.trim(),address:m.querySelector("#sa").value.trim(),addressDetail:m.querySelector("#sd").value.trim(),deliveryMemo:m.querySelector("#sm").value.trim(),...ordererInfo};
    if(!ordererInfo.ordererName||!ordererInfo.ordererPhone||!v.recipientName||!v.phone||!v.address){toast("주문자/받는 분 이름, 휴대폰, 주소는 필수입니다.");return}
    if(m.querySelector("#rememberOrderer").checked)localStorage.setItem("blog24_orderer",JSON.stringify(ordererInfo));else localStorage.removeItem("blog24_orderer");
    const recipientInfo={recipientName:v.recipientName,phone:v.phone,postalCode:v.postalCode,address:v.address,addressDetail:v.addressDetail,deliveryMemo:v.deliveryMemo};
    if(m.querySelector("#rememberRecipient").checked)localStorage.setItem("blog24_recipient",JSON.stringify(recipientInfo));else localStorage.removeItem("blog24_recipient");
    m.remove();resolve(v);
  };
 });
}

function confirmOrderBeforePay(shipping){
 return new Promise(resolve=>{const m=document.createElement("div");m.className="shipping-modal";const total=cart.reduce((a,p)=>a+Number(p.price)*(p.qty||1),0);const rows=cart.map(p=>`<div class="confirm-item"><div><b>${p.name}</b><small>옵션: ${p.option||"기본"} · 수량 ${p.qty||1}</small></div><b>${(Number(p.price)*(p.qty||1)).toFixed(2)}원</b></div>`).join("");m.innerHTML=`<div class="shipping-box final-confirm"><h2>최종 주문 확인</h2><div class="confirm-section"><h3>주문상품</h3>${rows}</div><div class="confirm-section"><h3>주문자</h3><p>${shipping.ordererName} · ${shipping.ordererPhone}</p></div><div class="confirm-section"><h3>배송정보</h3><p>${shipping.recipientName} · ${shipping.phone}</p><p>${shipping.postalCode||""} ${shipping.address} ${shipping.addressDetail||""}</p><p>${shipping.deliveryMemo||""}</p></div><div class="confirm-total"><span>결제 예정금액</span><b>${Math.round(total).toLocaleString("ko-KR")}원</b></div><div class="shipping-actions"><button id="confirmBack">이전</button><button id="confirmPi">포인트 결제 진행</button></div></div>`;document.body.appendChild(m);m.querySelector("#confirmBack").onclick=()=>{m.remove();resolve(false)};m.querySelector("#confirmPi").onclick=()=>{m.remove();resolve(true)};});
}

async function checkout(skipCartReview=false){
 if(!cart.length||paymentInProgress)return;if(!currentUser){toast('먼저 로그인해주세요.');openLogin();return;}
 if(!skipCartReview){const proceed=await openCartReview();if(!proceed||!cart.length)return;}const shipping=await askShippingInfo();if(!shipping)return;const confirmed=await confirmOrderBeforePay(shipping);if(!confirmed)return;
 const orderId=`MAJOR-${Date.now()}`,expandedItems=cart.map(p=>({id:p.id,option:p.option||'기본',qty:p.qty||1}));paymentInProgress=true;const btn=document.getElementById('checkoutBtn');btn.disabled=true;btn.textContent='결제 준비중';
 try{const draft=await postJSON('/api/orders/draft',{orderId,shipping,items:expandedItems});try{const paid=await postJSON(`/api/orders/${encodeURIComponent(orderId)}/pay-points`);currentUser.point_balance=paid.balance;cart=[];saveCart();updateCart();await refreshMe();toast('포인트 결제가 완료되었습니다.');}catch(e){if(e.data?.code==='INSUFFICIENT_POINTS'){toast('포인트가 부족합니다. 충전 후 결제해주세요.');openRecharge(draft.amount);}else throw e}}catch(e){toast(e.message)}finally{paymentInProgress=false;btn.disabled=false;btn.textContent='포인트로 결제';}
}



function statusKo(s){return ({PENDING:"결제대기",PAID:"결제완료",PREPARING:"상품준비중",SHIPPED:"배송중",DELIVERED:"배송완료",CONFIRMED:"구매확정"})[s]||s||"-"}
function fmtDate(v){try{return new Date(v).toLocaleString("ko-KR")}catch{return v||"-"}}
async function openMyOrders(){
 if(!currentUser){toast("먼저 로그인해주세요.");return}
 const m=document.createElement("div");m.className="shipping-modal";
 m.innerHTML=`<div class="shipping-box"><h2>내 주문내역</h2><div id="myOrders" class="orders-list"><div>불러오는 중...</div></div><div class="shipping-actions"><button id="ordersClose">닫기</button></div></div>`;
 document.body.appendChild(m);m.querySelector("#ordersClose").onclick=()=>m.remove();
 try{
  const r=await fetch(`/api/orders/mine`);const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
  const box=m.querySelector("#myOrders");
  if(!d.orders.length){box.innerHTML="<div>아직 주문내역이 없습니다.</div>";return}
  box.innerHTML=d.orders.map(o=>{const pending=o.order_status==="PENDING";const exp=new Date(o.pending_expires_at||new Date(new Date(o.ordered_at).getTime()+CART_TTL_MS)).getTime();const track=o.tracking_number?`<div class="order-meta">${o.courier||"택배"} · <button class="tracking-link" data-courier="${o.courier||""}" data-track="${o.tracking_number}">송장 ${o.tracking_number} 조회</button></div>`:"";const actions=`<div class="order-actions">${pending?`<button class="retry-pay" data-order="${o.order_id}">다시 결제하기</button><button class="delete-pending" data-order="${o.order_id}">주문 삭제</button>`:""}${o.order_status==="DELIVERED"?`<button class="confirm-buy" data-order="${o.order_id}">구매확정</button>`:""}</div>`;return `<div class="order-card"><div class="order-card-head"><b>${o.order_id}</b><span class="order-status">${statusKo(o.order_status)}</span></div><small>${fmtDate(o.ordered_at)} · ${Math.round(Number(o.paid_total)).toLocaleString("ko-KR")}원</small>${pending?`<div class="pending-timer" data-exp="${exp}">⏱ ${leftHms(exp-Date.now())} 후 자동 삭제됩니다</div>`:""}<div class="order-items">${(o.items||[]).map(i=>`${i.productName} × ${i.quantity} · ${Math.round(Number(i.unitPrice)*Number(i.quantity)).toLocaleString("ko-KR")}원`).join("<br>")}</div>${track}<div class="order-meta">Payment ID: ${o.payment_id||"-"}<br>TXID: ${o.txid||"-"}</div>${actions}</div>`}).join("");
  const ot=setInterval(()=>box.querySelectorAll(".pending-timer").forEach(el=>{const left=Number(el.dataset.exp)-Date.now();el.textContent=`⏱ ${leftHms(left)} 후 자동 삭제됩니다`;if(left<=0){clearInterval(ot);m.remove();openMyOrders()}}),1000);
  box.querySelectorAll(".retry-pay").forEach(b=>b.onclick=()=>retryOrderPayment(b.dataset.order));
  box.querySelectorAll(".delete-pending").forEach(b=>b.onclick=async()=>{if(!confirm("결제대기 주문을 삭제하시겠습니까?"))return;try{const r=await fetch(`/api/orders/${encodeURIComponent(b.dataset.order)}/pending`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"삭제 실패");m.remove();toast("결제대기 주문을 삭제했습니다.");openMyOrders()}catch(e){toast(e.message)}});
  box.querySelectorAll(".confirm-buy").forEach(b=>b.onclick=async()=>{await postJSON(`/api/orders/${encodeURIComponent(b.dataset.order)}/confirm`,{});m.remove();openMyOrders()});
  box.querySelectorAll(".tracking-link").forEach(b=>b.onclick=()=>openTracking(b.dataset.courier,b.dataset.track));
 }catch(e){m.querySelector("#myOrders").innerHTML=`<div>주문내역을 불러오지 못했습니다.<br>${e.message}</div>`}
}

function trackingUrl(courier,no){const c=(courier||"").toLowerCase();const n=encodeURIComponent(no);if(c.includes("cj")||c.includes("대한통운"))return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`;if(c.includes("한진"))return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mession-val=${n}`;if(c.includes("롯데"))return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`;if(c.includes("우체국"))return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`;return `https://search.naver.com/search.naver?query=${encodeURIComponent((courier||"택배")+" "+no)}`}
function openTracking(courier,no){window.open(trackingUrl(courier,no),"_blank","noopener")}
async function retryOrderPayment(orderId){if(!currentUser)return openLogin();try{const r=await fetch(`/api/orders/${encodeURIComponent(orderId)}`);const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'주문 조회 실패');const paid=await postJSON(`/api/orders/${encodeURIComponent(orderId)}/pay-points`);currentUser.point_balance=paid.balance;await refreshMe();toast('포인트 결제가 완료되었습니다.');openMyOrders()}catch(e){if(e.data?.code==='INSUFFICIENT_POINTS')openRecharge(e.data.required);else toast(e.message)}}


document.getElementById("shopBtn").addEventListener("click", () => {
  document.getElementById("products").scrollIntoView({ behavior: "smooth" });
});
loginBtn.addEventListener("click", ()=>currentUser?openRecharge():openLogin());
document.getElementById("ordersBtn").addEventListener("click", openMyOrders);
document.getElementById("checkoutBtn").addEventListener("click", checkout);

refreshMe();
loadStoreData();


function youtubeVideoId(url){if(!url)return "";try{const u=new URL(url);if(u.hostname.includes("youtu.be"))return u.pathname.replace("/","").split("?")[0];if(u.pathname.includes("/shorts/"))return u.pathname.split("/shorts/")[1].split("/")[0];return u.searchParams.get("v")||""}catch{return ""}}
function youtubeEmbedUrl(url){
 if(!url)return "";
 try{
  if(url.includes("youtube.com/embed/")) return url;
  const u=new URL(url);
  let id="";
  if(u.hostname.includes("youtu.be")) id=u.pathname.replace("/","");
  else if(u.pathname.includes("/shorts/")) id=u.pathname.split("/shorts/")[1].split("/")[0];
  else id=u.searchParams.get("v")||"";
  return id?`https://www.youtube.com/embed/${id}`:"";
 }catch(e){return ""}
}
function openProductDetail(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 const images=(p.images||[]).filter(Boolean).slice(0,3);
 const yt=youtubeEmbedUrl(p.youtube||"");
 // V1.6.10: 대표이미지(images[0])는 영상 유무와 관계없이 항상 첫 슬롯에 보존한다.
 const thumbImages=yt ? images.slice(0,2) : images.slice(0,3);
 const m=document.createElement("div");m.className="shipping-modal product-modal";
 const first=thumbImages[0]||images[0]||"";
 m.innerHTML=`<div class="shipping-box product-detail">
 <div class="detail-actions detail-actions-top"><button id="detailShare">상품 공유하기</button><button id="detailAdd">장바구니 담기</button><button class="detail-close" aria-label="상품 상세 닫기">✕</button></div>
 <div class="detail-scroll">
 <div class="detail-media">
   ${first?`<img class="detail-main" src="${first}" alt="${p.name}">`:`<div class="detail-icon">${p.icon||"🛍️"}</div>`}
   <iframe class="detail-video-main hidden" title="${p.name} 상품 영상" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
 </div>
 <div class="detail-thumbs">
   ${thumbImages.map((x,i)=>`<button class="media-thumb image-thumb" data-src="${x}" aria-label="상품 이미지 ${i+1}"><img src="${x}" alt="상품 이미지 ${i+1}"></button>`).join("")}
   ${yt?`<button class="media-thumb youtube-thumb" data-youtube="${yt}" aria-label="상품 영상"><img src="https://img.youtube.com/vi/${youtubeVideoId(p.youtube||"")}/hqdefault.jpg" alt="상품 영상 미리보기"><span>▶</span></button>`:""}
 </div>
 <h2>${p.name}</h2><p>${p.detail||p.desc||""}</p><b class="detail-price">${Math.round(Number(p.price)).toLocaleString("ko-KR")}원</b>
 <label>옵션<select id="detailOption">${(p.options||["기본"]).map(x=>`<option value="${x}">${x}</option>`).join("")}</select></label>
 <label>수량<div class="detail-qty"><button id="dqMinus">−</button><b id="dqValue">1</b><button id="dqPlus">＋</button></div></label>
 ${(p.detailImages||[]).length?`<div class="detail-description-images">${p.detailImages.map(x=>`<img src="${x}" alt="${p.name} 상세설명">`).join("")}</div>`:`<div class="detail-description-placeholder" aria-hidden="true"></div>`}
 </div>
 </div>`;
 document.body.appendChild(m);let qty=1;
 const main=m.querySelector(".detail-main"),video=m.querySelector(".detail-video-main");
 m.querySelector(".detail-close").onclick=()=>m.remove();
 m.querySelectorAll(".image-thumb").forEach(b=>b.onclick=()=>{if(main){main.src=b.dataset.src;main.classList.remove("hidden")}video.classList.add("hidden");video.src="";});
 const yb=m.querySelector(".youtube-thumb");if(yb)yb.onclick=()=>{if(main)main.classList.add("hidden");video.src=yb.dataset.youtube;video.classList.remove("hidden");};
 m.querySelector("#dqMinus").onclick=()=>{qty=Math.max(1,qty-1);m.querySelector("#dqValue").textContent=qty};
 m.querySelector("#dqPlus").onclick=()=>{qty=Math.min(99,qty+1);m.querySelector("#dqValue").textContent=qty};
 m.querySelector("#detailShare").onclick=async()=>{const u=new URL(`/product/${p.id}`,location.origin);const d={title:p.name,text:`${p.name} · ${Math.round(Number(p.price)).toLocaleString("ko-KR")}원`,url:u.toString()};try{if(navigator.share)await navigator.share(d);else{await navigator.clipboard.writeText(d.url);toast("상품 링크를 복사했습니다.");}}catch(e){}};
 m.querySelector("#detailAdd").onclick=()=>{const opt=m.querySelector("#detailOption").value,f=cart.find(x=>x.id===p.id&&(x.option||"기본")===opt);if(f){f.qty=(f.qty||1)+qty;if(!f.addedAt)f.addedAt=Date.now();}else cart.push({...p,option:opt,qty,addedAt:Date.now()});saveCart();updateCart();m.remove();toast(`${p.name} 장바구니에 담음`);};
}
window.openProductDetail=openProductDetail;

function updateTopCart(){const e=document.getElementById("topCartCount");if(e)e.textContent=cart.reduce((a,p)=>a+(p.qty||1),0);}
const _oldUpdateCart=updateCart; updateCart=function(){_oldUpdateCart();updateTopCart();};
const topCartBtn=document.getElementById("topCartBtn");
if(topCartBtn)topCartBtn.addEventListener("click",async()=>{
 if(!cart.length){toast("장바구니가 비어 있습니다.");return;}
 const proceed=await openCartReview();
 if(proceed && cart.length) checkout(true);
});
updateTopCart();


// V1.6.5 Chrome visible viewport correction
(function(){
 const ua=navigator.userAgent||"";
 const isKakao=/KAKAOTALK/i.test(ua), isChrome=/Chrome|CriOS/i.test(ua);
 if(isChrome && !isKakao) document.documentElement.classList.add("external-chrome");
 function syncVisibleViewport(){
   const vv=window.visualViewport, h=vv?vv.height:window.innerHeight;
   document.documentElement.style.setProperty("--visible-vh",`${h}px`);
 }
 syncVisibleViewport(); window.addEventListener("resize",syncVisibleViewport,{passive:true});
 if(window.visualViewport){visualViewport.addEventListener("resize",syncVisibleViewport,{passive:true});visualViewport.addEventListener("scroll",syncVisibleViewport,{passive:true});}
})();

// V1.6.7 store UI / category / banner / Shorts
function renderCategoryNav(cats){const nav=document.querySelector('.store-nav');if(nav)nav.innerHTML='<button class="active" data-cat="전체">홈</button>'+cats.map(c=>`<button data-cat="${c}">${c}</button>`).join('');}
function setupCategories(){document.querySelectorAll('.store-nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.store-nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const c=b.dataset.cat||'전체';renderProducts(c==='전체'?products:products.filter(p=>p.category===c));});}
function setupHero(){
 const track=document.querySelector('.hero-track');if(!track)return;let cfg=[];try{cfg=JSON.parse(storeSettings.slidesJson||'[]')}catch{};cfg=(cfg||[]).filter(x=>x.url).sort((a,b)=>(a.order||0)-(b.order||0));if(cfg.length){track.innerHTML=cfg.map(x=>{const y=youtubeEmbedUrl(x.url);if(y)return `<div class=\"hero-slide hero-video-slide dynamic-video\" data-y=\"${y}\"></div>`;return `<div class=\"hero-slide\"><img src=\"${x.url}\" alt=\"슬라이드 배너\"></div>`}).join('')}let slides=[...track.querySelectorAll('.hero-slide')],i=0,timer=null,videoPlaying=false;
 track.querySelectorAll('.dynamic-video').forEach((d,k)=>{const id='heroDyn'+k,y=d.dataset.y;d.innerHTML=`<iframe id=\"${id}\" src=\"${y}${y.includes('?')?'&':'?'}enablejsapi=1\" title=\"메인 영상\" allow=\"autoplay; encrypted-media; picture-in-picture\" allowfullscreen></iframe>`});
 const yt=youtubeEmbedUrl(storeSettings.slideYoutube||'');
 if(yt){const d=document.createElement('div');d.className='hero-slide hero-video-slide';const id='heroYT';d.innerHTML=`<iframe id="${id}" src="${yt}${yt.includes('?')?'&':'?'}enablejsapi=1" title="메인 영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;track.appendChild(d);slides=[...track.querySelectorAll('.hero-slide')];setTimeout(()=>document.getElementById(id)?.contentWindow?.postMessage(JSON.stringify({event:'listening',id}),'*'),800)}
 const go=n=>{i=(n+slides.length)%slides.length;track.style.transform=`translateX(-${i*100}%)`};
 const stop=()=>{if(timer){clearInterval(timer);timer=null}};
 const start=()=>{stop();if(videoPlaying||slides.length<2)return;timer=setInterval(()=>go(i+1),Math.max(2,Number(storeSettings.slideTime)||5)*1000)};
 let sx=0,sy=0;track.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;stop()},{passive:true});track.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){go(i+(dx<0?1:-1));videoPlaying=false;start()}else if(!videoPlaying)start()},{passive:true});
 window.addEventListener('message',e=>{try{const m=typeof e.data==='string'?JSON.parse(e.data):e.data;if(m?.event==='onStateChange'){if(m.info===1||m.info===2){videoPlaying=true;stop()}if(m.info===0){videoPlaying=false;start()}}}catch{}});start();
}
function renderHomeSections(){let cfg=[];try{cfg=JSON.parse(storeSettings.homeSectionsJson||'[]')}catch{};document.querySelectorAll('.managed-home-section').forEach(x=>x.remove());const base=document.getElementById('products');if(!base)return;(cfg||[]).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(x=>{const sec=document.createElement('section');sec.className='section managed-home-section';if(x.type==='banner'){sec.innerHTML=`<img class="managed-banner" src="${x.title||''}" alt="메인 배너">`}else{const list=products.filter(p=>!x.category||p.category===x.category);sec.innerHTML=`<div class="section-title"><h2>${x.title||x.category||'상품'}</h2></div><div class="grid">${list.map(p=>`<article class="card" onclick="openProductDetail(${p.id})"><a class="seo-product-link" href="/product/${p.id}" onclick="event.preventDefault()"><div class="product-img"><img src="${(p.images&&p.images[0])||'/images/sample-1.svg'}"></div></a><div class="card-body"><h3>${p.name}</h3><div class="price-row"><span class="price">${Math.round(Number(p.price)).toLocaleString("ko-KR")}원</span></div></div></article>`).join('')}</div>`}base.insertAdjacentElement('afterend',sec)})}
function setupShorts(){const b=document.getElementById('quickShorts');if(!b)return;const u=storeSettings.shortsUrl||'';b.classList.toggle('hidden',!u);if(!u)return;let id='';try{const x=new URL(u);if(x.pathname.includes('/shorts/'))id=x.pathname.split('/shorts/')[1].split('/')[0];else id=x.searchParams.get('v')||''}catch{}if(id)b.innerHTML=`<img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" alt="Shorts"><span>▶</span>`;b.onclick=()=>{const y=youtubeEmbedUrl(u);if(!y)return;const m=document.createElement('div');m.className='shorts-modal';m.innerHTML=`<div class="shorts-player"><button>✕</button><iframe src="${y}" allowfullscreen></iframe></div>`;document.body.appendChild(m);m.querySelector('button').onclick=()=>m.remove();};}

// V1.6.9 install / footer / policy / lively Shorts
let deferredInstallPrompt=null;const installBtn=document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
if(installBtn)installBtn.onclick=async()=>{
 if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return;}
 const ua=navigator.userAgent||'';
 if(/KAKAOTALK/i.test(ua)) alert('카카오톡 브라우저에서는 오른쪽 위 메뉴에서 다른 브라우저로 열기 후, 브라우저 메뉴의 홈 화면에 추가를 선택해주세요.');
 else if(/SamsungBrowser/i.test(ua)) alert('삼성 인터넷 메뉴(≡)에서 현재 페이지 추가 → 홈 화면을 선택해주세요.');
 else if(/Chrome/i.test(ua)) alert('Chrome 메뉴(⋮)에서 홈 화면에 추가 또는 앱 설치를 선택해주세요.');
 else alert('브라우저 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택해주세요.');
};
function policyModal(title,text){const m=document.createElement('div');m.className='shipping-modal';m.innerHTML=`<div class="shipping-box policy-box"><h2>${title}</h2><div class="policy-text"></div><div class="shipping-actions"><button>닫기</button></div></div>`;m.querySelector('.policy-text').textContent=text||'내용을 준비 중입니다.';document.body.appendChild(m);m.querySelector('button').onclick=()=>m.remove()}
function applyFooter(){const f=document.getElementById('footerCopy'),c=document.getElementById('footerCopyright');if(f)f.textContent=storeSettings.footerText||'';if(c)c.textContent=storeSettings.copyright||'';document.getElementById('termsBtn')?.addEventListener('click',()=>policyModal('이용약관',storeSettings.terms));document.getElementById('privacyBtn')?.addEventListener('click',()=>policyModal('개인정보처리방침',storeSettings.privacy));}
setTimeout(applyFooter,700);
window.addEventListener('scroll',()=>{const q=document.getElementById('quickShorts');if(!q||q.classList.contains('hidden'))return;const y=Math.max(-36,Math.min(36,(window.scrollY%500-250)*.10));q.style.transform=`translateY(${y}px)`},{passive:true});
