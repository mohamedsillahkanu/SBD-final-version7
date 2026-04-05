// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbymRy-M5v0fVLWUjw4IXYhd1oIR2ZvnP_Dzr_iGR-Th0cMIpmE2ntGeujWYH7-C6NHIzA/exec',
    SHEET_URL:  'https://docs.google.com/spreadsheets/d/1cXlYiTMzcRP1BCj9mt1JXoK_pjgWbRtDEEQUPMg2HPs/edit?usp=sharing',
    CSV_FILE:   'cascading_data1.csv',
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'admin123'
};

// ============================================
// STATE
// ============================================
const state = {
    currentSection: 1,
    totalSections:  5,
    isOnline:       navigator.onLine,
    pendingSubmissions: [],
    drafts:         [],
    submittedSchools: [],
    signaturePads:  {},
    formStatus:     'draft',
    currentDraftId: null,
    charts:         {},
    currentUser:    null,
    isAdmin:        false
};

let ALL_LOCATION_DATA = {};
let USER_MAP          = {};
let LOCATION_DATA     = {};
let deferredPrompt    = null;

// ============================================
// CACHE IMAGES FOR OFFLINE USE
// ============================================
function cacheImagesForOffline() {
    const imagesToCache = [
        'ICF-SL.jpg','logo_mohs.png','logo_nmcp.png','logo_pmi.png',
        'infographics.png','favicon.svg','icon-192.svg','video.mp4'
    ];
    if ('caches' in window) {
        caches.open('itn-images-v1').then(cache => {
            imagesToCache.forEach(imageUrl => {
                fetch(imageUrl, { mode: 'no-cors' })
                    .then(response => { if (response.ok) cache.put(imageUrl, response); })
                    .catch(() => {
                        const fallback = {
                            'ICF-SL.jpg': 'https://github.com/mohamedsillahkanu/gdp-dashboard-2/raw/6c7463b0d5c3be150aafae695a4bcbbd8aeb1499/ICF-SL.jpg',
                            'infographics.png': 'https://raw.githubusercontent.com/mohamedsillahkanu/gdp-dashboard-2/main/infographics.png'
                        };
                        if (fallback[imageUrl]) {
                            fetch(fallback[imageUrl], { mode: 'no-cors' })
                                .then(r => { if (r.ok) cache.put(imageUrl, r); })
                                .catch(() => {});
                        }
                    });
            });
        });
    }
}

// ============================================
// PWA SERVICE WORKER
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('[PWA] Service Worker registered');
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    nw.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller)
                            showNotification('New version available! Refresh to update.', 'info');
                    });
                });
                cacheImagesForOffline();
            })
            .catch(err => console.error('[PWA] SW registration failed:', err));
    });
}

// ============================================
// PWA INSTALL PROMPT
// ============================================
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installBtn');
    if (btn) btn.style.opacity = '1';
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    showNotification('App installed successfully!', 'success');
});

function setupInstallButton() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        if (!deferredPrompt) { showNotification('App already installed or unavailable.', 'info'); return; }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') showNotification('App installed successfully!', 'success');
        deferredPrompt = null;
    });
}

// ============================================
// APP UPDATE
// ============================================
window.updateApp = async function() {
    const btn = document.getElementById('updateAppBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/></svg> UPDATING...';
    showNotification('Checking for updates...', 'info');
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
        }
        if ('caches' in window) {
            const names = await caches.keys();
            for (const n of names) await caches.delete(n);
        }
        setTimeout(() => cacheImagesForOffline(), 500);
        showNotification('Update complete! Reloading...', 'success');
        setTimeout(() => window.location.reload(true), 1000);
    } catch (err) {
        showNotification('Update failed. Please try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/></svg> UPDATE';
    }
};

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    loadFromStorage();
    injectSummaryModal();
    setupInstallButton();
    try {
        await loadLocationData();
    } catch (e) {
        console.warn('Could not load location data:', e);
    }
    // showLoginScreen is overridden by ai_agent.js to auto-start without login
    showLoginScreen();
}

function loadFromStorage() {
    try {
        state.pendingSubmissions = JSON.parse(localStorage.getItem('itn_pending')   || '[]');
        state.drafts             = JSON.parse(localStorage.getItem('itn_drafts')    || '[]');
        state.submittedSchools   = JSON.parse(localStorage.getItem('itn_submitted') || '[]');
    } catch (e) {
        state.pendingSubmissions = [];
        state.drafts = [];
        state.submittedSchools = [];
    }
}

function saveToStorage() {
    localStorage.setItem('itn_pending',   JSON.stringify(state.pendingSubmissions));
    localStorage.setItem('itn_drafts',    JSON.stringify(state.drafts));
    localStorage.setItem('itn_submitted', JSON.stringify(state.submittedSchools));
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const s = document.getElementById('survey_date');
    const d = document.getElementById('distribution_date');
    if (s && !s.value) s.value = today;
    if (d && !d.value) d.value = today;
}

function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleString('en-SL', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) { return dateString; }
}

// ============================================
// INJECT SUMMARY MODAL
// ============================================
function injectSummaryModal() {
    if (document.getElementById('summaryModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="summaryModal">
      <div class="modal-content large" id="summaryModalContent">
        <div class="modal-header" style="background:#004080;">
          <span class="modal-title">
            <svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>SCHOOL COVERAGE SUMMARY
          </span>
          <button class="modal-close" onclick="closeSummaryModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body" id="summaryModalBody"></div>
      </div>
    </div>
    <div class="modal-overlay" id="schoolDetailModal">
      <div class="modal-content large" id="schoolDetailContent">
        <div class="modal-header" style="background:#004080;">
          <span class="modal-title" id="schoolDetailTitle">SCHOOL DETAIL</span>
          <button class="modal-close" onclick="closeSchoolDetailModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body" id="schoolDetailBody"></div>
      </div>
    </div>`);
}

// ============================================
// USER MANAGEMENT  (login removed — auto-start via ai_agent.js)
// ============================================
function showLoginScreen() {
    // This is overridden by ai_agent.js patchAutoStart() to skip login.
    // Fallback: show loginScreen if it somehow becomes visible
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.display = 'none';
    const am = document.getElementById('appMain');
    if (am) am.style.display = 'flex';
    // Trigger startApp directly
    state.currentUser = 'admin';
    state.isAdmin     = true;
    LOCATION_DATA     = ALL_LOCATION_DATA;
    startApp('ICF-SL', true);
}

function hideLoginScreen() {
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.display = 'none';
    const am = document.getElementById('appMain');
    if (am) { am.style.display = 'flex'; am.style.flexDirection = 'column'; }
    cacheImagesForOffline();
}

window.handleLogin = function() {
    // No-op: login not required. Auto-started by ai_agent.js / showLoginScreen override.
    state.currentUser = 'admin';
    state.isAdmin     = true;
    LOCATION_DATA     = ALL_LOCATION_DATA;
    startApp('ICF-SL', true);
};

function startApp(displayName, isAdmin) {
    // Null-safe: currentUserDisplay and adminBadge may not exist if login UI removed
    const displayEl = document.getElementById('currentUserDisplay');
    if (displayEl) displayEl.textContent = displayName;
    const badge = document.getElementById('adminBadge');
    if (badge) badge.style.display = isAdmin ? 'inline' : 'none';

    const sbField = document.getElementById('submitted_by');
    if (sbField) sbField.value = state.currentUser || '';

    hideLoginScreen();
    updateOnlineStatus();
    updateCounts();
    setupEventListeners();
    populateDistricts();
    setupCascading();
    setupSchoolSubmissionCheck();
    setupValidation();
    setupPhoneValidation();
    setupNameValidation();
    setupCalculations();
    setupAutoSave();
    initAllSignaturePads();
    captureGPS();
    setDefaultDate();
    updateProgress();
    updateSummaryBadge();
    restoreDraftIfExists();

    showNotification('Welcome to ICF Collect!', 'success');
}

window.handleLogout = function() {
    // Overridden by ai_agent.js to be a no-op. Kept as fallback.
};

// ============================================
// USER MAP
// ============================================
function buildUserMap(rows) {
    USER_MAP = {};
    rows.forEach(row => {
        const u = (row.username || '').trim().toLowerCase();
        if (!u) return;
        if (!USER_MAP[u]) USER_MAP[u] = [];
        USER_MAP[u].push(row);
    });
}

function buildFilteredLocationData(rows) {
    const f = {};
    rows.forEach(row => {
        const d = (row.adm1||'').trim(), c = (row.adm2||'').trim(),
              s = (row.adm3||'').trim(), fac=(row.hf||'').trim(),
              com=(row.community||'').trim(), sch=(row.school_name||'').trim();
        if (!d) return;
        if (!f[d]) f[d]={};
        if (!f[d][c]) f[d][c]={};
        if (!f[d][c][s]) f[d][c][s]={};
        if (!f[d][c][s][fac]) f[d][c][s][fac]={};
        if (com && !f[d][c][s][fac][com]) f[d][c][s][fac][com]=[];
        if (com && sch && !f[d][c][s][fac][com].includes(sch)) f[d][c][s][fac][com].push(sch);
    });
    for (const d in f) for (const c in f[d]) for (const s in f[d][c])
        for (const fac in f[d][c][s]) for (const com in f[d][c][s][fac])
            f[d][c][s][fac][com].sort();
    return f;
}

// ============================================
// LOCATION DATA (CSV)
// ============================================
function loadLocationData() {
    return new Promise((resolve, reject) => {
        Papa.parse(CONFIG.CSV_FILE, {
            download: true, header: true, skipEmptyLines: true,
            complete(results) {
                ALL_LOCATION_DATA = {};
                buildUserMap(results.data);
                results.data.forEach(row => {
                    const d=(row.adm1||'').trim(), c=(row.adm2||'').trim(),
                          s=(row.adm3||'').trim(), fac=(row.hf||'').trim(),
                          com=(row.community||'').trim(), sch=(row.school_name||'').trim();
                    if (!d) return;
                    if (!ALL_LOCATION_DATA[d]) ALL_LOCATION_DATA[d]={};
                    if (!ALL_LOCATION_DATA[d][c]) ALL_LOCATION_DATA[d][c]={};
                    if (!ALL_LOCATION_DATA[d][c][s]) ALL_LOCATION_DATA[d][c][s]={};
                    if (!ALL_LOCATION_DATA[d][c][s][fac]) ALL_LOCATION_DATA[d][c][s][fac]={};
                    if (com && !ALL_LOCATION_DATA[d][c][s][fac][com]) ALL_LOCATION_DATA[d][c][s][fac][com]=[];
                    if (com && sch && !ALL_LOCATION_DATA[d][c][s][fac][com].includes(sch))
                        ALL_LOCATION_DATA[d][c][s][fac][com].push(sch);
                });
                for (const d in ALL_LOCATION_DATA) for (const c in ALL_LOCATION_DATA[d])
                    for (const s in ALL_LOCATION_DATA[d][c]) for (const fac in ALL_LOCATION_DATA[d][c][s])
                        for (const com in ALL_LOCATION_DATA[d][c][s][fac])
                            ALL_LOCATION_DATA[d][c][s][fac][com].sort();
                resolve();
            },
            error: reject
        });
    });
}

function populateDistricts() {
    const sel = document.getElementById('district');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select District...</option>';
    Object.keys(LOCATION_DATA).sort().forEach(d => {
        const o = document.createElement('option');
        o.value = d; o.textContent = d; sel.appendChild(o);
    });
    updateCount('district', Object.keys(LOCATION_DATA).length);
}

function setupCascading() {
    const district  = document.getElementById('district');
    const chiefdom  = document.getElementById('chiefdom');
    const section   = document.getElementById('section_loc');
    const facility  = document.getElementById('facility');
    const community = document.getElementById('community');
    const school    = document.getElementById('school_name');
    if (!district) return;

    district.addEventListener('change', function() {
        resetSelect(chiefdom, 'Select Chiefdom...');
        resetSelect(section,  'Select Section...');
        resetSelect(facility, 'Select Health Facility...');
        resetSelect(community,'Select Community...');
        resetSelect(school,   'Select School...');
        ['chiefdom','section_loc','facility','community','school_name'].forEach(clearCount);
        const d = this.value;
        if (d && LOCATION_DATA[d]) {
            chiefdom.disabled = false;
            Object.keys(LOCATION_DATA[d]).sort().forEach(c => appendOpt(chiefdom, c));
            updateCount('chiefdom', Object.keys(LOCATION_DATA[d]).length);
        }
    });

    chiefdom.addEventListener('change', function() {
        resetSelect(section,  'Select Section...');
        resetSelect(facility, 'Select Health Facility...');
        resetSelect(community,'Select Community...');
        resetSelect(school,   'Select School...');
        ['section_loc','facility','community','school_name'].forEach(clearCount);
        const d=district.value, c=this.value;
        if (d && c && LOCATION_DATA[d]?.[c]) {
            section.disabled = false;
            Object.keys(LOCATION_DATA[d][c]).sort().forEach(s => appendOpt(section, s));
            updateCount('section_loc', Object.keys(LOCATION_DATA[d][c]).length);
        }
    });

    section.addEventListener('change', function() {
        resetSelect(facility, 'Select Health Facility...');
        resetSelect(community,'Select Community...');
        resetSelect(school,   'Select School...');
        ['facility','community','school_name'].forEach(clearCount);
        const d=district.value, c=chiefdom.value, s=this.value;
        if (d && c && s && LOCATION_DATA[d]?.[c]?.[s]) {
            facility.disabled = false;
            Object.keys(LOCATION_DATA[d][c][s]).sort().forEach(f => appendOpt(facility, f));
            updateCount('facility', Object.keys(LOCATION_DATA[d][c][s]).length);
        }
    });

    facility.addEventListener('change', function() {
        resetSelect(community,'Select Community...');
        resetSelect(school,   'Select School...');
        ['community','school_name'].forEach(clearCount);
        const d=district.value, c=chiefdom.value, s=section.value, f=this.value;
        if (d && c && s && f && LOCATION_DATA[d]?.[c]?.[s]?.[f]) {
            community.disabled = false;
            Object.keys(LOCATION_DATA[d][c][s][f]).sort().forEach(com => appendOpt(community, com));
            updateCount('community', Object.keys(LOCATION_DATA[d][c][s][f]).length);
        }
    });

    community.addEventListener('change', function() {
        resetSelect(school, 'Select School...');
        clearCount('school_name');
        const d=district.value, c=chiefdom.value, s=section.value, f=facility.value, com=this.value;
        if (d && c && s && f && com && LOCATION_DATA[d]?.[c]?.[s]?.[f]?.[com]) {
            school.disabled = false;
            LOCATION_DATA[d][c][s][f][com].forEach(sch => appendOpt(school, sch));
            updateCount('school_name', LOCATION_DATA[d][c][s][f][com].length);
        }
    });
}

function appendOpt(sel, val) {
    const o = document.createElement('option');
    o.value = val; o.textContent = val; sel.appendChild(o);
}

function resetSelect(el, placeholder) {
    if (!el) return;
    el.innerHTML = '<option value="">' + placeholder + '</option>';
    el.disabled = true;
}

function updateCount(id, count) {
    const el = document.getElementById('count_' + id);
    if (el) el.textContent = count + ' options';
}

function clearCount(id) {
    const el = document.getElementById('count_' + id);
    if (el) el.textContent = '';
}

// ============================================
// SCHOOL SUBMISSION CHECK
// ============================================
// ── Duplicate check state ────────────────────────────────────
// Tracks the async online check result for the currently selected school
const _dupCheck = {
    key:       null,   // key being checked
    pending:   false,  // GAS request in flight
    duplicate: false,  // result: is it a duplicate?
    source:    null    // 'local' | 'online'
};

// ── Check GAS for duplicate (online) ────────────────────────
async function checkDuplicateOnline(key) {
    if (!key || !state.isOnline) return false;
    try {
        const parts = key.split('|'); // district|chiefdom|section|facility|community|school
        const params = new URLSearchParams({
            action:    'checkDuplicate',
            district:  parts[0] || '',
            chiefdom:  parts[1] || '',
            section:   parts[2] || '',
            facility:  parts[3] || '',
            community: parts[4] || '',
            school:    parts[5] || ''
        });
        const res = await Promise.race([
            fetch(CONFIG.SCRIPT_URL + '?' + params.toString()),
            new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), 5000))
        ]);
        if (!res.ok) return false;
        const data = await res.json();
        return !!data.exists;
    } catch(e) {
        console.warn('[DupCheck] Online check failed:', e.message);
        return false; // fail open — don't block if GAS unreachable
    }
}

// ── Central duplicate check (local first, then online) ───────
async function isDuplicateSubmission(key) {
    if (!key) return { duplicate: false, source: null };

    // 1. Check localStorage / session
    if (isSchoolSubmitted(key)) {
        return { duplicate: true, source: 'local' };
    }

    // 2. Check pending (offline queue)
    const inPending = state.pendingSubmissions.some(r => {
        return makeSchoolKey(r.district, r.chiefdom, r.section_loc,
                             r.facility, r.community, r.school_name) === key;
    });
    if (inPending) return { duplicate: true, source: 'pending' };

    // 3. Check already-fetched sheet rows from analysis (if available)
    if (window._sheetRows && window._sheetRows.length > 0) {
        const inSheet = window._sheetRows.some(r =>
            makeSchoolKey(r.district, r.chiefdom, r.section_loc,
                          r.facility, r.community, r.school_name) === key
        );
        if (inSheet) return { duplicate: true, source: 'online' };
    }

    // 4. Ask GAS directly
    const onlineDup = await checkDuplicateOnline(key);
    if (onlineDup) return { duplicate: true, source: 'online' };

    return { duplicate: false, source: null };
}

function setupSchoolSubmissionCheck() {
    const schoolSel = document.getElementById('school_name');
    if (!schoolSel) return;

    schoolSel.addEventListener('change', async function() {
        const key = currentSchoolKey();

        // Reset state when school changes
        _dupCheck.key       = key;
        _dupCheck.duplicate = false;
        _dupCheck.source    = null;
        _dupCheck.pending   = false;

        const banner  = document.getElementById('schoolSubmittedBanner');
        const nextBtn = document.querySelector('.form-section[data-section="2"] .btn-next');

        if (!key) {
            if (banner)  banner.style.display = 'none';
            if (nextBtn) { nextBtn.disabled = false; nextBtn.title = ''; }
            return;
        }

        // Show a subtle checking indicator on the Next button
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.title    = 'Checking for duplicate submission…';
        }
        _dupCheck.pending = true;

        const { duplicate, source } = await isDuplicateSubmission(key);

        // Only act if the user hasn't changed school while we were checking
        if (_dupCheck.key !== key) return;

        _dupCheck.pending   = false;
        _dupCheck.duplicate = duplicate;
        _dupCheck.source    = source;

        if (duplicate) {
            if (!document.getElementById('schoolSubmittedBanner')) injectSubmittedBanner();
            const b = document.getElementById('schoolSubmittedBanner');
            if (b) {
                // Update message based on source
                const srcLabel = source === 'online'  ? '(confirmed on Google Sheet)' :
                                 source === 'pending' ? '(in offline queue)'          :
                                                        '(submitted this session)';
                const msgEl = b.querySelector('.dup-source-msg');
                if (msgEl) msgEl.textContent = srcLabel;
                b.style.display = 'flex';
            }
            if (nextBtn) {
                nextBtn.disabled = true;
                nextBtn.title    = 'This school has already been submitted — duplicate entry not allowed.';
            }
        } else {
            if (banner)  banner.style.display = 'none';
            if (nextBtn) { nextBtn.disabled = false; nextBtn.title = ''; }
        }
    });
}

function injectSubmittedBanner() {
    const section2 = document.querySelector('.form-section[data-section="2"]');
    if (!section2) return;
    const banner = document.createElement('div');
    banner.id = 'schoolSubmittedBanner';
    banner.style.cssText = [
        'display:none',
        'background:#fff0f0',
        'border:2px solid #dc3545',
        'border-radius:10px',
        'padding:14px 16px',
        'margin-bottom:16px',
        'align-items:flex-start',
        'gap:12px'
    ].join(';');
    banner.innerHTML = `
      <svg style="width:28px;height:28px;stroke:#dc3545;flex-shrink:0;margin-top:2px" viewBox="0 0 24 24" fill="none" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:#c0392b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">
          ⛔ DUPLICATE — SUBMISSION NOT ALLOWED
        </div>
        <div style="font-size:12px;color:#555;line-height:1.6;">
          This school has <strong>already been submitted</strong> with the same District, Chiefdom, Section, PHU, Community and School Name.
          <span class="dup-source-msg" style="color:#004080;font-weight:600;"></span>
          <br>Please choose a <strong>different school</strong> or contact your supervisor.
          <br><a href="#" onclick="viewSubmittedSchoolFromBanner(); return false;"
             style="color:#004080;font-weight:600;text-decoration:underline;margin-top:4px;display:inline-block;">
             View existing submission details →
          </a>
        </div>
      </div>`;
    const nav = section2.querySelector('.navigation-buttons');
    if (nav) section2.insertBefore(banner, nav);
    else section2.appendChild(banner);
}

window.viewSubmittedSchoolFromBanner = function() {
    const key = currentSchoolKey();
    if (key) openSchoolDetail(key);
};

function currentSchoolKey() {
    try {
        const district  = document.getElementById('district')?.value    || '';
        const chiefdom  = document.getElementById('chiefdom')?.value    || '';
        const section   = document.getElementById('section_loc')?.value || '';
        const facility  = document.getElementById('facility')?.value    || '';
        const community = document.getElementById('community')?.value   || '';
        const school    = document.getElementById('school_name')?.value || '';
        if (!district||!chiefdom||!section||!facility||!community||!school) return null;
        return [district,chiefdom,section,facility,community,school]
            .map(s=>s.trim().toLowerCase()).join('|');
    } catch (e) { return null; }
}

function makeSchoolKey(district, chiefdom, section, facility, community, school) {
    return [district,chiefdom,section,facility,community,school]
        .map(s=>(s||'').toString().trim().toLowerCase()).join('|');
}

function isSchoolSubmitted(key) {
    if (!key) return false;
    return state.submittedSchools.some(s => s.key === key);
}

function getSubmittedRecord(key) {
    return state.submittedSchools.find(s => s.key === key) || null;
}

function getAllAssignedSchools() {
    const schools = [];
    const data = ALL_LOCATION_DATA; // always use full dataset (no login restriction)
    try {
        for (const district in data)
            for (const chiefdom in data[district])
                for (const section in data[district][chiefdom])
                    for (const facility in data[district][chiefdom][section])
                        for (const community in data[district][chiefdom][section][facility]) {
                            const schoolList = data[district][chiefdom][section][facility][community];
                            if (Array.isArray(schoolList))
                                schoolList.forEach(school => schools.push({
                                    district, chiefdom, section, facility, community,
                                    school_name: school,
                                    key: makeSchoolKey(district,chiefdom,section,facility,community,school)
                                }));
                        }
    } catch (e) { console.error('getAllAssignedSchools:', e); }
    return schools;
}

// ============================================
// SUMMARY MODAL
// ============================================
function updateSummaryBadge() {
    const btn = document.getElementById('viewSummaryBtn');
    if (!btn) return;
    const all = getAllAssignedSchools();
    const submitted = all.filter(s => isSchoolSubmitted(s.key)).length;
    const remaining = all.length - submitted;
    let badge = btn.querySelector('.summary-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'summary-badge';
        badge.style.cssText = 'background:#dc3545;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:4px;';
        btn.appendChild(badge);
    }
    badge.textContent = remaining > 0 ? remaining + ' left' : '✓ Done';
    badge.style.background = remaining > 0 ? '#dc3545' : '#28a745';
}

window.openSummaryModal = function() {
    const modal = document.getElementById('summaryModal');
    const body  = document.getElementById('summaryModalBody');
    const all   = getAllAssignedSchools();
    const total = all.length;
    const submitted = all.filter(s => isSchoolSubmitted(s.key));
    const pending   = all.filter(s => !isSchoolSubmitted(s.key));
    const pct = total > 0 ? Math.round((submitted.length / total) * 100) : 0;

    // Build district summary ONLY from actual submissions — no CSV data
    const byDist = {};
    submitted.forEach(s => {
        const dist = s.district || 'Unknown';
        if (!byDist[dist]) byDist[dist] = { submitted:0 };
        byDist[dist].submitted++;
    });

    let distRows = '';
    if (Object.keys(byDist).length === 0) {
        distRows = `<tr><td colspan="2" style="padding:20px;text-align:center;color:#aaa;font-style:italic;">No submissions yet</td></tr>`;
    } else {
        Object.entries(byDist).sort().forEach(([d, v]) => {
            distRows += `<tr>
              <td style="font-weight:600;text-align:left;padding:10px 15px;">${d}</td>
              <td style="text-align:center;padding:10px;color:#28a745;font-weight:700;font-size:15px;">${v.submitted}</td>
            </tr>`;
        });
    }

    // School list — ONLY submitted schools, nothing from CSV
    let schoolRows = '';
    if (submitted.length === 0) {
        schoolRows = `<tr><td colspan="9" style="padding:32px;text-align:center;color:#aaa;font-style:italic;">No submissions yet — schools will appear here once data is submitted.</td></tr>`;
    } else {
        submitted
          .sort((a,b)=>a.district.localeCompare(b.district)||a.chiefdom.localeCompare(b.chiefdom)||a.school_name.localeCompare(b.school_name))
          .forEach(s => {
              const rec      = getSubmittedRecord(s.key);
              const when     = rec ? formatDate(rec.timestamp) : '—';
              const coverage = rec?.data?.coverage_total ? rec.data.coverage_total+'%' : '—';
              schoolRows += `
                <tr style="cursor:pointer;background:#f0fff0;" onclick="openSchoolDetail('${s.key}')">
                  <td style="padding:10px 8px;text-align:left;">
                    <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#28a745;margin-right:8px;flex-shrink:0;"></span>
                    <strong>${s.school_name}</strong>
                  </td>
                  <td style="padding:10px 8px;text-align:center;font-size:12px;">${s.district}</td>
                  <td style="padding:10px 8px;text-align:center;font-size:12px;">${s.chiefdom||'—'}</td>
                  <td style="padding:10px 8px;text-align:center;font-size:12px;">${s.facility||'—'}</td>
                  <td style="padding:10px 8px;text-align:center;font-size:12px;">${s.community||'—'}</td>
                  <td style="padding:10px 8px;text-align:center;">
                    <span style="background:#28a745;color:#fff;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:600;letter-spacing:0.5px;">SUBMITTED</span>
                  </td>
                  <td style="padding:10px 8px;text-align:center;font-size:11px;color:#666;">${when}</td>
                  <td style="padding:10px 8px;text-align:center;font-weight:700;color:#28a745">${coverage}</td>
                  <td style="padding:10px 8px;text-align:center;">
                    <button onclick="event.stopPropagation();openSchoolDetail('${s.key}')" style="background:#004080;color:#fff;border:none;border-radius:4px;padding:5px 13px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Oswald',sans-serif;letter-spacing:0.5px;">VIEW</button>
                  </td>
                </tr>`;
          });
    }

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:15px;margin-bottom:25px;">
        <div style="background:#e8f5e9;border:2px solid #28a745;border-radius:10px;padding:20px 10px;text-align:center;">
          <div style="font-size:36px;font-weight:700;color:#28a745;">${submitted.length}</div>
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-top:5px;">Schools Submitted</div>
        </div>
        <div style="background:#fff8e1;border:2px solid #ffc107;border-radius:10px;padding:20px 10px;text-align:center;">
          <div style="font-size:36px;font-weight:700;color:#e6a800;">${Object.keys(byDist).length}</div>
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-top:5px;">Districts Covered</div>
        </div>
      </div>
      <div style="margin-bottom:25px;">
        <div style="background:#004080;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;font-size:14px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;text-align:center;">Submissions by District</div>
        <div style="overflow-x:auto;border:2px solid #dee2e6;border-top:none;border-radius:0 0 8px 8px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#f8f9fa;">
              <th style="padding:12px 15px;text-align:left;border-bottom:1px solid #dee2e6;">District</th>
              <th style="padding:12px;text-align:center;border-bottom:1px solid #dee2e6;">Submitted</th>
            </tr></thead>
            <tbody>${distRows}</tbody>
          </table>
        </div>
      </div>
      <div>
        <div style="background:#004080;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;font-size:14px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;">
          <span>Submitted Schools</span>
          <span style="font-size:12px;font-weight:400;opacity:.8;">Click any row to view details</span>
        </div>
        <div style="overflow-x:auto;border:2px solid #dee2e6;border-top:none;border-radius:0 0 8px 8px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:linear-gradient(135deg,#004080,#1a6abf);">
              <th style="padding:11px 12px;text-align:left;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">School</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">District</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">Chiefdom</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">PHU</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">Community</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">Status</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">Submitted</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">Coverage</th>
              <th style="padding:11px 10px;text-align:center;border-bottom:2px solid #dee2e6;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;text-transform:uppercase;">Action</th>
            </tr></thead>
            <tbody>${schoolRows}</tbody>
          </table>
        </div>
      </div>`;

    if (modal) modal.classList.add('show');
};

window.closeSummaryModal = function() {
    const modal = document.getElementById('summaryModal');
    if (modal) modal.classList.remove('show');
};

window.viewSummary = function() { openSummaryModal(); };

// ============================================
// SCHOOL DETAIL MODAL
// ============================================
window.openSchoolDetail = function(key) {
    const rec = getSubmittedRecord(key);
    if (!rec) {
        const school = getAllAssignedSchools().find(s => s.key === key);
        if (school && confirm('This school has not been submitted yet. Load it into the form now?'))
            loadSchoolIntoForm(key);
        return;
    }
    const d = rec.data;
    const modal = document.getElementById('schoolDetailModal');
    const title = document.getElementById('schoolDetailTitle');
    const body  = document.getElementById('schoolDetailBody');
    if (!modal || !title || !body) return;

    title.textContent = (d.school_name || 'School') + ' — Submission Detail';

    let classRows = '';
    for (let c = 1; c <= 5; c++) {
        const boys=parseInt(d['c'+c+'_boys'])||0, girls=parseInt(d['c'+c+'_girls'])||0,
              boysITN=parseInt(d['c'+c+'_boys_itn'])||0, girlsITN=parseInt(d['c'+c+'_girls_itn'])||0;
        const total=boys+girls, itn=boysITN+girlsITN;
        const cov=total>0?Math.round((itn/total)*100):0;
        classRows += `<tr>
          <td style="font-weight:600;text-align:left;padding:8px 12px;">Class ${c}</td>
          <td style="text-align:center;padding:8px;">${boys}</td><td style="text-align:center;padding:8px;">${boysITN}</td>
          <td style="text-align:center;padding:8px;">${girls}</td><td style="text-align:center;padding:8px;">${girlsITN}</td>
          <td style="text-align:center;padding:8px;font-weight:700;">${total}</td>
          <td style="text-align:center;padding:8px;font-weight:700;">${itn}</td>
          <td style="text-align:center;padding:8px;font-weight:700;color:${cov>=80?'#28a745':cov>=50?'#e6a800':'#dc3545'};">${cov}%</td>
        </tr>`;
    }

    const totBoys=parseInt(d.total_boys)||0, totGirls=parseInt(d.total_girls)||0,
          totPupils=parseInt(d.total_pupils)||0, totBoysITN=parseInt(d.total_boys_itn)||0,
          totGirlsITN=parseInt(d.total_girls_itn)||0, totITN=parseInt(d.total_itn)||0,
          coverage=parseInt(d.coverage_total)||0, covBoys=parseInt(d.coverage_boys)||0,
          covGirls=parseInt(d.coverage_girls)||0, remaining=parseInt(d.itns_remaining)||0;

    const itnTypes = [d.itn_type_pbo==='Yes'?'PBO':'', d.itn_type_ig2==='Yes'?'IG2':'']
        .filter(Boolean).join(', ') || '—';

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:25px;">
        ${infoCard('District',d.district||'—')}${infoCard('Chiefdom',d.chiefdom||'—')}
        ${infoCard('Section',d.section_loc||'—')}${infoCard('Health Facility',d.facility||'—')}
        ${infoCard('Community',d.community||'—')}${infoCard('School',d.school_name||'—')}
        ${infoCard('Head Teacher',d.head_teacher||'—')}${infoCard('HT Phone',d.head_teacher_phone||'—')}
        ${infoCard('Distribution Date',d.distribution_date||'—')}${infoCard('Survey Date',d.survey_date||'—')}
        ${infoCard('Submitted At',formatDate(rec.timestamp))}${infoCard('Submitted By',d.submitted_by||'—')}
        ${infoCard('ITN Type(s)',itnTypes)}${infoCard('ITNs Received',d.itns_received||'—')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:25px;">
        ${statCard('Total Pupils',totPupils,'#004080')}
        ${statCard('ITNs Distributed',totITN,'#28a745')}
        ${statCard('ITNs Remaining',remaining,remaining<0?'#dc3545':'#fd7e14')}
        ${statCard('Coverage',coverage+'%',coverage>=80?'#28a745':coverage>=50?'#e6a800':'#dc3545')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:25px;">
        ${statCard('Boys Enrolled',totBoys,'#004080')}${statCard('Boys ITN Coverage',covBoys+'%','#004080')}${statCard('Boys Received ITN',totBoysITN,'#004080')}
        ${statCard('Girls Enrolled',totGirls,'#e91e8c')}${statCard('Girls ITN Coverage',covGirls+'%','#e91e8c')}${statCard('Girls Received ITN',totGirlsITN,'#e91e8c')}
      </div>
      <div style="background:#004080;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;font-size:14px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;text-align:center;">Class-by-Class Breakdown</div>
      <div style="overflow-x:auto;border:2px solid #dee2e6;border-top:none;border-radius:0 0 8px 8px;margin-bottom:25px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f8f9fa;">
            <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #dee2e6;">Class</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">Boys</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">Boys ITN</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">Girls</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">Girls ITN</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">Total</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">ITN</th>
            <th style="padding:10px;text-align:center;border-bottom:1px solid #dee2e6;">Coverage</th>
          </tr></thead>
          <tbody>
            ${classRows}
            <tr style="background:#e8f1fa;font-weight:700;">
              <td style="padding:10px 12px;">TOTAL</td>
              <td style="text-align:center;padding:10px;">${totBoys}</td><td style="text-align:center;padding:10px;">${totBoysITN}</td>
              <td style="text-align:center;padding:10px;">${totGirls}</td><td style="text-align:center;padding:10px;">${totGirlsITN}</td>
              <td style="text-align:center;padding:10px;">${totPupils}</td><td style="text-align:center;padding:10px;">${totITN}</td>
              <td style="text-align:center;padding:10px;color:${coverage>=80?'#28a745':coverage>=50?'#e6a800':'#dc3545'};font-size:15px;">${coverage}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${buildTeamSection(d)}
      ${d.gps_lat ? `
      <div style="background:#e8f1fa;border:2px solid #004080;border-radius:8px;padding:15px 20px;font-size:13px;text-align:center;">
        <strong style="color:#004080;display:block;margin-bottom:5px;">GPS COORDINATES</strong>
        <div style="font-family:monospace;font-size:14px;">${d.gps_lat}, ${d.gps_lng}</div>
        ${d.gps_acc?'<div style="color:#666;margin-top:5px;font-size:11px;">Accuracy: ±'+d.gps_acc+'m</div>':''}
      </div>` : ''}`;

    closeSummaryModal();
    if (modal) modal.classList.add('show');
};

function infoCard(label, value) {
    return `<div style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:7px;padding:12px 15px;text-align:center;">
      <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${label}</div>
      <div style="font-size:14px;font-weight:600;color:#333;">${value}</div>
    </div>`;
}

function statCard(label, value, color) {
    return `<div style="background:#fff;border:2px solid ${color}20;border-radius:10px;padding:15px 10px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:${color};line-height:1.2;">${value}</div>
      <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-top:5px;">${label}</div>
    </div>`;
}

function buildTeamSection(d) {
    let html = '<div style="margin-bottom:20px;"><div style="background:#004080;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;font-size:14px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;text-align:center;">Team Members</div>';
    html += '<div style="border:2px solid #dee2e6;border-top:none;border-radius:0 0 8px 8px;padding:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:15px;">';
    for (let i = 1; i <= 3; i++) {
        const name = d['team'+i+'_name']||'', phone = d['team'+i+'_phone']||'';
        if (name) html += `<div style="background:#f8f9fa;border-radius:8px;padding:15px;text-align:center;">
          <div style="font-size:11px;color:#004080;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Member ${i}</div>
          <div style="font-size:14px;font-weight:600;">${name}</div>
          ${phone?`<div style="font-size:12px;color:#666;margin-top:4px;">${phone}</div>`:''}
        </div>`;
    }
    html += '</div></div>';
    return html;
}

window.closeSchoolDetailModal = function() {
    const modal = document.getElementById('schoolDetailModal');
    if (modal) modal.classList.remove('show');
};

// ============================================
// LOAD SCHOOL INTO FORM
// ============================================
window.loadSchoolIntoForm = function(key) {
    const school = getAllAssignedSchools().find(s => s.key === key);
    if (!school) return;
    closeSummaryModal();
    document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
    state.currentSection = 2;
    const section2 = document.querySelector('.form-section[data-section="2"]');
    if (section2) section2.classList.add('active');
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const chain = [
        ['district',    school.district],
        ['chiefdom',    school.chiefdom],
        ['section_loc', school.section],
        ['facility',    school.facility],
        ['community',   school.community],
        ['school_name', school.school_name]
    ];
    let delay = 0;
    chain.forEach(([id, val]) => {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event('change')); }
        }, delay);
        delay += 100;
    });
    showNotification('Loaded: ' + school.school_name, 'info');
};

// ============================================
// NAVIGATION
// ============================================
window.nextSection = function() {
    if (state.currentSection === 1) { moveToNextSection(); return; }
    if (validateCurrentSection()) moveToNextSection();
};

window.previousSection = function() {
    if (state.currentSection > 1) {
        document.querySelector('.form-section[data-section="'+state.currentSection+'"]')?.classList.remove('active');
        state.currentSection--;
        document.querySelector('.form-section[data-section="'+state.currentSection+'"]')?.classList.add('active');
        updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

function moveToNextSection() {
    if (state.currentSection < state.totalSections) {
        document.querySelector('.form-section[data-section="'+state.currentSection+'"]')?.classList.remove('active');
        state.currentSection++;
        document.querySelector('.form-section[data-section="'+state.currentSection+'"]')?.classList.add('active');
        updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (state.currentSection === 4) calculateAll();
    }
}

function validateCurrentSection() {
    const section = document.querySelector('.form-section[data-section="'+state.currentSection+'"]');
    if (!section) return true;
    if (state.currentSection === 1) return true;

    if (state.currentSection === 2) {
        const key = currentSchoolKey();
        // Use cached result from async check — or re-check local synchronously
        if (key && (_dupCheck.duplicate || isSchoolSubmitted(key))) {
            const src = _dupCheck.source === 'online' ? ' (confirmed on Google Sheet)' :
                        _dupCheck.source === 'pending' ? ' (in offline queue)' :
                        ' (submitted this session)';
            showNotification('⛔ Duplicate entry blocked — this school has already been submitted' + src + '.', 'error');
            return false;
        }
    }

    let isValid = true, firstInvalid = null;
    section.querySelectorAll('input[required], select[required]').forEach(field => {
        if (field.type === 'hidden') return;
        if (!field.value || field.value.trim() === '') {
            isValid = false; field.classList.add('error');
            document.getElementById('error_'+field.id)?.classList.add('show');
            if (!firstInvalid) firstInvalid = field;
        } else {
            field.classList.remove('error');
            document.getElementById('error_'+field.id)?.classList.remove('show');
        }
    });

    if (state.currentSection === 3) {
        const pbo = document.getElementById('itn_type_pbo')?.checked||false;
        const ig2 = document.getElementById('itn_type_ig2')?.checked||false;
        if (!pbo && !ig2) {
            isValid = false;
            document.getElementById('error_itn_type')?.classList.add('show');
            showNotification('Please select at least one ITN type.', 'error');
        } else {
            document.getElementById('error_itn_type')?.classList.remove('show');
        }
        if ((pbo || ig2) && !validateITNQuantities()) isValid = false;
        document.querySelectorAll('.itn-field').forEach(field => {
            const maxField = document.getElementById(field.getAttribute('data-max-field'));
            if (maxField && (parseInt(field.value)||0) > (parseInt(maxField.value)||0)) {
                isValid = false; field.classList.add('error');
                document.getElementById('error_'+field.id)?.classList.add('show');
            }
        });
    }

    if (!isValid) {
        showNotification('Please fill in all required fields correctly.', 'error');
        firstInvalid?.focus();
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return isValid;
}

function updateProgress() {
    const pf = document.getElementById('progressFill');
    const pt = document.getElementById('progressText');
    if (pf) pf.style.width = (state.currentSection / state.totalSections * 100) + '%';
    if (pt) pt.textContent = 'SECTION ' + state.currentSection + ' OF ' + state.totalSections;
}

// ============================================
// VALIDATION
// ============================================
function setupValidation() {
    document.querySelectorAll('.itn-field').forEach(input => {
        input.addEventListener('input', function() { validateITNField(this); calculateAll(); });
    });
    document.querySelectorAll('.enrollment-field').forEach(input => {
        input.addEventListener('input', function() {
            const itnField = document.getElementById('c'+this.dataset.class+'_'+this.dataset.gender+'_itn');
            if (itnField) validateITNField(itnField);
            calculateAll();
        });
    });
}

function validateITNField(itnInput) {
    if (!itnInput) return true;
    const maxField = document.getElementById(itnInput.dataset.maxField);
    if (!maxField) return true;
    const maxVal = parseInt(maxField.value)||0, itnVal = parseInt(itnInput.value)||0;
    const errorEl = document.getElementById('error_'+itnInput.id);
    if (itnVal > maxVal) { itnInput.classList.add('error'); errorEl?.classList.add('show'); return false; }
    itnInput.classList.remove('error'); errorEl?.classList.remove('show'); return true;
}

// ============================================
// ITN TYPE QUANTITY
// ============================================
window.toggleITNTypeQuantity = function() {
    const pbo = document.getElementById('itn_type_pbo')?.checked||false;
    const ig2 = document.getElementById('itn_type_ig2')?.checked||false;
    const qtyFields = document.getElementById('itn_quantity_fields');
    if (qtyFields) qtyFields.style.display = (pbo||ig2)?'block':'none';
    const pboGroup = document.getElementById('pbo_quantity_group');
    if (pboGroup) pboGroup.style.display = pbo?'block':'none';
    const ig2Group = document.getElementById('ig2_quantity_group');
    if (ig2Group) ig2Group.style.display = ig2?'block':'none';
    if (!pbo) { const el=document.getElementById('itn_qty_pbo'); if(el) el.value=0; }
    if (!ig2) { const el=document.getElementById('itn_qty_ig2'); if(el) el.value=0; }
    validateITNQuantities();
};

function validateITNQuantities() {
    const received = parseInt(document.getElementById('itns_received')?.value)||0;
    const pbo = document.getElementById('itn_type_pbo')?.checked||false;
    const ig2 = document.getElementById('itn_type_ig2')?.checked||false;
    if (!pbo && !ig2) return true;
    const pboQty = parseInt(document.getElementById('itn_qty_pbo')?.value)||0;
    const ig2Qty = parseInt(document.getElementById('itn_qty_ig2')?.value)||0;
    const fromTypes = pboQty + ig2Qty;
    const totalEl = document.getElementById('itn_type_total');
    const statusEl = document.getElementById('itn_qty_status');
    const errEl = document.getElementById('error_itn_qty_mismatch');
    if (totalEl) totalEl.textContent = fromTypes;
    if (received > 0) {
        if (fromTypes === received) {
            if (statusEl) { statusEl.textContent = '✓ Matches total received'; statusEl.className = 'qty-status match'; }
            if (errEl) errEl.style.display = 'none';
            return true;
        } else {
            if (statusEl) { statusEl.textContent = '✗ Does not match ('+received+' received)'; statusEl.className = 'qty-status mismatch'; }
            if (errEl) errEl.style.display = 'block';
            return false;
        }
    }
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'qty-status'; }
    if (errEl) errEl.style.display = 'none';
    return true;
}

// ============================================
// PHONE VALIDATION
// ============================================
function setupPhoneValidation() {
    document.querySelectorAll('.phone-field').forEach(input => {
        input.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g,'').slice(0,9);
            validatePhoneField(this);
        });
    });
}

function validatePhoneField(input) {
    if (!input) return true;
    const errorEl = document.getElementById('error_'+input.id);
    const isReq = input.hasAttribute('required');
    const val = input.value.trim();
    if (val===''&&!isReq) { input.classList.remove('error'); errorEl?.classList.remove('show'); return true; }
    if (val.length!==9||!/^\d{9}$/.test(val)) { input.classList.add('error'); errorEl?.classList.add('show'); return false; }
    input.classList.remove('error'); errorEl?.classList.remove('show'); return true;
}

// ============================================
// NAME VALIDATION
// ============================================
function setupNameValidation() {
    document.querySelectorAll('.name-field').forEach(input => {
        input.addEventListener('input',  function() { this.value = this.value.replace(/[0-9]/g,''); });
        input.addEventListener('blur',   function() { validateNameField(this); });
    });
}

function validateNameField(input) {
    if (!input) return true;
    const errorEl = document.getElementById('error_'+input.id);
    const isReq = input.hasAttribute('required');
    const val = input.value.trim();
    if (val===''&&!isReq) { input.classList.remove('error'); errorEl?.classList.remove('show'); return true; }
    if (val===''&&isReq)  { input.classList.add('error'); errorEl?.classList.add('show'); return false; }
    if (/[0-9]/.test(val)) {
        input.classList.add('error');
        if (errorEl) { errorEl.textContent='Name cannot contain numbers'; errorEl.classList.add('show'); }
        return false;
    }
    if (val.length < 2) {
        input.classList.add('error');
        if (errorEl) { errorEl.textContent='Name must be at least 2 characters'; errorEl.classList.add('show'); }
        return false;
    }
    input.classList.remove('error'); errorEl?.classList.remove('show'); return true;
}

// ============================================
// CALCULATIONS
// ============================================
function setupCalculations() {
    document.querySelectorAll('.enrollment-field, .itn-field').forEach(input => {
        input.addEventListener('input', calculateAll);
    });
    const rec = document.getElementById('itns_received');
    if (rec) rec.addEventListener('input', () => { calculateAll(); validateITNQuantities(); });
}

function getNum(id) { const el=document.getElementById(id); return el?(parseInt(el.value)||0):0; }
function setText(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
function setVal(id,v) { const el=document.getElementById(id); if(el) el.value=v; }

function calculateAll() {
    try {
        let tB=0,tG=0,tBI=0,tGI=0;
        for (let c=1;c<=5;c++) {
            const b=getNum('c'+c+'_boys'), bi=getNum('c'+c+'_boys_itn'),
                  g=getNum('c'+c+'_girls'), gi=getNum('c'+c+'_girls_itn');
            tB+=b; tG+=g; tBI+=bi; tGI+=gi;
            setText('t'+c+'_b',b); setText('t'+c+'_bi',bi);
            setText('t'+c+'_g',g); setText('t'+c+'_gi',gi);
            setText('t'+c+'_t',b+g); setText('t'+c+'_ti',bi+gi);
            setText('t'+c+'_c',(b+g)>0?Math.round(((bi+gi)/(b+g))*100)+'%':'0%');
        }
        const tp=tB+tG, ti=tBI+tGI;
        setText('sum_total_boys',tB); setText('sum_total_girls',tG); setText('sum_total_pupils',tp);
        setText('sum_boys_itn',tBI); setText('sum_girls_itn',tGI); setText('sum_total_itn',ti);
        setVal('total_boys',tB); setVal('total_girls',tG); setVal('total_pupils',tp);
        setVal('total_boys_itn',tBI); setVal('total_girls_itn',tGI); setVal('total_itn',ti);
        const received=getNum('itns_received'), remaining=received-ti;
        setText('itns_remaining',remaining); setVal('itns_remaining_val',remaining);
        const rs=document.getElementById('remaining_status');
        if (rs) {
            if (remaining<0) { rs.textContent='Warning: More ITNs distributed than received!'; rs.className='remaining-status warning'; }
            else if (remaining===0&&received>0) { rs.textContent='All ITNs distributed'; rs.className='remaining-status success'; }
            else { rs.textContent=''; rs.className='remaining-status'; }
        }
        const boysPct=tp>0?Math.round((tB/tp)*100):0, girlsPct=tp>0?Math.round((tG/tp)*100):0;
        setText('prop_boys',boysPct+'%'); setText('prop_girls',girlsPct+'%');
        setVal('prop_boys_val',boysPct); setVal('prop_girls_val',girlsPct);
        const bb=document.getElementById('bar_boys'); if(bb) bb.style.width=boysPct+'%';
        const gb=document.getElementById('bar_girls'); if(gb) gb.style.width=girlsPct+'%';
        const bc=tB>0?Math.round((tBI/tB)*100):0, gc=tG>0?Math.round((tGI/tG)*100):0,
              tc=tp>0?Math.round((ti/tp)*100):0;
        setText('cov_boys',bc+'%'); setText('cov_girls',gc+'%'); setText('cov_total',tc+'%');
        setVal('coverage_boys',bc); setVal('coverage_girls',gc); setVal('coverage_total',tc);
        setText('tt_b',tB); setText('tt_bi',tBI); setText('tt_g',tG); setText('tt_gi',tGI);
        setText('tt_t',tp); setText('tt_ti',ti);
        setText('tt_c',tp>0?Math.round((ti/tp)*100)+'%':'0%');
        updateCharts();
    } catch (e) { console.error('calculateAll:', e); }
}

// ============================================
// CHARTS (form section D)
// ============================================
function updateCharts() {
    try {
        const tB=getNum('total_boys'), tG=getNum('total_girls'),
              bi=getNum('total_boys_itn'), gi=getNum('total_girls_itn');
        const donutOpts = { responsive:true, maintainAspectRatio:true, plugins:{ legend:{ position:'bottom' } } };

        const c1=document.getElementById('chartEnrollment');
        if (c1) { if(state.charts.enrollment) state.charts.enrollment.destroy();
            state.charts.enrollment=new Chart(c1,{type:'doughnut',data:{labels:['Boys','Girls'],datasets:[{data:[tB,tG],backgroundColor:['#004080','#e91e8c'],borderWidth:2,borderColor:'#fff'}]},options:donutOpts}); }

        const c2=document.getElementById('chartITN');
        if (c2) { if(state.charts.itn) state.charts.itn.destroy();
            state.charts.itn=new Chart(c2,{type:'doughnut',data:{labels:['Boys','Girls'],datasets:[{data:[bi,gi],backgroundColor:['#004080','#e91e8c'],borderWidth:2,borderColor:'#fff'}]},options:donutOpts}); }

        const c3=document.getElementById('chartCoverage');
        if (c3) {
            const covs=[];
            for(let c=1;c<=5;c++){const t=getNum('c'+c+'_boys')+getNum('c'+c+'_girls'),i=getNum('c'+c+'_boys_itn')+getNum('c'+c+'_girls_itn');covs.push(t>0?Math.round((i/t)*100):0);}
            if(state.charts.coverage) state.charts.coverage.destroy();
            state.charts.coverage=new Chart(c3,{type:'bar',data:{labels:['Class 1','Class 2','Class 3','Class 4','Class 5'],datasets:[{label:'Coverage %',data:covs,backgroundColor:covs.map(v=>v>=80?'#28a745':v>=50?'#f0a500':'#dc3545'),borderWidth:0,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:true,scales:{y:{beginAtZero:true,max:100}},plugins:{legend:{display:false}}}});
        }
    } catch (e) { console.error('updateCharts:', e); }
}

// ============================================
// GPS
// ============================================
window.captureGPS = function() {
    const icon=document.getElementById('gps_icon'), status=document.getElementById('gps_status'), coords=document.getElementById('gps_coords');
    if (!navigator.geolocation) { if(icon)icon.classList.add('error'); if(status)status.textContent='GPS not supported'; return; }
    if(icon)icon.classList.add('loading'); if(status)status.textContent='Capturing GPS...';
    navigator.geolocation.getCurrentPosition(
        pos => {
            const {latitude,longitude,accuracy}=pos.coords;
            setVal('gps_lat',latitude.toFixed(6)); setVal('gps_lng',longitude.toFixed(6)); setVal('gps_acc',Math.round(accuracy));
            if(icon){icon.classList.remove('loading');icon.classList.add('success');}
            if(status)status.textContent='GPS captured!';
            if(coords)coords.textContent=latitude.toFixed(5)+', '+longitude.toFixed(5)+' (±'+Math.round(accuracy)+'m)';
        },
        () => { if(icon){icon.classList.remove('loading');icon.classList.add('error');} if(status)status.textContent='GPS failed (optional)'; },
        {enableHighAccuracy:true,timeout:30000,maximumAge:0}
    );
};

// ============================================
// SIGNATURE PADS
// ============================================
function initAllSignaturePads() { for(let i=1;i<=3;i++) initTeamSignaturePad(i); }

function initTeamSignaturePad(n) {
    const canvas=document.getElementById('sig'+n+'Canvas'); if(!canvas) return;
    canvas.width=canvas.parentElement.offsetWidth-10; canvas.height=100;
    state.signaturePads[n]=new SignaturePad(canvas,{backgroundColor:'#fff',penColor:'#000'});
    state.signaturePads[n].addEventListener('endStroke',()=>{
        const h=document.getElementById('team'+n+'_signature'); if(h) h.value=state.signaturePads[n].toDataURL();
    });
}

window.clearTeamSignature = function(n) {
    if(state.signaturePads[n]){state.signaturePads[n].clear();const h=document.getElementById('team'+n+'_signature');if(h)h.value='';}
};

function clearSignature() { for(let i=1;i<=3;i++) clearTeamSignature(i); }

// ============================================
// ============================================
// SILENT AUTO-SAVE & AUTO-RESTORE
// Saves every field change to localStorage automatically.
// Restores silently on next load — no banners, no buttons.
// ============================================
const DRAFT_KEY = 'itn_single_draft';

function collectDraftData() {
    const formData = new FormData(document.getElementById('dataForm'));
    const data = {
        _savedAt:        new Date().toISOString(),
        _currentSection: state.currentSection,
        itn_type_pbo:    document.getElementById('itn_type_pbo')?.checked || false,
        itn_type_ig2:    document.getElementById('itn_type_ig2')?.checked || false,
    };
    for (const [k, v] of formData.entries()) data[k] = v;
    return data;
}

function autoSaveDraft() {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraftData()));
    } catch(e) {}
}

function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch(e) {}
    state.currentDraftId = null;
    state.drafts = [];
    saveToStorage();
    updateCounts();
}

// Called from startApp — silently restores previous session if exists
function restoreDraftIfExists() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft || !draft._savedAt) return;
        _applyDraft(draft);
    } catch(e) { console.warn('[AutoSave] Restore failed:', e.message); }
}

function _applyDraft(draft) {
    const geoChain = [
        ['district',    draft.district],
        ['chiefdom',    draft.chiefdom],
        ['section_loc', draft.section_loc],
        ['facility',    draft.facility],
        ['community',   draft.community],
        ['school_name', draft.school_name]
    ];
    let delay = 0;
    geoChain.forEach(([elId, val]) => {
        if (!val) return;
        setTimeout(() => {
            const el = document.getElementById(elId);
            if (el) { el.value = val; el.dispatchEvent(new Event('change')); }
        }, delay);
        delay += 120;
    });

    const skip = new Set([
        '_savedAt','_currentSection','itn_type_pbo','itn_type_ig2',
        'district','chiefdom','section_loc','facility','community','school_name'
    ]);
    setTimeout(() => {
        Object.entries(draft).forEach(([k, v]) => {
            if (skip.has(k)) return;
            const el = document.getElementById(k);
            if (el && el.type !== 'hidden') el.value = v;
        });
        const pbo = document.getElementById('itn_type_pbo');
        const ig2 = document.getElementById('itn_type_ig2');
        if (pbo) pbo.checked = !!draft.itn_type_pbo;
        if (ig2) ig2.checked = !!draft.itn_type_ig2;
        toggleITNTypeQuantity();

        const sec = parseInt(draft._currentSection) || 1;
        document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
        state.currentSection = sec;
        document.querySelector('.form-section[data-section="'+sec+'"]')?.classList.add('active');
        updateProgress();
        calculateAll();
    }, delay + 100);
}

function setupAutoSave() {
    const form = document.getElementById('dataForm');
    if (!form) return;
    let _t = null;
    const trigger = () => { clearTimeout(_t); _t = setTimeout(autoSaveDraft, 600); };
    form.addEventListener('input',  trigger);
    form.addEventListener('change', trigger);
}

// ── No-op stubs (keep compat with any old HTML references) ───
window.saveDraftNow       = function() {};
window.resumeDraft        = function() {};
window.discardDraft       = function() {};
window.showDraftNameModal = function() {};
window.cancelDraftName    = function() {};
window.confirmSaveDraft   = function() {};
window.openDraftsModal    = function() {};
window.closeDraftsModal   = function() {};
window.loadDraft          = function() {};
window.deleteDraft        = function() {};
function generateDraftName() { return 'Draft'; }
function updateDraftIndicator() {}

// ============================================
// FINALIZE & SUBMIT
// ============================================
window.finalizeForm = function() {
    for(let s=2;s<=state.totalSections;s++){
        state.currentSection=s;
        if(!validateCurrentSection()){
            document.querySelectorAll('.form-section').forEach(sec=>sec.classList.remove('active'));
            document.querySelector('.form-section[data-section="'+s+'"]')?.classList.add('active');
            updateProgress(); return;
        }
    }
    const pbo=document.getElementById('itn_type_pbo')?.checked||false;
    const ig2=document.getElementById('itn_type_ig2')?.checked||false;
    if(!pbo&&!ig2){
        showNotification('Please select at least one ITN type.','error');
        state.currentSection=3;
        document.querySelectorAll('.form-section').forEach(s=>s.classList.remove('active'));
        document.querySelector('.form-section[data-section="3"]')?.classList.add('active');
        updateProgress(); return;
    }
    if(!validateITNQuantities()){
        showNotification('ITN type quantities must equal total ITNs received.','error');
        state.currentSection=3;
        document.querySelectorAll('.form-section').forEach(s=>s.classList.remove('active'));
        document.querySelector('.form-section[data-section="3"]')?.classList.add('active');
        updateProgress(); return;
    }
    const team1Sig=document.getElementById('team1_signature');
    if(!team1Sig||!team1Sig.value){ showNotification('Please provide Team Member 1 signature.','error'); return; }
    state.formStatus='finalized';
    const formStatus=document.getElementById('form_status'); if(formStatus) formStatus.value='finalized';
    const submittedBy=document.getElementById('submitted_by'); if(submittedBy) submittedBy.value=state.currentUser||'';
    const submitBtn=document.getElementById('submitBtn'); if(submitBtn) submitBtn.disabled=false;
    const finalizeBtn=document.getElementById('finalizeBtn'); if(finalizeBtn) finalizeBtn.disabled=true;
    showNotification('Form finalized! You can now submit.','success');
};

async function handleSubmit(e) {
    e.preventDefault();
    if(state.formStatus!=='finalized'){ showNotification('Please finalize the form first.','error'); return; }

    const formData=new FormData(e.target);
    const data={timestamp:new Date().toISOString(),submitted_by:state.currentUser||''};
    for(const [k,v] of formData.entries()) data[k]=v;
    const pbo=document.getElementById('itn_type_pbo'), ig2=document.getElementById('itn_type_ig2');
    data.itn_type_pbo=pbo&&pbo.checked?'Yes':'No';
    data.itn_type_ig2=ig2&&ig2.checked?'Yes':'No';

    // ── FINAL DUPLICATE GUARD ──────────────────────────────
    // Re-check one last time (catches any race condition between
    // school selection and reaching submit).
    const submitKey = makeSchoolKey(
        data.district, data.chiefdom, data.section_loc,
        data.facility, data.community, data.school_name
    );

    const submitBtn=document.getElementById('submitBtn');
    if(submitBtn){ submitBtn.disabled=true; submitBtn.innerHTML='<svg class="nav-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> CHECKING...'; }

    const { duplicate: isDup, source: dupSrc } = await isDuplicateSubmission(submitKey);
    if (isDup) {
        const srcLabel = dupSrc === 'online'  ? ' — found on Google Sheet'   :
                         dupSrc === 'pending' ? ' — already in offline queue' :
                                                ' — submitted this session';
        showNotification('⛔ DUPLICATE BLOCKED: This school was already submitted' + srcLabel + '.', 'error');

        // Scroll back to section 2 so user can see the banner
        document.querySelectorAll('.form-section').forEach(s=>s.classList.remove('active'));
        state.currentSection = 2;
        document.querySelector('.form-section[data-section="2"]')?.classList.add('active');
        updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Make sure banner is visible
        if (!document.getElementById('schoolSubmittedBanner')) injectSubmittedBanner();
        const b = document.getElementById('schoolSubmittedBanner');
        if (b) {
            const msgEl = b.querySelector('.dup-source-msg');
            if (msgEl) msgEl.textContent = srcLabel.replace(' — ', ' ');
            b.style.display = 'flex';
        }
        const nextBtn = document.querySelector('.form-section[data-section="2"] .btn-next');
        if (nextBtn) { nextBtn.disabled = true; nextBtn.title = 'Duplicate — submission blocked.'; }

        state.formStatus = 'draft';
        const formStatus = document.getElementById('form_status');
        if (formStatus) formStatus.value = 'draft';
        const finalizeBtn = document.getElementById('finalizeBtn');
        if (finalizeBtn) finalizeBtn.disabled = false;
        if(submitBtn){ submitBtn.disabled=true; submitBtn.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> SUBMIT'; }
        return;
    }
    // ── END DUPLICATE GUARD ────────────────────────────────

    if(submitBtn){ submitBtn.innerHTML='<svg class="nav-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> SUBMITTING...'; }

    if(state.isOnline){
        try{
            await fetch(CONFIG.SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
            markSchoolSubmitted(data);
            if(state.currentDraftId) state.drafts=state.drafts.filter(d=>d.draftId!==state.currentDraftId);
            clearDraft();
            saveToStorage(); updateCounts(); updateSummaryBadge();
            showNotification('✅ Submitted successfully!','success'); resetForm();
        } catch(err){ saveOffline(data); }
    } else { saveOffline(data); }
    if(submitBtn){ submitBtn.disabled=false; submitBtn.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> SUBMIT'; }
}

function markSchoolSubmitted(data) {
    const key=makeSchoolKey(data.district,data.chiefdom,data.section_loc,data.facility,data.community,data.school_name);
    if(!isSchoolSubmitted(key))
        state.submittedSchools.push({key,district:data.district,chiefdom:data.chiefdom,section:data.section_loc,facility:data.facility,community:data.community,school_name:data.school_name,timestamp:data.timestamp,data});
}

function saveOffline(data) {
    state.pendingSubmissions.push(data);
    markSchoolSubmitted(data);
    clearDraft();
    saveToStorage(); updateCounts(); updateSummaryBadge();
    showNotification('Saved offline. Will sync when online.','info'); resetForm();
}

function resetForm() {
    document.getElementById('dataForm').reset();
    clearSignature();
    state.currentSection=1; state.currentDraftId=null; state.formStatus='draft';
    document.querySelectorAll('.form-section').forEach(s=>s.classList.remove('active'));
    document.querySelector('.form-section[data-section="1"]')?.classList.add('active');
    const submitBtn=document.getElementById('submitBtn'); if(submitBtn) submitBtn.disabled=true;
    const finalizeBtn=document.getElementById('finalizeBtn'); if(finalizeBtn) finalizeBtn.disabled=false;
    const sbField=document.getElementById('submitted_by'); if(sbField) sbField.value=state.currentUser||'';
    const banner=document.getElementById('schoolSubmittedBanner'); if(banner) banner.style.display='none';
    const nextBtn=document.querySelector('.form-section[data-section="2"] .btn-next');
    if(nextBtn){ nextBtn.disabled=false; nextBtn.title=''; }
    ['chiefdom','section_loc','facility','community','school_name'].forEach(id=>{
        const el=document.getElementById(id); if(el){el.innerHTML='<option value="">Select...</option>';el.disabled=true;}
    });
    ['chiefdom','section_loc','facility','community','school_name'].forEach(clearCount);
    updateProgress(); setDefaultDate(); captureGPS(); calculateAll();
    setTimeout(()=>initAllSignaturePads(),100);
}

// ============================================
// DOWNLOAD DATA
// ============================================
function downloadData() {
    const allData=[...state.pendingSubmissions,...state.drafts];
    if(allData.length===0){ showNotification('No data to download.','info'); return; }
    const keys=new Set(); allData.forEach(item=>Object.keys(item).forEach(k=>keys.add(k)));
    const headers=Array.from(keys);
    let csv=headers.join(',')+'\n';
    allData.forEach(item=>{
        csv+=headers.map(h=>{
            let v=item[h]||'';
            if(typeof v==='string'&&(v.includes(',')||v.includes('"')||v.includes('\n'))) v='"'+v.replace(/"/g,'""')+'"';
            return v;
        }).join(',')+'\n';
    });
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='itn_data_'+new Date().toISOString().split('T')[0]+'.csv';
    a.click(); URL.revokeObjectURL(a.href);
    showNotification('Data downloaded!','success');
}

// ============================================
// ANALYSIS  (overridden by ai_agent.js)
// ============================================
window.openAnalysisModal = function() {
    // This is overridden by ai_agent.js with the full dashboard.
    // Fallback: open the analysis modal if it exists.
    const modal = document.getElementById('analysisModal');
    if (modal) modal.classList.add('show');
};

window.closeAnalysisModal = function() {
    document.getElementById('analysisModal')?.classList.remove('show');
};

// ============================================
// UTILITIES
// ============================================
function checkAdmin() {
    // No login required — always admin
    return true;
}

function updateOnlineStatus() {
    const ind=document.getElementById('statusIndicator'), text=document.getElementById('statusText');
    if(!ind||!text) return;
    ind.className='status-indicator '+(state.isOnline?'online':'offline');
    text.textContent=state.isOnline?'ONLINE':'OFFLINE';
}

function updateCounts() {
    const dc=document.getElementById('draftCount'), pc=document.getElementById('pendingCount');
    if(dc) dc.textContent=state.drafts.length;
    if(pc) pc.textContent=state.pendingSubmissions.length;
}

function showNotification(msg, type) {
    const n=document.getElementById('notification'), t=document.getElementById('notificationText');
    if(!n||!t) return;
    n.className='notification '+type+' show';
    t.textContent=msg;
    setTimeout(()=>n.classList.remove('show'),4000);
}

function setupEventListeners() {
    // viewDataBtn — handled by guardedAction in HTML
    // downloadDataBtn — handled by guardedAction in HTML
    // viewAnalysisBtn — handled by guardedAction in HTML
    // viewSummaryBtn — handled by guardedAction in HTML
    // aiAgentBtn — handled by guardedAction in HTML

    // Expose download so guardedAction can call it
    window._downloadData = downloadData;

    const df = document.getElementById('dataForm');
    if (df) df.addEventListener('submit', handleSubmit);

    window.addEventListener('online',  () => { state.isOnline = true;  updateOnlineStatus(); syncPending(); });
    window.addEventListener('offline', () => { state.isOnline = false; updateOnlineStatus(); });

    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
    });

    const dni = document.getElementById('draftNameInput');
    if (dni) dni.addEventListener('keypress', e => { if (e.key === 'Enter') confirmSaveDraft(); });

    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.onclick = e => { e.preventDefault(); window.nextSection(); };
    });
    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.onclick = e => { e.preventDefault(); window.previousSection(); };
    });
}

async function syncPending() {
    if(state.pendingSubmissions.length===0) return;
    showNotification('Syncing pending data...','info');
    const synced=[];
    for(let i=0;i<state.pendingSubmissions.length;i++){
        try{ await fetch(CONFIG.SCRIPT_URL,{method:'POST',mode:'no-cors',body:JSON.stringify(state.pendingSubmissions[i])}); synced.push(i); } catch(e){}
    }
    if(synced.length>0){
        state.pendingSubmissions=state.pendingSubmissions.filter((_,i)=>!synced.includes(i));
        saveToStorage(); updateCounts();
        showNotification('Synced '+synced.length+' submission(s)!','success');
    }
}

// ============================================
// KICK OFF
// ============================================
init();

// Expose globals
window.captureGPS=captureGPS; window.clearTeamSignature=clearTeamSignature;
window.toggleITNTypeQuantity=toggleITNTypeQuantity; window.updateApp=updateApp;
window.nextSection=nextSection; window.previousSection=previousSection;
window.showDraftNameModal=showDraftNameModal; window.finalizeForm=finalizeForm;
window.viewSummary=viewSummary; window.openSchoolDetail=openSchoolDetail;
window.closeSchoolDetailModal=closeSchoolDetailModal; window.loadSchoolIntoForm=loadSchoolIntoForm;
window.viewSubmittedSchoolFromBanner=viewSubmittedSchoolFromBanner;
window.openSummaryModal=openSummaryModal; window.closeSummaryModal=closeSummaryModal;
window.openAnalysisModal=openAnalysisModal; window.closeAnalysisModal=closeAnalysisModal;
window.openDraftsModal=openDraftsModal; window.closeDraftsModal=closeDraftsModal;
window.cancelDraftName=cancelDraftName; window.confirmSaveDraft=confirmSaveDraft;
window.loadDraft=loadDraft; window.deleteDraft=deleteDraft;
window.validateITNQuantities=validateITNQuantities;

console.log('[ICF Collect] script_option2.js loaded ✓');
