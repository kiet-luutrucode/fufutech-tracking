/*!
 * FUFUTECH OCU v6.1 — NASANI SELECTOR FIX
 * Released: 2026-05-19
 * Loaded via jsDelivr CDN from GitHub
 */
(function(){
  'use strict';

  // ========== CONFIG ==========
  var CFG = {
    ENDPOINT: 'https://script.google.com/macros/s/AKfycbxksRhf_kVaXXglwG4mka6qjlYOcW1cA6EYA7lm1uKnL6-Y22H3Q4B4pgQOlXLK4NGq/exec',
    VERSION: 'v6.1',
    CLIENT_ID_KEY: 'ff_client_id',
    CLIENT_ID_META: 'ff_client_id_meta',
    CONV_HIST_KEY: 'ff_conv_history_v61',
    PURCHASE_HIST_KEY: 'ff_purchase_history_v61',
    QUEUE_KEY: 'ff_queue_v61',
    MKT_SEEN_KEY: 'ff_mkt_seen',
    SESSION_FLAGS_KEY: 'ff_session_flags_v61',
    DEDUP_MS: 30 * 86400000,
    PURCHASE_DEDUP_MS: 90 * 86400000,
    QUEUE_TTL_MS: 24 * 3600000,
    CLIENT_ID_TTL_MS: 365 * 86400000
  };

  if (window.__ocu_v61_active) { return; } // chống load 2 lần v6.1

  // ========== PHONE SELECTOR (v6.1 — fix Nasani name="dienthoai") ==========
  // Thứ tự ưu tiên: dienthoai (Nasani) → các biến thể dien-thoai → phone/tel → sdt/mobile → placeholder VN
  var PHONE_SELECTOR =
    'input[name="dienthoai"], #dienthoai, ' +
    'input[name*="dien-thoai" i], input[name*="dienthoai" i], ' +
    'input[name*="phone" i], input[type="tel"], ' +
    'input[name*="sdt" i], input[name*="mobile" i], ' +
    'input[placeholder*="điện thoại" i], input[placeholder*="dien thoai" i]';

  // ========== HELPERS — STORAGE / JSON ==========
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
  function ssGet(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
  function ssSet(k,v){ try{ sessionStorage.setItem(k,v); return true; }catch(e){ return false; } }
  function jp(s, fb){ try{ var r=JSON.parse(s); return r==null?fb:r; }catch(e){ return fb; } }

  // ========== URL PARSER ==========
  // Nasani URL kiểu /hoan-tat.html&mdh=... → URLSearchParams fail. Phải regex location.href.
  function getURLParam(name){
    var re = new RegExp('[?&]' + name.replace(/[^a-z0-9_]/gi,'') + '=([^&#]*)', 'i');
    var m = (location.href || '').match(re);
    if (m && m[1]){
      try { return decodeURIComponent(m[1].replace(/\+/g,' ')); } catch(e){ return m[1]; }
    }
    return '';
  }

  // ========== PHONE NORMALIZE (VN) ==========
  function normalizePhoneVN(raw){
    if (!raw) return '';
    var s = String(raw).replace(/[^\d]/g,'');
    if (!s) return '';
    if (s.length === 11 && s.indexOf('84') === 0) s = '0' + s.substring(2);
    else if (s.length === 12 && s.indexOf('084') === 0) s = '0' + s.substring(3);
    else if (s.length === 9 && s.charAt(0) !== '0') s = '0' + s;
    if (s.length === 10 && s.charAt(0) === '0') return s;
    return '';
  }
  function maskPhone(p){
    if (!p || p.length < 6) return p || '';
    return p.substring(0,4) + '****' + p.substring(p.length - 2);
  }

  // ========== CLIENT ID ==========
  function genId(){
    var rand = '';
    for (var i=0; i<12; i++){ rand += Math.floor(Math.random()*36).toString(36); }
    return 'FFcli_' + rand;
  }
  function getClientId(){
    try {
      var id = lsGet(CFG.CLIENT_ID_KEY);
      var meta = jp(lsGet(CFG.CLIENT_ID_META), null);
      var now = Date.now();
      if (id && meta && meta.created && (now - meta.created) < CFG.CLIENT_ID_TTL_MS){
        meta.last_seen = now;
        lsSet(CFG.CLIENT_ID_META, JSON.stringify(meta));
        return id;
      }
      var nid = genId();
      lsSet(CFG.CLIENT_ID_KEY, nid);
      lsSet(CFG.CLIENT_ID_META, JSON.stringify({created: now, last_seen: now}));
      return nid;
    } catch(e){ return 'FFcli_anon'; }
  }

  // ========== MARKETING PARAMS ==========
  var MKT_KEYS = ['gclid','ttclid','fbclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  function storeMarketing(){
    var touched = false;
    for (var i=0; i<MKT_KEYS.length; i++){
      var v = getURLParam(MKT_KEYS[i]);
      if (v){ lsSet('ff_' + MKT_KEYS[i], v); touched = true; }
    }
    if (touched) lsSet(CFG.MKT_SEEN_KEY, '1');
  }
  function getMkt(name){ return getURLParam(name) || lsGet('ff_' + name) || ''; }

  // ========== DEDUP (per client_id + type, 30 ngày) ==========
  function getHist(key){ return jp(lsGet(key), {}) || {}; }
  function saveHist(key, h){ lsSet(key, JSON.stringify(h)); }

  function isNewConv(type, clientId){
    if (type === 'purchase') return true;
    var h = getHist(CFG.CONV_HIST_KEY);
    var k = (clientId || 'anon') + '__' + type;
    var last = h[k] || 0;
    var now = Date.now();
    if (now - last < CFG.DEDUP_MS) return false;
    h[k] = now;
    for (var kk in h){ if (h.hasOwnProperty(kk) && (now - h[kk]) > CFG.DEDUP_MS) delete h[kk]; }
    saveHist(CFG.CONV_HIST_KEY, h);
    return true;
  }

  function purchaseSeen(mdh){
    if (!mdh) return false;
    var h = getHist(CFG.PURCHASE_HIST_KEY);
    var now = Date.now();
    for (var k in h){ if (h.hasOwnProperty(k) && (now - h[k]) > CFG.PURCHASE_DEDUP_MS) delete h[k]; }
    var key = 'purchase_' + mdh;
    if (h[key]){ saveHist(CFG.PURCHASE_HIST_KEY, h); return true; }
    h[key] = now;
    saveHist(CFG.PURCHASE_HIST_KEY, h);
    return false;
  }

  // ========== DOM READ HELPERS ==========
  function readDOM(selectors){
    for (var i=0; i<selectors.length; i++){
      try {
        var el = document.querySelector(selectors[i]);
        if (el){
          var t = (el.value || el.getAttribute('data-phone') || el.textContent || '').toString().replace(/\s+/g,' ').trim();
          if (t) return t;
        }
      } catch(e){}
    }
    return '';
  }
  function parsePriceVN(s){
    if (!s) return 0;
    var n = String(s).replace(/[^\d]/g,'');
    return n ? parseInt(n, 10) : 0;
  }

  // ========== v6.1 TEXT-PATTERN MATCHING (cho /hoan-tat Nasani render plain text) ==========
  // Nasani /hoan-tat hiển thị: "Số điện thoại: 0909042831", "Email: x@y.z", "Tổng giá: 2.889.000 vnđ"
  // KHÔNG có class/id → phải scan body.innerText.
  function readTextPattern(label, regex){
    try {
      var text = (document.body && (document.body.innerText || document.body.textContent)) || '';
      if (!text) return '';
      var labelIdx = text.indexOf(label);
      if (labelIdx < 0) return '';
      var after = text.substring(labelIdx, labelIdx + 200);
      var m = after.match(regex);
      return m ? (m[1] || m[0] || '') : '';
    } catch(e){ return ''; }
  }

  function readHoanTatPhone(){
    var p = readTextPattern('Số điện thoại', /(\d{9,11})/);
    if (!p) p = readTextPattern('Điện thoại', /(\d{9,11})/);
    if (!p) p = readTextPattern('điện thoại', /(\d{9,11})/);
    if (!p) p = readTextPattern('SĐT', /(\d{9,11})/);
    if (!p) p = readTextPattern('Phone', /(\d{9,11})/);
    return p;
  }
  function readHoanTatEmail(){
    var e = readTextPattern('Email', /([\w.\-+]+@[\w.\-]+\.[a-z]{2,})/i);
    if (!e) e = readTextPattern('E-mail', /([\w.\-+]+@[\w.\-]+\.[a-z]{2,})/i);
    return e;
  }
  function readHoanTatTotal(){
    // "Tổng giá: 2.889.000 vnđ" / "Tổng tiền: 2,889,000đ" / "Thành tiền: 2889000 VND"
    var t = readTextPattern('Tổng giá', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    if (!t) t = readTextPattern('Tổng tiền', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    if (!t) t = readTextPattern('Thành tiền', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    if (!t) t = readTextPattern('Tổng cộng', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    return t;
  }

  function readCartTotal(){
    // 1) DOM selector trước
    var t = readDOM(['.total-price','.tong-gia','.tong-tien','.order-total','[data-total]','.cart-total','.gia-tong','.checkout-total']);
    if (t){
      var n = parsePriceVN(t);
      if (n > 0) return n;
    }
    // 2) Hidden input có thể chứa tổng tiền raw (Nasani có thể có <input name="tongtien" value="2889000">)
    try {
      var h = document.querySelector('input[name*="tongtien" i], input[name*="tong-tien" i], input[name*="total" i]');
      if (h && h.value){
        var nn = parsePriceVN(h.value);
        if (nn > 0) return nn;
      }
    } catch(_){}
    // 3) Backup: body text pattern
    var fromText = readTextPattern('Tổng tiền', /([\d.,]+)/) ||
                   readTextPattern('Thành tiền', /([\d.,]+)/) ||
                   readTextPattern('Tạm tính', /([\d.,]+)/) ||
                   readTextPattern('Tổng giá', /([\d.,]+)/);
    return parsePriceVN(fromText);
  }

  // ========== SESSION FLAGS ==========
  function sessFlag(name){
    var s = jp(ssGet(CFG.SESSION_FLAGS_KEY), {}) || {};
    return !!s[name];
  }
  function setSessFlag(name){
    var s = jp(ssGet(CFG.SESSION_FLAGS_KEY), {}) || {};
    s[name] = 1;
    ssSet(CFG.SESSION_FLAGS_KEY, JSON.stringify(s));
  }

  // ========== PAYLOAD BUILDER ==========
  function buildPayload(type, opts){
    opts = opts || {};
    return {
      type: type,
      client_id: getClientId(),
      is_new_conv: opts.is_new_conv !== false,
      gclid: getMkt('gclid'),
      ttclid: getMkt('ttclid'),
      fbclid: getMkt('fbclid'),
      click_time: new Date().toISOString(),
      mdh: opts.mdh || '',
      phone: opts.phone || '',
      email: opts.email || '',
      total: opts.total || 0,
      utm_source: getMkt('utm_source'),
      utm_medium: getMkt('utm_medium'),
      utm_campaign: getMkt('utm_campaign'),
      utm_content: getMkt('utm_content'),
      utm_term: getMkt('utm_term'),
      landing: location.pathname,
      current_url: (location.href || '').substring(0, 500),
      user_agent: (navigator.userAgent || '').substring(0, 200),
      chat_target: opts.chat_target || '',
      _v: CFG.VERSION
    };
  }

  // ========== SEND CHAIN ==========
  function tryBeacon(p){
    try {
      if (navigator.sendBeacon){
        var blob = new Blob([JSON.stringify(p)], {type: 'text/plain;charset=UTF-8'});
        return navigator.sendBeacon(CFG.ENDPOINT, blob);
      }
    } catch(e){}
    return false;
  }
  function tryFetch(p){
    try {
      if (typeof fetch !== 'function') return false;
      fetch(CFG.ENDPOINT, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: {'Content-Type': 'text/plain;charset=UTF-8'},
        body: JSON.stringify(p)
      });
      return true;
    } catch(e){ return false; }
  }
  function addToQueue(p){
    try {
      var q = jp(lsGet(CFG.QUEUE_KEY), []) || [];
      p._queued_at = Date.now();
      q.push(p);
      if (q.length > 50) q = q.slice(-50);
      lsSet(CFG.QUEUE_KEY, JSON.stringify(q));
    } catch(e){}
  }
  function sendPayload(p){
    if (tryBeacon(p)) return 'beacon';
    if (tryFetch(p))  return 'fetch';
    addToQueue(p);
    return 'queued';
  }
  function flushQueue(){
    try {
      var q = jp(lsGet(CFG.QUEUE_KEY), []) || [];
      if (!q.length) return 0;
      var now = Date.now();
      var fresh = [];
      var sent = 0;
      for (var i=0; i<q.length; i++){
        var p = q[i];
        if (!p) continue;
        if ((now - (p._queued_at || 0)) > CFG.QUEUE_TTL_MS) continue;
        var qAt = p._queued_at;
        delete p._queued_at;
        if (tryBeacon(p) || tryFetch(p)){ sent++; }
        else { p._queued_at = qAt; fresh.push(p); }
      }
      lsSet(CFG.QUEUE_KEY, JSON.stringify(fresh));
      return sent;
    } catch(e){ return 0; }
  }

  // ========== EVENT A — PURCHASE (v6.1: ưu tiên text-pattern Nasani, fallback DOM) ==========
  function firePurchase(){
    if ((location.pathname || '').indexOf('hoan-tat') < 0) return;
    var mdh = getURLParam('mdh');
    if (!mdh) return;
    if (purchaseSeen(mdh)) return;

    // v6.1: ưu tiên text-pattern (Nasani plain text), fallback DOM selector (custom theme khác)
    var phone = normalizePhoneVN(
      readHoanTatPhone() ||
      readDOM([
        'input[name="dienthoai"]','#dienthoai',
        '.thong-tin-phone','span.phone','[data-phone]','#order-phone',
        'input[name*="phone" i]','input[type="tel"]'
      ])
    );
    var email = readHoanTatEmail() || readDOM([
      '[data-email]','#order-email','input[type="email"]','.thong-tin-email','.email-khachhang'
    ]);
    var total = parsePriceVN(readHoanTatTotal()) || parsePriceVN(readDOM([
      '.tong-gia','.tong-tien','.order-total','[data-total]','.total-price','.cart-total','.gia-tong'
    ]));

    sendPayload(buildPayload('purchase', {
      mdh: mdh, phone: phone, email: email, total: total, is_new_conv: true
    }));
  }

  // ========== EVENT B — CHECKOUT_SUBMIT (v6.1: dùng PHONE_SELECTOR mở rộng + readCartTotal) ==========
  function bindCheckoutSubmit(){
    if ((location.pathname || '').indexOf('gio-hang') < 0) return;
    var FLAG = 'checkout_submitted';
    document.addEventListener('submit', function(e){
      try {
        if (sessFlag(FLAG)) return;
        var form = e.target;
        if (!form || form.tagName !== 'FORM') return;
        var cls = (form.className || '').toString().toLowerCase();
        var id  = (form.id || '').toString().toLowerCase();
        if (cls.indexOf('search') >= 0 || id.indexOf('search') >= 0) return;

        var phone = '', email = '';
        var pIn = form.querySelector(PHONE_SELECTOR);
        if (pIn) phone = normalizePhoneVN(pIn.value);
        var eIn = form.querySelector('input[type="email"], input[name="email"], #email');
        if (eIn) email = (eIn.value || '').trim();

        var total = readCartTotal();

        setSessFlag(FLAG);
        var cid = getClientId();
        sendPayload(buildPayload('checkout_submit', {
          mdh: '', phone: phone, email: email, total: total,
          is_new_conv: isNewConv('checkout_submit', cid)
        }));
      } catch(_){}
    }, true);
  }

  // ========== EVENT C — PHONE_LEAD (v6.1: dùng PHONE_SELECTOR mở rộng) ==========
  var _phoneSession = {};
  function firePhoneLead(rawPhone, source){
    var norm = normalizePhoneVN(rawPhone);
    if (!norm) return false;
    var gclid = getMkt('gclid');
    if (!gclid) return false;
    var key = norm + '__' + gclid;
    if (_phoneSession[key]) return false;
    _phoneSession[key] = 1;
    var cid = getClientId();
    sendPayload(buildPayload('phone_lead', {
      phone: norm,
      is_new_conv: isNewConv('phone_lead', cid)
    }));
    return true;
  }
  function bindPhoneInputs(){
    function bind(el){
      if (!el || el.__ocu_bound) return;
      el.__ocu_bound = true;
      var h = function(){ firePhoneLead(el.value, 'blur'); };
      el.addEventListener('blur', h);
      el.addEventListener('change', h);
    }
    function scan(){
      try {
        var inputs = document.querySelectorAll(PHONE_SELECTOR);
        for (var i=0; i<inputs.length; i++) bind(inputs[i]);
      } catch(e){}
    }
    scan();
    try {
      var mo = new MutationObserver(function(){ scan(); });
      mo.observe(document.documentElement || document.body, {childList: true, subtree: true});
    } catch(e){}
  }

  // ========== EVENT D — CHAT_CLICK ==========
  function detectChat(href){
    if (!href) return '';
    var h = String(href).toLowerCase();
    if (h.indexOf('zalo.me') >= 0 || h.indexOf('zalo.vn') >= 0 ||
        h.indexOf('chat.zalo') >= 0 || h.indexOf('oa.zalo.me') >= 0) return 'zalo_click';
    if (h.indexOf('m.me') >= 0 || h.indexOf('messenger.com') >= 0 ||
        h.indexOf('facebook.com/messages') >= 0 || h.indexOf('fb.me') >= 0) return 'messenger_click';
    return '';
  }
  function autoTagChatLink(a){
    try {
      if (!a || !a.href || a.__ocu_tagged) return;
      var g = getMkt('gclid'), t = getMkt('ttclid'), f = getMkt('fbclid'), u = getMkt('utm_source');
      if (!g && !t && !f && !u){ a.__ocu_tagged = true; return; }
      var ref = 'G_' + g + '_T_' + t + '_F_' + f + '_U_' + u;
      var url = a.href;
      if (/[?&]ref=/.test(url)){ a.__ocu_tagged = true; return; }
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + encodeURIComponent(ref).substring(0, 200);
      a.href = url;
      a.__ocu_tagged = true;
    } catch(_){}
  }
  function bindChatClick(){
    document.addEventListener('click', function(e){
      try {
        var a = e.target;
        while (a && a !== document && a.tagName !== 'A') a = a.parentNode;
        if (!a || a === document || !a.href) return;
        var type = detectChat(a.href);
        if (!type) return;
        var cid = getClientId();
        var isNew = isNewConv(type, cid);
        var target = String(a.href).substring(0, 100);
        autoTagChatLink(a);
        sendPayload(buildPayload(type, {
          chat_target: target,
          is_new_conv: isNew
        }));
      } catch(_){}
    }, true);
  }

  // ========== INIT ==========
  function init(){
    try {
      window.__ocu_v61_active = true;     // v6.1 marker mới
      window.__ocu_v6_active = true;       // giữ marker v6.0 cho compat
      window.__ocu_v55_active = true;
      window.__ocu_v54_active = true;
      window.__ocu_v5_active = true;
      window.FufutechOCU_loaded = true;
    } catch(_){}

    storeMarketing();
    getClientId();

    setTimeout(flushQueue, 1500);

    bindCheckoutSubmit();
    bindPhoneInputs();
    bindChatClick();

    firePurchase();
  }

  // ========== PUBLIC API ==========
  window.FufutechOCU = {
    version: CFG.VERSION,
    getClientId: getClientId,
    getGclid: function(){ return getMkt('gclid'); },
    getAll: function(){
      return {
        version: CFG.VERSION,
        client_id: getClientId(),
        gclid: getMkt('gclid'),
        ttclid: getMkt('ttclid'),
        fbclid: getMkt('fbclid'),
        utm_source: getMkt('utm_source'),
        utm_medium: getMkt('utm_medium'),
        utm_campaign: getMkt('utm_campaign'),
        utm_content: getMkt('utm_content'),
        utm_term: getMkt('utm_term'),
        mdh: getURLParam('mdh'),
        path: location.pathname,
        href: location.href
      };
    },
    getQueue: function(){ return jp(lsGet(CFG.QUEUE_KEY), []) || []; },
    forceFlushQueue: flushQueue,
    normalizePhoneVN: normalizePhoneVN,
    firePhoneLead: firePhoneLead,
    // v6.1: expose text-pattern helpers cho debug Nasani
    readHoanTatPhone: readHoanTatPhone,
    readHoanTatEmail: readHoanTatEmail,
    readHoanTatTotal: readHoanTatTotal,
    readCartTotal: readCartTotal,
    readTextPattern: readTextPattern,
    _phoneSelector: PHONE_SELECTOR,
    _maskPhone: maskPhone,
    _getURLParam: getURLParam
  };

  // ========== BOOT ==========
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try {
    window.addEventListener('online', function(){ setTimeout(flushQueue, 500); });
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') setTimeout(flushQueue, 800);
    });
  } catch(_){}

})();
/*!
 * FUFUTECH OCU v6.1 — NASANI SELECTOR FIX
 * Released: 2026-05-19
 * Loaded via jsDelivr CDN from GitHub
 */
(function(){
  'use strict';

  // ========== CONFIG ==========
  var CFG = {
    ENDPOINT: 'https://script.google.com/macros/s/AKfycbxksRhf_kVaXXglwG4mka6qjlYOcW1cA6EYA7lm1uKnL6-Y22H3Q4B4pgQOlXLK4NGq/exec',
    VERSION: 'v6.1',
    CLIENT_ID_KEY: 'ff_client_id',
    CLIENT_ID_META: 'ff_client_id_meta',
    CONV_HIST_KEY: 'ff_conv_history_v61',
    PURCHASE_HIST_KEY: 'ff_purchase_history_v61',
    QUEUE_KEY: 'ff_queue_v61',
    MKT_SEEN_KEY: 'ff_mkt_seen',
    SESSION_FLAGS_KEY: 'ff_session_flags_v61',
    DEDUP_MS: 30 * 86400000,
    PURCHASE_DEDUP_MS: 90 * 86400000,
    QUEUE_TTL_MS: 24 * 3600000,
    CLIENT_ID_TTL_MS: 365 * 86400000
  };

  if (window.__ocu_v61_active) { return; } // chống load 2 lần v6.1

  // ========== PHONE SELECTOR (v6.1 — fix Nasani name="dienthoai") ==========
  // Thứ tự ưu tiên: dienthoai (Nasani) → các biến thể dien-thoai → phone/tel → sdt/mobile → placeholder VN
  var PHONE_SELECTOR =
    'input[name="dienthoai"], #dienthoai, ' +
    'input[name*="dien-thoai" i], input[name*="dienthoai" i], ' +
    'input[name*="phone" i], input[type="tel"], ' +
    'input[name*="sdt" i], input[name*="mobile" i], ' +
    'input[placeholder*="điện thoại" i], input[placeholder*="dien thoai" i]';

  // ========== HELPERS — STORAGE / JSON ==========
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
  function ssGet(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
  function ssSet(k,v){ try{ sessionStorage.setItem(k,v); return true; }catch(e){ return false; } }
  function jp(s, fb){ try{ var r=JSON.parse(s); return r==null?fb:r; }catch(e){ return fb; } }

  // ========== URL PARSER ==========
  // Nasani URL kiểu /hoan-tat.html&mdh=... → URLSearchParams fail. Phải regex location.href.
  function getURLParam(name){
    var re = new RegExp('[?&]' + name.replace(/[^a-z0-9_]/gi,'') + '=([^&#]*)', 'i');
    var m = (location.href || '').match(re);
    if (m && m[1]){
      try { return decodeURIComponent(m[1].replace(/\+/g,' ')); } catch(e){ return m[1]; }
    }
    return '';
  }

  // ========== PHONE NORMALIZE (VN) ==========
  function normalizePhoneVN(raw){
    if (!raw) return '';
    var s = String(raw).replace(/[^\d]/g,'');
    if (!s) return '';
    if (s.length === 11 && s.indexOf('84') === 0) s = '0' + s.substring(2);
    else if (s.length === 12 && s.indexOf('084') === 0) s = '0' + s.substring(3);
    else if (s.length === 9 && s.charAt(0) !== '0') s = '0' + s;
    if (s.length === 10 && s.charAt(0) === '0') return s;
    return '';
  }
  function maskPhone(p){
    if (!p || p.length < 6) return p || '';
    return p.substring(0,4) + '****' + p.substring(p.length - 2);
  }

  // ========== CLIENT ID ==========
  function genId(){
    var rand = '';
    for (var i=0; i<12; i++){ rand += Math.floor(Math.random()*36).toString(36); }
    return 'FFcli_' + rand;
  }
  function getClientId(){
    try {
      var id = lsGet(CFG.CLIENT_ID_KEY);
      var meta = jp(lsGet(CFG.CLIENT_ID_META), null);
      var now = Date.now();
      if (id && meta && meta.created && (now - meta.created) < CFG.CLIENT_ID_TTL_MS){
        meta.last_seen = now;
        lsSet(CFG.CLIENT_ID_META, JSON.stringify(meta));
        return id;
      }
      var nid = genId();
      lsSet(CFG.CLIENT_ID_KEY, nid);
      lsSet(CFG.CLIENT_ID_META, JSON.stringify({created: now, last_seen: now}));
      return nid;
    } catch(e){ return 'FFcli_anon'; }
  }

  // ========== MARKETING PARAMS ==========
  var MKT_KEYS = ['gclid','ttclid','fbclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  function storeMarketing(){
    var touched = false;
    for (var i=0; i<MKT_KEYS.length; i++){
      var v = getURLParam(MKT_KEYS[i]);
      if (v){ lsSet('ff_' + MKT_KEYS[i], v); touched = true; }
    }
    if (touched) lsSet(CFG.MKT_SEEN_KEY, '1');
  }
  function getMkt(name){ return getURLParam(name) || lsGet('ff_' + name) || ''; }

  // ========== DEDUP (per client_id + type, 30 ngày) ==========
  function getHist(key){ return jp(lsGet(key), {}) || {}; }
  function saveHist(key, h){ lsSet(key, JSON.stringify(h)); }

  function isNewConv(type, clientId){
    if (type === 'purchase') return true;
    var h = getHist(CFG.CONV_HIST_KEY);
    var k = (clientId || 'anon') + '__' + type;
    var last = h[k] || 0;
    var now = Date.now();
    if (now - last < CFG.DEDUP_MS) return false;
    h[k] = now;
    for (var kk in h){ if (h.hasOwnProperty(kk) && (now - h[kk]) > CFG.DEDUP_MS) delete h[kk]; }
    saveHist(CFG.CONV_HIST_KEY, h);
    return true;
  }

  function purchaseSeen(mdh){
    if (!mdh) return false;
    var h = getHist(CFG.PURCHASE_HIST_KEY);
    var now = Date.now();
    for (var k in h){ if (h.hasOwnProperty(k) && (now - h[k]) > CFG.PURCHASE_DEDUP_MS) delete h[k]; }
    var key = 'purchase_' + mdh;
    if (h[key]){ saveHist(CFG.PURCHASE_HIST_KEY, h); return true; }
    h[key] = now;
    saveHist(CFG.PURCHASE_HIST_KEY, h);
    return false;
  }

  // ========== DOM READ HELPERS ==========
  function readDOM(selectors){
    for (var i=0; i<selectors.length; i++){
      try {
        var el = document.querySelector(selectors[i]);
        if (el){
          var t = (el.value || el.getAttribute('data-phone') || el.textContent || '').toString().replace(/\s+/g,' ').trim();
          if (t) return t;
        }
      } catch(e){}
    }
    return '';
  }
  function parsePriceVN(s){
    if (!s) return 0;
    var n = String(s).replace(/[^\d]/g,'');
    return n ? parseInt(n, 10) : 0;
  }

  // ========== v6.1 TEXT-PATTERN MATCHING (cho /hoan-tat Nasani render plain text) ==========
  // Nasani /hoan-tat hiển thị: "Số điện thoại: 0909042831", "Email: x@y.z", "Tổng giá: 2.889.000 vnđ"
  // KHÔNG có class/id → phải scan body.innerText.
  function readTextPattern(label, regex){
    try {
      var text = (document.body && (document.body.innerText || document.body.textContent)) || '';
      if (!text) return '';
      var labelIdx = text.indexOf(label);
      if (labelIdx < 0) return '';
      var after = text.substring(labelIdx, labelIdx + 200);
      var m = after.match(regex);
      return m ? (m[1] || m[0] || '') : '';
    } catch(e){ return ''; }
  }

  function readHoanTatPhone(){
    var p = readTextPattern('Số điện thoại', /(\d{9,11})/);
    if (!p) p = readTextPattern('Điện thoại', /(\d{9,11})/);
    if (!p) p = readTextPattern('điện thoại', /(\d{9,11})/);
    if (!p) p = readTextPattern('SĐT', /(\d{9,11})/);
    if (!p) p = readTextPattern('Phone', /(\d{9,11})/);
    return p;
  }
  function readHoanTatEmail(){
    var e = readTextPattern('Email', /([\w.\-+]+@[\w.\-]+\.[a-z]{2,})/i);
    if (!e) e = readTextPattern('E-mail', /([\w.\-+]+@[\w.\-]+\.[a-z]{2,})/i);
    return e;
  }
  function readHoanTatTotal(){
    // "Tổng giá: 2.889.000 vnđ" / "Tổng tiền: 2,889,000đ" / "Thành tiền: 2889000 VND"
    var t = readTextPattern('Tổng giá', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    if (!t) t = readTextPattern('Tổng tiền', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    if (!t) t = readTextPattern('Thành tiền', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    if (!t) t = readTextPattern('Tổng cộng', /([\d.,]+)\s*(?:vnđ|VNĐ|đ|VND|vnd)/);
    return t;
  }

  function readCartTotal(){
    // 1) DOM selector trước
    var t = readDOM(['.total-price','.tong-gia','.tong-tien','.order-total','[data-total]','.cart-total','.gia-tong','.checkout-total']);
    if (t){
      var n = parsePriceVN(t);
      if (n > 0) return n;
    }
    // 2) Hidden input có thể chứa tổng tiền raw (Nasani có thể có <input name="tongtien" value="2889000">)
    try {
      var h = document.querySelector('input[name*="tongtien" i], input[name*="tong-tien" i], input[name*="total" i]');
      if (h && h.value){
        var nn = parsePriceVN(h.value);
        if (nn > 0) return nn;
      }
    } catch(_){}
    // 3) Backup: body text pattern
    var fromText = readTextPattern('Tổng tiền', /([\d.,]+)/) ||
                   readTextPattern('Thành tiền', /([\d.,]+)/) ||
                   readTextPattern('Tạm tính', /([\d.,]+)/) ||
                   readTextPattern('Tổng giá', /([\d.,]+)/);
    return parsePriceVN(fromText);
  }

  // ========== SESSION FLAGS ==========
  function sessFlag(name){
    var s = jp(ssGet(CFG.SESSION_FLAGS_KEY), {}) || {};
    return !!s[name];
  }
  function setSessFlag(name){
    var s = jp(ssGet(CFG.SESSION_FLAGS_KEY), {}) || {};
    s[name] = 1;
    ssSet(CFG.SESSION_FLAGS_KEY, JSON.stringify(s));
  }

  // ========== PAYLOAD BUILDER ==========
  function buildPayload(type, opts){
    opts = opts || {};
    return {
      type: type,
      client_id: getClientId(),
      is_new_conv: opts.is_new_conv !== false,
      gclid: getMkt('gclid'),
      ttclid: getMkt('ttclid'),
      fbclid: getMkt('fbclid'),
      click_time: new Date().toISOString(),
      mdh: opts.mdh || '',
      phone: opts.phone || '',
      email: opts.email || '',
      total: opts.total || 0,
      utm_source: getMkt('utm_source'),
      utm_medium: getMkt('utm_medium'),
      utm_campaign: getMkt('utm_campaign'),
      utm_content: getMkt('utm_content'),
      utm_term: getMkt('utm_term'),
      landing: location.pathname,
      current_url: (location.href || '').substring(0, 500),
      user_agent: (navigator.userAgent || '').substring(0, 200),
      chat_target: opts.chat_target || '',
      _v: CFG.VERSION
    };
  }

  // ========== SEND CHAIN ==========
  function tryBeacon(p){
    try {
      if (navigator.sendBeacon){
        var blob = new Blob([JSON.stringify(p)], {type: 'text/plain;charset=UTF-8'});
        return navigator.sendBeacon(CFG.ENDPOINT, blob);
      }
    } catch(e){}
    return false;
  }
  function tryFetch(p){
    try {
      if (typeof fetch !== 'function') return false;
      fetch(CFG.ENDPOINT, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: {'Content-Type': 'text/plain;charset=UTF-8'},
        body: JSON.stringify(p)
      });
      return true;
    } catch(e){ return false; }
  }
  function addToQueue(p){
    try {
      var q = jp(lsGet(CFG.QUEUE_KEY), []) || [];
      p._queued_at = Date.now();
      q.push(p);
      if (q.length > 50) q = q.slice(-50);
      lsSet(CFG.QUEUE_KEY, JSON.stringify(q));
    } catch(e){}
  }
  function sendPayload(p){
    if (tryBeacon(p)) return 'beacon';
    if (tryFetch(p))  return 'fetch';
    addToQueue(p);
    return 'queued';
  }
  function flushQueue(){
    try {
      var q = jp(lsGet(CFG.QUEUE_KEY), []) || [];
      if (!q.length) return 0;
      var now = Date.now();
      var fresh = [];
      var sent = 0;
      for (var i=0; i<q.length; i++){
        var p = q[i];
        if (!p) continue;
        if ((now - (p._queued_at || 0)) > CFG.QUEUE_TTL_MS) continue;
        var qAt = p._queued_at;
        delete p._queued_at;
        if (tryBeacon(p) || tryFetch(p)){ sent++; }
        else { p._queued_at = qAt; fresh.push(p); }
      }
      lsSet(CFG.QUEUE_KEY, JSON.stringify(fresh));
      return sent;
    } catch(e){ return 0; }
  }

  // ========== EVENT A — PURCHASE (v6.1: ưu tiên text-pattern Nasani, fallback DOM) ==========
  function firePurchase(){
    if ((location.pathname || '').indexOf('hoan-tat') < 0) return;
    var mdh = getURLParam('mdh');
    if (!mdh) return;
    if (purchaseSeen(mdh)) return;

    // v6.1: ưu tiên text-pattern (Nasani plain text), fallback DOM selector (custom theme khác)
    var phone = normalizePhoneVN(
      readHoanTatPhone() ||
      readDOM([
        'input[name="dienthoai"]','#dienthoai',
        '.thong-tin-phone','span.phone','[data-phone]','#order-phone',
        'input[name*="phone" i]','input[type="tel"]'
      ])
    );
    var email = readHoanTatEmail() || readDOM([
      '[data-email]','#order-email','input[type="email"]','.thong-tin-email','.email-khachhang'
    ]);
    var total = parsePriceVN(readHoanTatTotal()) || parsePriceVN(readDOM([
      '.tong-gia','.tong-tien','.order-total','[data-total]','.total-price','.cart-total','.gia-tong'
    ]));

    sendPayload(buildPayload('purchase', {
      mdh: mdh, phone: phone, email: email, total: total, is_new_conv: true
    }));
  }

  // ========== EVENT B — CHECKOUT_SUBMIT (v6.1: dùng PHONE_SELECTOR mở rộng + readCartTotal) ==========
  function bindCheckoutSubmit(){
    if ((location.pathname || '').indexOf('gio-hang') < 0) return;
    var FLAG = 'checkout_submitted';
    document.addEventListener('submit', function(e){
      try {
        if (sessFlag(FLAG)) return;
        var form = e.target;
        if (!form || form.tagName !== 'FORM') return;
        var cls = (form.className || '').toString().toLowerCase();
        var id  = (form.id || '').toString().toLowerCase();
        if (cls.indexOf('search') >= 0 || id.indexOf('search') >= 0) return;

        var phone = '', email = '';
        var pIn = form.querySelector(PHONE_SELECTOR);
        if (pIn) phone = normalizePhoneVN(pIn.value);
        var eIn = form.querySelector('input[type="email"], input[name="email"], #email');
        if (eIn) email = (eIn.value || '').trim();

        var total = readCartTotal();

        setSessFlag(FLAG);
        var cid = getClientId();
        sendPayload(buildPayload('checkout_submit', {
          mdh: '', phone: phone, email: email, total: total,
          is_new_conv: isNewConv('checkout_submit', cid)
        }));
      } catch(_){}
    }, true);
  }

  // ========== EVENT C — PHONE_LEAD (v6.1: dùng PHONE_SELECTOR mở rộng) ==========
  var _phoneSession = {};
  function firePhoneLead(rawPhone, source){
    var norm = normalizePhoneVN(rawPhone);
    if (!norm) return false;
    var gclid = getMkt('gclid');
    if (!gclid) return false;
    var key = norm + '__' + gclid;
    if (_phoneSession[key]) return false;
    _phoneSession[key] = 1;
    var cid = getClientId();
    sendPayload(buildPayload('phone_lead', {
      phone: norm,
      is_new_conv: isNewConv('phone_lead', cid)
    }));
    return true;
  }
  function bindPhoneInputs(){
    function bind(el){
      if (!el || el.__ocu_bound) return;
      el.__ocu_bound = true;
      var h = function(){ firePhoneLead(el.value, 'blur'); };
      el.addEventListener('blur', h);
      el.addEventListener('change', h);
    }
    function scan(){
      try {
        var inputs = document.querySelectorAll(PHONE_SELECTOR);
        for (var i=0; i<inputs.length; i++) bind(inputs[i]);
      } catch(e){}
    }
    scan();
    try {
      var mo = new MutationObserver(function(){ scan(); });
      mo.observe(document.documentElement || document.body, {childList: true, subtree: true});
    } catch(e){}
  }

  // ========== EVENT D — CHAT_CLICK ==========
  function detectChat(href){
    if (!href) return '';
    var h = String(href).toLowerCase();
    if (h.indexOf('zalo.me') >= 0 || h.indexOf('zalo.vn') >= 0 ||
        h.indexOf('chat.zalo') >= 0 || h.indexOf('oa.zalo.me') >= 0) return 'zalo_click';
    if (h.indexOf('m.me') >= 0 || h.indexOf('messenger.com') >= 0 ||
        h.indexOf('facebook.com/messages') >= 0 || h.indexOf('fb.me') >= 0) return 'messenger_click';
    return '';
  }
  function autoTagChatLink(a){
    try {
      if (!a || !a.href || a.__ocu_tagged) return;
      var g = getMkt('gclid'), t = getMkt('ttclid'), f = getMkt('fbclid'), u = getMkt('utm_source');
      if (!g && !t && !f && !u){ a.__ocu_tagged = true; return; }
      var ref = 'G_' + g + '_T_' + t + '_F_' + f + '_U_' + u;
      var url = a.href;
      if (/[?&]ref=/.test(url)){ a.__ocu_tagged = true; return; }
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + encodeURIComponent(ref).substring(0, 200);
      a.href = url;
      a.__ocu_tagged = true;
    } catch(_){}
  }
  function bindChatClick(){
    document.addEventListener('click', function(e){
      try {
        var a = e.target;
        while (a && a !== document && a.tagName !== 'A') a = a.parentNode;
        if (!a || a === document || !a.href) return;
        var type = detectChat(a.href);
        if (!type) return;
        var cid = getClientId();
        var isNew = isNewConv(type, cid);
        var target = String(a.href).substring(0, 100);
        autoTagChatLink(a);
        sendPayload(buildPayload(type, {
          chat_target: target,
          is_new_conv: isNew
        }));
      } catch(_){}
    }, true);
  }

  // ========== INIT ==========
  function init(){
    try {
      window.__ocu_v61_active = true;     // v6.1 marker mới
      window.__ocu_v6_active = true;       // giữ marker v6.0 cho compat
      window.__ocu_v55_active = true;
      window.__ocu_v54_active = true;
      window.__ocu_v5_active = true;
      window.FufutechOCU_loaded = true;
    } catch(_){}

    storeMarketing();
    getClientId();

    setTimeout(flushQueue, 1500);

    bindCheckoutSubmit();
    bindPhoneInputs();
    bindChatClick();

    firePurchase();
  }

  // ========== PUBLIC API ==========
  window.FufutechOCU = {
    version: CFG.VERSION,
    getClientId: getClientId,
    getGclid: function(){ return getMkt('gclid'); },
    getAll: function(){
      return {
        version: CFG.VERSION,
        client_id: getClientId(),
        gclid: getMkt('gclid'),
        ttclid: getMkt('ttclid'),
        fbclid: getMkt('fbclid'),
        utm_source: getMkt('utm_source'),
        utm_medium: getMkt('utm_medium'),
        utm_campaign: getMkt('utm_campaign'),
        utm_content: getMkt('utm_content'),
        utm_term: getMkt('utm_term'),
        mdh: getURLParam('mdh'),
        path: location.pathname,
        href: location.href
      };
    },
    getQueue: function(){ return jp(lsGet(CFG.QUEUE_KEY), []) || []; },
    forceFlushQueue: flushQueue,
    normalizePhoneVN: normalizePhoneVN,
    firePhoneLead: firePhoneLead,
    // v6.1: expose text-pattern helpers cho debug Nasani
    readHoanTatPhone: readHoanTatPhone,
    readHoanTatEmail: readHoanTatEmail,
    readHoanTatTotal: readHoanTatTotal,
    readCartTotal: readCartTotal,
    readTextPattern: readTextPattern,
    _phoneSelector: PHONE_SELECTOR,
    _maskPhone: maskPhone,
    _getURLParam: getURLParam
  };

  // ========== BOOT ==========
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try {
    window.addEventListener('online', function(){ setTimeout(flushQueue, 500); });
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') setTimeout(flushQueue, 800);
    });
  } catch(_){}

})();
