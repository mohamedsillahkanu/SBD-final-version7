// ============================================================
//  ICF-SL  ai_agent.js
//  • Analysis dashboard — fetches from ICF-SL Server via GAS
//  • AI Agent modal (GAS-backed Claude chat)
// ============================================================
(function () {
    'use strict';

    const GAS_URL = 'https://script.google.com/macros/s/AKfycbymRy-M5v0fVLWUjw4IXYhd1oIR2ZvnP_Dzr_iGR-Th0cMIpmE2ntGeujWYH7-C6NHIzA/exec';
    const SHEET_ID = '1cXlYiTMzcRP1BCj9mt1JXoK_pjgWbRtDEEQUPMg2HPs';

    // ════════════════════════════════════════════════════════
    //  AUTO-START  — no login required
    //  script_option2.js calls showLoginScreen() after the CSV
    //  loads. We override it to skip directly to startApp().
    // ════════════════════════════════════════════════════════
    (function patchAutoStart() {
        // Override showLoginScreen → auto-start as admin
        window.showLoginScreen = function () {
            if (window.state) {
                window.state.currentUser = 'admin';
                window.state.isAdmin     = true;
                window.LOCATION_DATA     = window.ALL_LOCATION_DATA || {};
            }
            window.startApp && window.startApp('ICF-SL', true);
        };

        // Override hideLoginScreen → just show appMain (loginScreen stub stays hidden)
        window.hideLoginScreen = function () {
            const ls = document.getElementById('loginScreen');
            if (ls) ls.style.display = 'none';
            const am = document.getElementById('appMain');
            if (am) { am.style.display = 'flex'; am.style.flexDirection = 'column'; }
            if (typeof cacheImagesForOffline === 'function') cacheImagesForOffline();
        };

        // Override handleLogout → no-op (no login to return to)
        window.handleLogout = function () { /* no login screen */ };
    })();

    // ════════════════════════════════════════════════════════
    //  STYLES
    // ════════════════════════════════════════════════════════
    const style = document.createElement('style');
    style.textContent = `
    /* ── AI Agent modal ── */
    #icfAiOverlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:none;justify-content:center;align-items:flex-end;padding:12px;}
    #icfAiOverlay.show{display:flex;}
    #icfAiModal{background:#fff;border-radius:16px 16px 12px 12px;border:3px solid #004080;width:100%;max-width:680px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.35);overflow:hidden;}
    .icf-ai-head{background:linear-gradient(135deg,#002d5a,#004080);color:#fff;padding:13px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;}
    .icf-ai-head-icon{width:34px;height:34px;background:rgba(255,255,255,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .icf-ai-head-icon svg{width:18px;height:18px;stroke:#fff;}
    .icf-ai-head-info{flex:1;}
    .icf-ai-head-title{font-family:'Oswald',sans-serif;font-size:15px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;line-height:1.2;}
    .icf-ai-head-sub{font-size:10px;color:rgba(255,255,255,.7);}
    .icf-ai-head-actions{display:flex;gap:6px;}
    .icf-ai-hbtn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:7px;padding:5px 10px;cursor:pointer;color:#fff;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.5px;display:flex;align-items:center;gap:4px;transition:background .15s;}
    .icf-ai-hbtn:hover{background:rgba(255,255,255,.22);}
    .icf-ai-hbtn svg{width:12px;height:12px;stroke:#fff;}
    .icf-ai-hbtn.gold{background:rgba(240,165,0,.25);border-color:rgba(240,165,0,.5);}
    .icf-ai-stats{background:#e8f1fa;border-bottom:2px solid #c5d9f0;padding:7px 14px;display:flex;gap:14px;flex-shrink:0;overflow-x:auto;}
    .icf-ai-stats::-webkit-scrollbar{display:none;}
    .icf-ai-stat{text-align:center;white-space:nowrap;}
    .icf-ai-stat-val{font-family:'Oswald',sans-serif;font-size:16px;font-weight:700;color:#004080;line-height:1;}
    .icf-ai-stat-lbl{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;}
    .icf-ai-stat-div{width:1px;background:#bcd3eb;align-self:stretch;margin:2px 0;}
    #icfAiMessages{flex:1;overflow-y:auto;padding:13px 15px;display:flex;flex-direction:column;gap:11px;background:#f8fafd;}
    .icf-msg{display:flex;gap:8px;align-items:flex-start;}.icf-msg.user{flex-direction:row-reverse;}
    .icf-msg-av{width:27px;height:27px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
    .icf-msg.ai .icf-msg-av{background:#004080;}.icf-msg.user .icf-msg-av{background:#f0a500;}
    .icf-msg-av svg{width:13px;height:13px;stroke:#fff;}
    .icf-bub{max-width:calc(100% - 42px);padding:9px 13px;border-radius:13px;font-size:13px;line-height:1.55;word-break:break-word;}
    .icf-msg.ai .icf-bub{background:#fff;border:1.5px solid #c5d9f0;border-top-left-radius:4px;color:#222;}
    .icf-msg.user .icf-bub{background:#004080;color:#fff;border-top-right-radius:4px;}
    .icf-bub strong{font-weight:700;}.icf-bub code{background:rgba(0,64,128,.08);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:12px;}
    .icf-msg.user .icf-bub code{background:rgba(255,255,255,.18);}
    .icf-typing{display:flex;align-items:center;gap:4px;padding:5px 0;}
    .icf-typing span{width:7px;height:7px;background:#004080;border-radius:50%;animation:icf-bnc .9s ease-in-out infinite;}
    .icf-typing span:nth-child(2){animation-delay:.15s;}.icf-typing span:nth-child(3){animation-delay:.30s;}
    @keyframes icf-bnc{0%,100%{transform:translateY(0);opacity:.4;}50%{transform:translateY(-5px);opacity:1;}}
    .icf-samples{padding:7px 14px 5px;flex-shrink:0;border-top:1px solid #e0eaf5;}
    .icf-sq-lbl{font-size:9px;font-family:'Oswald',sans-serif;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;}
    .icf-sq-row{display:flex;gap:5px;flex-wrap:wrap;}
    .icf-sq{background:#e8f1fa;border:1.5px solid #b3cde8;border-radius:20px;padding:4px 11px;font-size:11px;color:#004080;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s;font-family:'Oswald',sans-serif;}
    .icf-sq:hover{background:#004080;color:#fff;border-color:#004080;}
    .icf-inp-row{display:flex;gap:8px;padding:9px 13px 11px;border-top:2px solid #dce8f5;background:#fff;flex-shrink:0;align-items:flex-end;}
    #icfAiInput{flex:1;border:2px solid #c5d9f0;border-radius:22px;padding:8px 14px;font-size:13px;font-family:'Oswald','Segoe UI',Arial,sans-serif;outline:none;resize:none;transition:border-color .2s;line-height:1.4;}
    #icfAiInput:focus{border-color:#004080;}
    #icfAiSend{background:#004080;border:none;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .2s,transform .1s;}
    #icfAiSend:hover{background:#00306a;transform:scale(1.06);}
    #icfAiSend:disabled{background:#aaa;cursor:not-allowed;transform:none;}
    #icfAiSend svg{width:16px;height:16px;stroke:#fff;}
    .icf-clr{background:none;border:none;font-size:10px;color:#aaa;cursor:pointer;letter-spacing:.4px;text-transform:uppercase;font-family:'Oswald',sans-serif;padding:0 3px;transition:color .15s;}
    .icf-clr:hover{color:#dc3545;}
    .icf-pill{display:inline-flex;align-items:center;gap:5px;font-size:10px;padding:3px 9px;border-radius:12px;font-family:'Oswald',sans-serif;margin-bottom:7px;}
    .icf-pill.ok{background:#d4edda;color:#155724;}.icf-pill.err{background:#f8d7da;color:#721c24;}.icf-pill.chk{background:#e2e3e5;color:#383d41;}
    .icf-dot{width:6px;height:6px;border-radius:50%;}
    .ok .icf-dot{background:#28a745;}.err .icf-dot{background:#dc3545;}.chk .icf-dot{background:#888;animation:icf-bnc .9s ease-in-out infinite;}
    .icf-welcome{background:#fff;border:2px solid #c5d9f0;border-radius:11px;padding:16px;text-align:center;}
    .icf-welcome-icon{font-size:30px;margin-bottom:7px;}
    .icf-welcome-title{font-family:'Oswald',sans-serif;font-size:14px;color:#004080;font-weight:600;letter-spacing:.5px;margin-bottom:5px;}
    .icf-welcome-body{font-size:12px;color:#555;line-height:1.6;}
    .icf-foot{font-size:9px;color:#aaa;text-align:center;padding:3px;font-style:italic;font-family:'Oswald',sans-serif;}
    @media(max-width:520px){#icfAiModal{max-height:93vh;border-radius:14px 14px 0 0;}}

    /* ── Analysis dashboard ── */
    .an-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:14px;}
    .an-spinner{width:44px;height:44px;border:4px solid #e4eaf2;border-top-color:#004080;border-radius:50%;animation:an-spin 0.8s linear infinite;}
    @keyframes an-spin{to{transform:rotate(360deg);}}
    .an-load-txt{font-family:'Oswald',sans-serif;font-size:13px;color:#607080;letter-spacing:.5px;}
    .an-kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;}
    .an-kpi{background:#fff;border:2px solid #d0dce8;border-radius:10px;padding:15px 12px;text-align:center;box-shadow:0 2px 8px rgba(0,64,128,.06);}
    .an-kpi.g{border-color:#28a745;background:linear-gradient(135deg,#f0fff4,#fff);}
    .an-kpi.r{border-color:#dc3545;background:linear-gradient(135deg,#fff5f5,#fff);}
    .an-kpi.o{border-color:#f0a500;background:linear-gradient(135deg,#fffbf0,#fff);}
    .an-kpi.p{border-color:#e91e8c;background:linear-gradient(135deg,#fff0f8,#fff);}
    .an-kpi.b{border-color:#004080;background:linear-gradient(135deg,#f0f6ff,#fff);}
    .an-kpi-val{font-family:'Oswald',sans-serif;font-size:26px;font-weight:700;color:#004080;line-height:1;}
    .an-kpi.g .an-kpi-val{color:#28a745;}.an-kpi.r .an-kpi-val{color:#dc3545;}
    .an-kpi.o .an-kpi-val{color:#b8860b;}.an-kpi.p .an-kpi-val{color:#e91e8c;}
    .an-kpi-lbl{font-size:10px;color:#607080;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;font-family:'Oswald',sans-serif;}
    .an-section{background:#fff;border:2px solid #d0dce8;border-radius:10px;overflow:hidden;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,64,128,.06);}
    .an-section-hdr{background:linear-gradient(135deg,#004080,#1a6abf);color:#fff;padding:10px 16px;font-family:'Oswald',sans-serif;font-size:12px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
    .an-section-hdr svg{width:14px;height:14px;stroke:#fff;fill:none;}
    .an-section-body{padding:14px;}
    .an-charts-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    .an-charts-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
    .an-chart-card{background:#f8fafd;border:1px solid #e0eaf5;border-radius:8px;padding:12px;}
    .an-chart-label{font-family:'Oswald',sans-serif;font-size:11px;color:#004080;letter-spacing:.4px;text-transform:uppercase;text-align:center;margin-bottom:8px;font-weight:600;}
    .an-chart-card canvas{max-height:200px;}
    .an-tbl-wrap{overflow-x:auto;}
    .an-tbl{width:100%;border-collapse:collapse;font-size:12px;}
    .an-tbl thead tr{background:linear-gradient(135deg,#004080,#1a6abf);}
    .an-tbl th{padding:9px 12px;font-family:'Oswald',sans-serif;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#fff;text-align:left;white-space:nowrap;}
    .an-tbl td{padding:8px 12px;border-bottom:1px solid #f0f4f8;}
    .an-tbl tr:last-child td{border-bottom:none;}
    .an-tbl tr:nth-child(even) td{background:#fafcff;}
    .an-tbl tr:hover td{background:#eef5ff;}
    .an-cov-cell{display:flex;align-items:center;gap:6px;}
    .an-cov-bar{background:#e4eaf2;border-radius:3px;height:6px;flex:1;overflow:hidden;min-width:40px;}
    .an-cov-fill{height:100%;border-radius:3px;}
    .an-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:.3px;}
    .an-badge-g{background:#e8f5e9;color:#28a745;}.an-badge-o{background:#fff8e1;color:#b8860b;}.an-badge-r{background:#fdecea;color:#dc3545;}
    .an-no-data{text-align:center;padding:50px 20px;color:#8090a0;font-family:'Oswald',sans-serif;font-size:13px;letter-spacing:.5px;}
    .an-no-data svg{width:40px;height:40px;stroke:#c0ccd8;margin-bottom:10px;}
    @media(max-width:600px){.an-charts-2,.an-charts-3{grid-template-columns:1fr;}.an-kpi-row{grid-template-columns:repeat(2,1fr);}}
    `;
    document.head.appendChild(style);

    // ════════════════════════════════════════════════════════
    //  AI AGENT MODAL HTML
    // ════════════════════════════════════════════════════════
    document.body.insertAdjacentHTML('beforeend', `
    <div id="icfAiOverlay" onclick="icfAiOverlayClick(event)">
      <div id="icfAiModal">
        <div class="icf-ai-head">
          <div class="icf-ai-head-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </div>
          <div class="icf-ai-head-info">
            <div class="icf-ai-head-title">ICF Data Agent</div>
            <div class="icf-ai-head-sub">AI · Google Apps Script + Claude</div>
          </div>
          <div class="icf-ai-head-actions">
            <button class="icf-ai-hbtn gold" onclick="icfAiRefreshStats()">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/></svg>SYNC
            </button>
            <button class="icf-ai-hbtn" onclick="icfAiClose()">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>CLOSE
            </button>
          </div>
        </div>
        <div class="icf-ai-stats" id="icfAiStats"><div style="margin:auto;font-size:11px;color:#888;">Loading…</div></div>
        <div id="icfAiMessages">
          <div class="icf-welcome">
            <div class="icf-welcome-icon">🤖</div>
            <div class="icf-welcome-title">Hello! I'm your ICF Data Agent.</div>
            <div class="icf-welcome-body">I analyse all submitted ITN data — coverage, enrollment, gender breakdown, class-level stats and more.<br><br>Powered by <strong>Google Apps Script + Claude AI</strong>. API key stays securely on the server.</div>
          </div>
          <div id="icfGasStatus"></div>
        </div>
        <div class="icf-samples">
          <div class="icf-sq-lbl">✦ Try asking</div>
          <div class="icf-sq-row" id="icfSqRow"></div>
        </div>
        <div class="icf-inp-row">
          <button class="icf-clr" onclick="icfAiClearChat()">↺ Clear</button>
          <textarea id="icfAiInput" rows="1" placeholder="Ask about the ITN distribution data…"
            onkeydown="icfAiKeydown(event)" oninput="icfAiAutoResize(this)"></textarea>
          <button id="icfAiSend" onclick="icfAiSend()">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="icf-foot">Session state + ICF-SL Server · API key never leaves the server</div>
      </div>
    </div>`);

    // ════════════════════════════════════════════════════════
    //  SHARED HELPERS
    // ════════════════════════════════════════════════════════
    const SAMPLES = [
        'How many schools have been submitted?','What is the overall ITN coverage rate?',
        'Which district has the most submissions?','Show coverage breakdown by gender',
        'How many ITNs were distributed in total?','List schools with coverage below 80%',
        'What is average enrollment per school?','How many schools are still pending?',
        'Compare boys vs girls ITN coverage','Which schools received IG2 nets?',
        'How many ITNs remain after distribution?','Give me a summary by chiefdom',
        'Which class has the highest coverage?','Who submitted the most records?',
    ];
    function pickN(n){const p=[...SAMPLES],o=[];while(o.length<n&&p.length){const i=Math.floor(Math.random()*p.length);o.push(p.splice(i,1)[0]);}return o;}

    function md(t){
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/`(.+?)`/g,'<code>$1</code>')
            .replace(/^#{1,3} (.+)$/gm,'<strong style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#004080;display:block;margin-top:6px">$1</strong>')
            .replace(/^- (.+)$/gm,'<span style="display:block;padding-left:14px;margin:2px 0">• $1</span>')
            .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
    }

    function covColor(p){return p>=80?'#28a745':p>=50?'#f0a500':'#dc3545';}
    function covBadge(p){const c=p>=80?'g':p>=50?'o':'r';return`<span class="an-badge an-badge-${c}">${p}%</span>`;}

    // ════════════════════════════════════════════════════════
    //  GAS CALLS
    // ════════════════════════════════════════════════════════
    async function callGAS(msg, history, context){
        const res=await fetch(GAS_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ai_query',message:msg,history:(history||[]).slice(-10),context:context||''})});
        if(!res.ok)throw new Error('GAS HTTP '+res.status);
        const d=await res.json();if(!d.success)throw new Error(d.error||'GAS error');return d.reply;
    }

    async function fetchSheetData(){
        // ── Method 1: GAS ?action=getData (15s timeout) ────────
        try{
            const res=await Promise.race([
                fetch(GAS_URL+'?action=getData'),
                new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),15000))
            ]);
            if(res.ok){
                const d=await res.json();
                const rows=d.rows||d.data||(Array.isArray(d)?d:null);
                if(rows&&rows.length>0){console.log('[Analysis] Loaded',rows.length,'rows from GAS');return rows;}
            }
        }catch(e){console.warn('[Analysis] GAS getData:',e.message);}

        // ── Method 2: Direct ICF-SL Server CSV export ───────────
        try{
            const csvUrl=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
            const rows=await new Promise((resolve,reject)=>{
                Papa.parse(csvUrl,{
                    download:true,header:true,skipEmptyLines:true,
                    complete:r=>resolve(r.data||[]),
                    error:reject
                });
            });
            if(rows&&rows.length>0){console.log('[Analysis] Loaded',rows.length,'rows from CSV export');return rows;}
        }catch(e){console.warn('[Analysis] CSV export:',e.message);}

        console.warn('[Analysis] Sheet fetch failed — local data only');
        return[];
    }

    async function fetchCount(){
        try{const r=await fetch(GAS_URL+'?action=count');const d=await r.json();return d.count!==undefined?d.count:'?';}catch{return'?';}
    }

    // Build targets from the already-loaded CSV cascading data.
    // Key = district|chiefdom|phu|community|school_name (same school name in different community = different school)
    function buildTargetsFromCSV() {
        // Key = district|chiefdom|phu|community|school — all 5 parts
        const data = window.ALL_LOCATION_DATA || {};
        const targets = {};

        for (const district in data) {
            const dk = district.trim().toLowerCase();
            const dSet = new Set();

            for (const chiefdom in data[district]) {
                const ck = chiefdom.trim().toLowerCase();
                const cSet = new Set();

                for (const phu in data[district][chiefdom]) {
                    const pk = phu.trim().toLowerCase();
                    const pSet = new Set();

                    for (const community in data[district][chiefdom][phu]) {
                        const comk = community.trim().toLowerCase();
                        const schools = data[district][chiefdom][phu][community];
                        if (!Array.isArray(schools)) continue;
                        schools.forEach(s => {
                            if (!s) return;
                            const fullKey = dk+'|'+ck+'|'+pk+'|'+comk+'|'+s.trim().toLowerCase();
                            pSet.add(fullKey);
                            cSet.add(fullKey);
                            dSet.add(fullKey);
                        });
                    }
                    if (pSet.size > 0) targets[dk+'|'+ck+'|'+pk] = pSet.size;
                }
                if (cSet.size > 0) targets[dk+'|'+ck] = cSet.size;
            }
            if (dSet.size > 0) targets[dk] = dSet.size;
        }
        return targets;
    }

    // ════════════════════════════════════════════════════════
    //  DATA MERGE  (GAS sheet + localStorage)
    // ════════════════════════════════════════════════════════
    let _sheetRows = [];   // cached from last GAS fetch

    function getLocalRows(){
        const s=window.state||{};
        return[...(s.submittedSchools||[]).map(r=>r.data||r),...(s.pendingSubmissions||[])];
    }

    function mergeData(sheetRows){
        // If we have fresh sheet data, use it as the source of truth.
        // Only fall back to local data when sheet is unavailable.
        if(sheetRows && sheetRows.length > 0) return sheetRows;
        // Sheet unavailable — use local pending/submitted data
        return getLocalRows();
    }

    // ════════════════════════════════════════════════════════
    //  ANALYSIS CASCADING FILTERS
    // ════════════════════════════════════════════════════════
    function getLoc(){return(window.ALL_LOCATION_DATA&&Object.keys(window.ALL_LOCATION_DATA).length)?window.ALL_LOCATION_DATA:window.LOCATION_DATA||{};}

    function afOpt(sel,opts,disabled){
        const el=document.getElementById(sel);if(!el)return;
        const cur=el.value;
        el.innerHTML='<option value="">All</option>';
        opts.sort().forEach(o=>{const op=document.createElement('option');op.value=op.textContent=o;el.appendChild(op);});
        if(cur&&[...el.options].some(o=>o.value===cur))el.value=cur;
        el.disabled=!!disabled;
    }

    // Structure: loc[district][chiefdom][phu][community] = [schools]
    window.afCascade=function(level){
        const loc=getLoc();
        const d  =()=>document.getElementById('af_district' )?.value||'';
        const c  =()=>document.getElementById('af_chiefdom' )?.value||'';
        const f  =()=>document.getElementById('af_facility' )?.value||'';
        const co =()=>document.getElementById('af_community')?.value||'';

        const resetBelow=(...ids)=>ids.forEach(id=>{
            const el=document.getElementById(id);
            if(el){el.innerHTML='<option value="">All</option>';el.disabled=true;}
        });

        if(level==='district'){
            resetBelow('af_chiefdom','af_facility','af_community','af_school');
            if(d()&&loc[d()]) afOpt('af_chiefdom',Object.keys(loc[d()]),false);

        }else if(level==='chiefdom'){
            resetBelow('af_facility','af_community','af_school');
            if(d()&&c()&&loc[d()]?.[c()]) afOpt('af_facility',Object.keys(loc[d()][c()]),false);

        }else if(level==='facility'){
            resetBelow('af_community','af_school');
            if(d()&&c()&&f()&&loc[d()]?.[c()]?.[f()])
                afOpt('af_community',Object.keys(loc[d()][c()][f()]),false);

        }else if(level==='community'){
            resetBelow('af_school');
            const schools=loc[d()]?.[c()]?.[f()]?.[co()];
            if(schools) afOpt('af_school',schools,false);
        }
        runAnalysis();
    };

    window.clearAnalysisFilters=function(){
        ['af_chiefdom','af_facility','af_community','af_school'].forEach(id=>{
            const el=document.getElementById(id);
            if(el){el.innerHTML='<option value="">All</option>';el.disabled=true;}
        });
        const dd=document.getElementById('af_district');if(dd)dd.value='';
        runAnalysis();
    };

    function initDistrictFilter(){
        const dd=document.getElementById('af_district');if(!dd)return;
        const loc=getLoc();
        const districts=Object.keys(loc).sort();
        // Always rebuild — loc may not have been available last call
        dd.innerHTML='<option value="">All Districts</option>';
        districts.forEach(d=>{const o=document.createElement('option');o.value=o.textContent=d;dd.appendChild(o);});
        if(districts.length===0) console.warn('[Analysis] District filter empty — ALL_LOCATION_DATA keys:',Object.keys(window.ALL_LOCATION_DATA||{}));
    }

    function getFilteredData(allRows){
        let rows=[...allRows];
        const fD  =document.getElementById('af_district' )?.value||'';
        const fC  =document.getElementById('af_chiefdom' )?.value||'';
        const fF  =document.getElementById('af_facility' )?.value||'';
        const fCom=document.getElementById('af_community')?.value||'';
        const fSch=document.getElementById('af_school'   )?.value||'';
        const lc=s=>(s||'').toLowerCase();
        if(fD)   rows=rows.filter(r=>lc(r.district ||'')===lc(fD));
        if(fC)   rows=rows.filter(r=>lc(r.chiefdom ||'')===lc(fC));
        if(fF)   rows=rows.filter(r=>lc(r.facility ||'')===lc(fF));
        if(fCom) rows=rows.filter(r=>lc(r.community||'')===lc(fCom));
        if(fSch) rows=rows.filter(r=>lc(r.school_name||'')===lc(fSch));
        return rows;
    }

    // ════════════════════════════════════════════════════════
    //  CHART INSTANCES
    // ════════════════════════════════════════════════════════
    let anCharts={};
    function destroyCharts(){Object.values(anCharts).forEach(c=>{try{c.destroy();}catch(e){}});anCharts={};}

    const CF={font:{family:"'Oswald',sans-serif"}};
    const chartOpts=(extra={})=>({
        responsive:true,maintainAspectRatio:true,
        plugins:{legend:{labels:{font:{family:"'Oswald',sans-serif",size:11},boxWidth:12}},tooltip:{titleFont:{family:"'Oswald',sans-serif"},bodyFont:{family:"'Oswald',sans-serif"}},...extra},
        ...extra
    });

    function mkChart(id,cfg){
        const el=document.getElementById(id);if(!el)return null;
        const c=new Chart(el,cfg);anCharts[id]=c;return c;
    }

    // ════════════════════════════════════════════════════════
    //  MAIN ANALYSIS RENDER
    // ════════════════════════════════════════════════════════
    window.runAnalysis=function(allRows){
        if(allRows!==undefined)_sheetRows=allRows||[];
        destroyCharts();
        const body=document.getElementById('analysisBody');if(!body)return;
        const all=getFilteredData(mergeData(_sheetRows));
        const total=all.length;

        const sub=document.getElementById('anSubtitle');
        if(sub)sub.textContent=`${total} school${total!==1?'s':''} submitted · Last refreshed ${new Date().toLocaleTimeString('en-SL',{hour:'2-digit',minute:'2-digit'})}`;

        if(!total){
            body.innerHTML=`<div class="an-no-data">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg>
              <div style="margin-bottom:12px;">No submissions found. ${_sheetRows.length===0?'Could not load data from ICF-SL Server — try refreshing.':'No data matches the selected filters.'}</div>
              ${_sheetRows.length===0?`<button onclick="anRefresh()" style="background:#004080;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-family:'Oswald',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;cursor:pointer;">↻ RETRY FETCH</button>`:''}
            </div>`;
            return;
        }

        // Targets come from CSV (already computed). Look up the right level
        // based on active filters: district-only → dKey, +chiefdom → cKey, +phu → pKey
        const targets    = window._TARGETS || {};
        const hasTargets = Object.keys(targets).length > 0;
        const fD = (document.getElementById('af_district')?.value||'').trim().toLowerCase();
        const fC = (document.getElementById('af_chiefdom')?.value||'').trim().toLowerCase();
        const fP = (document.getElementById('af_facility')?.value||'').trim().toLowerCase();
        let targetCount = 0;
        if (hasTargets) {
            if (fP && fC && fD) {
                // PHU level
                targetCount = targets[fD+'|'+fC+'|'+fP] || 0;
            } else if (fC && fD) {
                // Chiefdom level
                targetCount = targets[fD+'|'+fC] || 0;
            } else if (fD) {
                // District level
                targetCount = targets[fD] || 0;
            } else {
                // National total — sum all district-level entries (single-segment keys)
                Object.entries(targets).forEach(([k, v]) => {
                    if (!k.includes('|')) targetCount += v;
                });
            }
        }

        // Aggregate
        let tp=0,ti=0,tb=0,tg=0,tbi=0,tgi=0,tr=0,trem=0;
        const byDist={},bySubmitter={};
        const cls={b:[0,0,0,0,0],g:[0,0,0,0,0],bi:[0,0,0,0,0],gi:[0,0,0,0,0]};

        all.forEach(r=>{
            const vp=+r.total_pupils||0,vi=+r.total_itn||0,vb=+r.total_boys||0,vg=+r.total_girls||0,
                  vbi=+r.total_boys_itn||0,vgi=+r.total_girls_itn||0,
                  vr=+r.itns_received||0,vrem=+(r.itns_remaining||r.itns_remaining_val)||0;
            tp+=vp;ti+=vi;tb+=vb;tg+=vg;tbi+=vbi;tgi+=vgi;tr+=vr;trem+=vrem;
            const d=r.district||'Unknown';
            if(!byDist[d])byDist[d]={n:0,p:0,i:0,b:0,g:0,bi:0,gi:0};
            byDist[d].n++;byDist[d].p+=vp;byDist[d].i+=vi;byDist[d].b+=vb;byDist[d].g+=vg;byDist[d].bi+=vbi;byDist[d].gi+=vgi;
            const sub=r.submitted_by||'Unknown';
            if(!bySubmitter[sub])bySubmitter[sub]={n:0,p:0,i:0};
            bySubmitter[sub].n++;bySubmitter[sub].p+=vp;bySubmitter[sub].i+=vi;
            for(let c=1;c<=5;c++){
                cls.b[c-1]+=+r['c'+c+'_boys']||0;cls.g[c-1]+=+r['c'+c+'_girls']||0;
                cls.bi[c-1]+=+r['c'+c+'_boys_itn']||0;cls.gi[c-1]+=+r['c'+c+'_girls_itn']||0;
            }
        });

        const ov=tp>0?Math.round((ti/tp)*100):0;
        const bc=tb>0?Math.round((tbi/tb)*100):0;
        const gc=tg>0?Math.round((tgi/tg)*100):0;
        const classLabels=['Class 1','Class 2','Class 3','Class 4','Class 5'];
        const classTot=cls.b.map((b,i)=>b+cls.g[i]);
        const classITN=cls.bi.map((b,i)=>b+cls.gi[i]);
        const classCov=classTot.map((t,i)=>t>0?Math.round((classITN[i]/t)*100):0);
        const boysCov=cls.b.map((b,i)=>b>0?Math.round((cls.bi[i]/b)*100):0);
        const girlsCov=cls.g.map((g,i)=>g>0?Math.round((cls.gi[i]/g)*100):0);
        const distL=Object.keys(byDist).sort();
        const distCov=distL.map(d=>byDist[d].p>0?Math.round((byDist[d].i/byDist[d].p)*100):0);
        const distBoysCov=distL.map(d=>byDist[d].b>0?Math.round((byDist[d].bi/byDist[d].b)*100):0);
        const distGirlsCov=distL.map(d=>byDist[d].g>0?Math.round((byDist[d].gi/byDist[d].g)*100):0);

        // ── Build HTML ──────────────────────────────────
        body.innerHTML=`
        <!-- KPIs -->
        <div class="an-kpi-row">
          ${hasTargets && targetCount>0 ? `<div class="an-kpi b"><div class="an-kpi-val">${targetCount}</div><div class="an-kpi-lbl">Target Schools</div></div>` : ''}
          <div class="an-kpi b"><div class="an-kpi-val">${total}</div><div class="an-kpi-lbl">Submitted</div></div>
          ${hasTargets && targetCount>0 ? `<div class="an-kpi ${targetCount>total?'r':'g'}"><div class="an-kpi-val">${Math.max(0,targetCount-total)}</div><div class="an-kpi-lbl">Remaining</div></div>
          <div class="an-kpi ${Math.round((total/targetCount)*100)>=80?'g':'o'}"><div class="an-kpi-val">${Math.round((total/targetCount)*100)}%</div><div class="an-kpi-lbl">Progress</div></div>` : ''}
          <div class="an-kpi"><div class="an-kpi-val">${tp.toLocaleString()}</div><div class="an-kpi-lbl">Total Pupils</div></div>
          <div class="an-kpi o"><div class="an-kpi-val">${tr.toLocaleString()}</div><div class="an-kpi-lbl">ITNs Received</div></div>
          <div class="an-kpi g"><div class="an-kpi-val">${ti.toLocaleString()}</div><div class="an-kpi-lbl">Distributed</div></div>
          <div class="an-kpi ${trem<0?'r':''}"><div class="an-kpi-val">${trem.toLocaleString()}</div><div class="an-kpi-lbl">Remaining</div></div>
          <div class="an-kpi ${ov>=80?'g':ov>=50?'o':'r'}"><div class="an-kpi-val">${ov}%</div><div class="an-kpi-lbl">Coverage</div></div>
          <div class="an-kpi b"><div class="an-kpi-val">${bc}%</div><div class="an-kpi-lbl">Boys Cov.</div></div>
          <div class="an-kpi p"><div class="an-kpi-val">${gc}%</div><div class="an-kpi-lbl">Girls Cov.</div></div>
        </div>

        <!-- Row 1: Coverage donut + Gender enrollment + Gender ITN -->
        <div class="an-section">
          <div class="an-section-hdr"><svg viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>OVERALL SUMMARY</div>
          <div class="an-section-body">
            <div class="an-charts-3">
              <div class="an-chart-card"><div class="an-chart-label">ITN Coverage</div><canvas id="anCovDonut"></canvas></div>
              <div class="an-chart-card"><div class="an-chart-label">Enrollment by Gender</div><canvas id="anEnrollDonut"></canvas></div>
              <div class="an-chart-card"><div class="an-chart-label">ITNs Distributed by Gender</div><canvas id="anItnDonut"></canvas></div>
            </div>
          </div>
        </div>

        <!-- Row 2: Coverage by class -->
        <div class="an-section">
          <div class="an-section-hdr"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>CLASS-BY-CLASS BREAKDOWN</div>
          <div class="an-section-body">
            <div class="an-charts-2">
              <div class="an-chart-card"><div class="an-chart-label">Coverage % by Class</div><canvas id="anClassCov"></canvas></div>
              <div class="an-chart-card"><div class="an-chart-label">Boys vs Girls Coverage by Class</div><canvas id="anClassGender"></canvas></div>
            </div>
            <div style="margin-top:12px;" class="an-chart-card"><div class="an-chart-label">Enrollment vs ITNs Distributed by Class</div><canvas id="anEnrollVsItn"></canvas></div>
          </div>
        </div>

        <!-- Row 3: By district (only if >1) -->
        ${distL.length>1?`
        <div class="an-section">
          <div class="an-section-hdr"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>BY DISTRICT</div>
          <div class="an-section-body">
            <div class="an-charts-2">
              <div class="an-chart-card"><div class="an-chart-label">Coverage % by District</div><canvas id="anDistCov"></canvas></div>
              <div class="an-chart-card"><div class="an-chart-label">Boys vs Girls Coverage by District</div><canvas id="anDistGender"></canvas></div>
            </div>
          </div>
        </div>`:''}

        <!-- Row 4: By submitter -->
        ${Object.keys(bySubmitter).length>1?`
        <div class="an-section">
          <div class="an-section-hdr"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>BY DISTRIBUTOR</div>
          <div class="an-section-body">
            <div class="an-chart-card"><div class="an-chart-label">Schools Submitted per Distributor</div><canvas id="anSubmitterBar"></canvas></div>
          </div>
        </div>`:''}

        <!-- School table -->
        <div class="an-section">
          <div class="an-section-hdr"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg>ALL SCHOOLS (${total})</div>
          <div class="an-section-body" style="padding:0;">
            <div class="an-tbl-wrap">
              <table class="an-tbl">
                <thead><tr><th>#</th><th>School</th><th>Community</th><th>District</th><th>Pupils</th><th>Boys</th><th>Girls</th><th>ITNs</th><th>Remaining</th><th>Coverage</th><th>Date</th><th>By</th></tr></thead>
                <tbody>
                  ${all.sort((a,b)=>(a.district||'').localeCompare(b.district||'')).map((r,i)=>{
                    const vp=+r.total_pupils||0,vi=+r.total_itn||0,vb=+r.total_boys||0,vg=+r.total_girls||0;
                    const vrem=+(r.itns_remaining||r.itns_remaining_val)||0;
                    const cov=vp>0?Math.round((vi/vp)*100):0;
                    const col=covColor(cov);
                    return`<tr>
                      <td style="color:#8090a0;font-size:11px;">${i+1}</td>
                      <td style="font-weight:600;white-space:nowrap;">${r.school_name||'—'}</td>
                      <td style="white-space:nowrap;">${r.community||'—'}</td>
                      <td style="white-space:nowrap;">${r.district||'—'}</td>
                      <td style="text-align:center;">${vp}</td>
                      <td style="text-align:center;color:#004080;">${vb}</td>
                      <td style="text-align:center;color:#e91e8c;">${vg}</td>
                      <td style="text-align:center;font-weight:600;">${vi}</td>
                      <td style="text-align:center;color:${vrem<0?'#dc3545':'#607080'};">${vrem}</td>
                      <td>
                        <div class="an-cov-cell">
                          <div class="an-cov-bar"><div class="an-cov-fill" style="width:${Math.min(100,cov)}%;background:${col};"></div></div>
                          ${covBadge(cov)}
                        </div>
                      </td>
                      <td style="font-size:11px;white-space:nowrap;">${r.distribution_date||'—'}</td>
                      <td style="font-size:11px;color:#607080;white-space:nowrap;">${r.submitted_by||'—'}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;

        // ── Charts ──────────────────────────────────────
        // 1. Coverage donut
        mkChart('anCovDonut',{type:'doughnut',data:{labels:['Covered','Remaining'],datasets:[{data:[ov,100-ov],backgroundColor:[covColor(ov),'#e8edf2'],borderWidth:3,borderColor:'#fff'}]},options:{...chartOpts(),cutout:'72%',plugins:{legend:{position:'bottom',labels:{font:{family:"'Oswald',sans-serif",size:11},boxWidth:12}},title:{display:true,text:ov+'%',color:covColor(ov),font:{family:"'Oswald',sans-serif",size:22,weight:'700'}}}}});

        // 2. Gender enrollment donut
        mkChart('anEnrollDonut',{type:'doughnut',data:{labels:['Boys','Girls'],datasets:[{data:[tb,tg],backgroundColor:['#004080','#e91e8c'],borderWidth:3,borderColor:'#fff'}]},options:{...chartOpts(),cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{family:"'Oswald',sans-serif",size:11},boxWidth:12}}}}});

        // 3. Gender ITN donut
        mkChart('anItnDonut',{type:'doughnut',data:{labels:['Boys','Girls'],datasets:[{data:[tbi,tgi],backgroundColor:['#004080','#e91e8c'],borderWidth:3,borderColor:'#fff'}]},options:{...chartOpts(),cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{family:"'Oswald',sans-serif",size:11},boxWidth:12}}}}});

        // 4. Coverage by class
        mkChart('anClassCov',{type:'bar',data:{labels:classLabels,datasets:[{label:'Coverage %',data:classCov,backgroundColor:classCov.map(v=>covColor(v)+'cc'),borderColor:classCov.map(covColor),borderWidth:2,borderRadius:6}]},options:{...chartOpts({scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%',font:CF.font},grid:{color:'rgba(0,0,0,.05)'}},x:{ticks:{font:CF.font},grid:{display:false}}},plugins:{legend:{display:false},annotation:{}}})}});

        // 5. Boys vs Girls coverage by class grouped
        mkChart('anClassGender',{type:'bar',data:{labels:classLabels,datasets:[{label:'Boys',data:boysCov,backgroundColor:'rgba(0,64,128,.75)',borderColor:'#004080',borderWidth:2,borderRadius:5},{label:'Girls',data:girlsCov,backgroundColor:'rgba(233,30,140,.7)',borderColor:'#e91e8c',borderWidth:2,borderRadius:5}]},options:{...chartOpts({scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%',font:CF.font},grid:{color:'rgba(0,0,0,.05)'}},x:{ticks:{font:CF.font},grid:{display:false}}}})}});

        // 6. Enrollment vs ITN by class
        mkChart('anEnrollVsItn',{type:'bar',data:{labels:classLabels,datasets:[{label:'Enrolled',data:classTot,backgroundColor:'rgba(0,64,128,.2)',borderColor:'#004080',borderWidth:2,borderRadius:5},{label:'Received ITN',data:classITN,backgroundColor:'rgba(40,167,69,.7)',borderColor:'#28a745',borderWidth:2,borderRadius:5}]},options:{...chartOpts({scales:{y:{beginAtZero:true,ticks:{font:CF.font},grid:{color:'rgba(0,0,0,.05)'}},x:{ticks:{font:CF.font},grid:{display:false}}}})}});

        // 7. Coverage by district (horizontal)
        if(distL.length>1){
            mkChart('anDistCov',{type:'bar',data:{labels:distL,datasets:[{label:'Coverage %',data:distCov,backgroundColor:distCov.map(v=>covColor(v)+'cc'),borderColor:distCov.map(covColor),borderWidth:2,borderRadius:5}]},options:{...chartOpts({indexAxis:'y',scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%',font:CF.font},grid:{color:'rgba(0,0,0,.05)'}},y:{ticks:{font:CF.font},grid:{display:false}}},plugins:{legend:{display:false}}})}});

            // 8. Boys vs Girls by district
            mkChart('anDistGender',{type:'bar',data:{labels:distL,datasets:[{label:'Boys',data:distBoysCov,backgroundColor:'rgba(0,64,128,.75)',borderColor:'#004080',borderWidth:2,borderRadius:4},{label:'Girls',data:distGirlsCov,backgroundColor:'rgba(233,30,140,.7)',borderColor:'#e91e8c',borderWidth:2,borderRadius:4}]},options:{...chartOpts({indexAxis:'y',scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%',font:CF.font},grid:{color:'rgba(0,0,0,.05)'}},y:{ticks:{font:CF.font},grid:{display:false}}}})}});
        }

        // 9. By submitter bar
        if(Object.keys(bySubmitter).length>1){
            const subs=Object.entries(bySubmitter).sort((a,b)=>b[1].n-a[1].n).slice(0,10);
            const subLabels=subs.map(s=>s[0]),subVals=subs.map(s=>s[1].n),subCov=subs.map(s=>s[1].p>0?Math.round((s[1].i/s[1].p)*100):0);
            mkChart('anSubmitterBar',{type:'bar',data:{labels:subLabels,datasets:[{label:'Schools',data:subVals,backgroundColor:'rgba(0,64,128,.7)',borderColor:'#004080',borderWidth:2,borderRadius:5,yAxisID:'y'},{label:'Coverage %',data:subCov,backgroundColor:'rgba(40,167,69,.6)',borderColor:'#28a745',borderWidth:2,borderRadius:5,type:'line',yAxisID:'y1'}]},options:{...chartOpts({scales:{y:{beginAtZero:true,ticks:{font:CF.font},grid:{color:'rgba(0,0,0,.05)'},title:{display:true,text:'Schools',font:CF.font}},y1:{beginAtZero:true,max:100,position:'right',ticks:{callback:v=>v+'%',font:CF.font},grid:{display:false},title:{display:true,text:'Coverage',font:CF.font}},x:{ticks:{font:CF.font},grid:{display:false}}}})}});
        }
    };

    // ════════════════════════════════════════════════════════
    //  TAB SWITCHER
    // ════════════════════════════════════════════════════════
    window.switchAnTab = function(tab) {
        const tabs = ['analysis', 'targets'];
        tabs.forEach(t => {
            const btn = document.getElementById('anTab-' + t);
            const panel = document.getElementById(t === 'analysis' ? 'analysisBody' : 'targetsBody');
            const isActive = t === tab;
            if (btn) {
                btn.style.color       = isActive ? '#004080' : '#607080';
                btn.style.borderBottomColor = isActive ? '#c8991a' : 'transparent';
                btn.style.background  = isActive ? '#f4f8ff' : 'none';
            }
            if (panel) panel.style.display = isActive ? 'block' : 'none';
        });
        if (tab === 'targets') renderTargetsTab();
    };

    // ════════════════════════════════════════════════════════
    //  TARGETS TAB — District → Chiefdom → Schools breakdown
    // ════════════════════════════════════════════════════════
    // Build targets tree — each entry in ALL_LOCATION_DATA arrays is already unique
    function buildTargetsTree() {
        const data = window.ALL_LOCATION_DATA || {};
        const tree = {};

        for (const district in data) {
            if (!tree[district]) tree[district] = { chiefdoms: {} };
            const dk = district.trim().toLowerCase();
            for (const chiefdom in data[district]) {
                if (!tree[district].chiefdoms[chiefdom])
                    tree[district].chiefdoms[chiefdom] = { schools: [] };
                const ck = chiefdom.trim().toLowerCase();
                for (const phu in data[district][chiefdom]) {
                    const pk = phu.trim().toLowerCase();
                    for (const community in data[district][chiefdom][phu]) {
                        const comk = community.trim().toLowerCase();
                        const schoolList = data[district][chiefdom][phu][community];
                        if (!Array.isArray(schoolList)) continue;
                        schoolList.forEach(s => {
                            if (!s) return;
                            tree[district].chiefdoms[chiefdom].schools.push({
                                district, chiefdom, phu, community, name: s,
                                key: dk+'|'+ck+'|'+pk+'|'+comk+'|'+s.trim().toLowerCase()
                            });
                        });
                    }
                }
                tree[district].chiefdoms[chiefdom].schools.sort((a,b) => a.name.localeCompare(b.name));
            }
        }
        return tree;
    }

    function getSubmittedSet() {
        // Returns Set of lowercase district|chiefdom|phu|community|school keys from ICF-SL Server only
        return new Set(
            (_sheetRows || [])
                .filter(r => r.school_name)
                .map(r =>
                    (r.district    ||'').trim().toLowerCase()+'|'+
                    (r.chiefdom    ||'').trim().toLowerCase()+'|'+
                    (r.facility    ||'').trim().toLowerCase()+'|'+
                    (r.community   ||'').trim().toLowerCase()+'|'+
                    (r.school_name ||'').trim().toLowerCase()
                )
        );
    }

    function renderTargetsTab() {
        const body = document.getElementById('targetsBody');
        if (!body) return;

        const tree      = buildTargetsTree();
        const submitted = getSubmittedSet();
        const districts = Object.keys(tree).sort();

        if (!districts.length) {
            body.innerHTML = `<div class="an-no-data">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              <div>No location data loaded. Ensure cascading_data1.csv is present.</div>
            </div>`;
            return;
        }

        // Show banner if sheet data not yet fetched
        const sheetBanner = _sheetRows.length === 0
            ? `<div class="alert" style="background:#fff8e1;border:1px solid #ffe082;border-radius:9px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:8px;font-size:12px;color:#8a6500;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#c8991a" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Submission counts show ICF-SL Server data only. Hit <strong>REFRESH</strong> to pull the latest from the server.
              </div>`
            : `<div class="alert" style="background:#e8f5e9;border:1px solid #b2dfcc;border-radius:9px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:8px;font-size:12px;color:#2e7d32;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2" width="16" height="16"><path d="M9 11l3 3L22 4"/></svg>
                Showing <strong>${_sheetRows.length} submissions</strong> from ICF-SL Server.
              </div>`;
        let natSchools = 0, natDone = 0;
        districts.forEach(d => {
            Object.values(tree[d].chiefdoms).forEach(c => {
                natSchools += c.schools.length;
                natDone    += c.schools.filter(s => submitted.has(s.key)).length;
            });
        });
        const natPct = natSchools > 0 ? Math.round((natDone / natSchools) * 100) : 0;

        // Duplicate rows banner
        const dups = window.CSV_DUPLICATES || [];
        const dupBanner = dups.length > 0 ? `
            <div style="background:#fff0f0;border:2px solid #dc3545;border-radius:10px;margin-bottom:14px;overflow:hidden;">
              <div style="background:#dc3545;color:#fff;padding:9px 14px;display:flex;align-items:center;gap:8px;font-family:'Oswald',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                ${dups.length} DUPLICATE ROW${dups.length>1?'S':''} IN CSV — SKIPPED FROM COUNT
              </div>
              <div style="padding:10px 14px;overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:11px;">
                  <thead><tr style="background:#fde8e8;">
                    <th style="padding:6px 10px;text-align:left;font-family:'Oswald',sans-serif;color:#c0392b;font-weight:600;white-space:nowrap;">CSV ROW</th>
                    <th style="padding:6px 10px;text-align:left;font-family:'Oswald',sans-serif;color:#c0392b;font-weight:600;">DISTRICT</th>
                    <th style="padding:6px 10px;text-align:left;font-family:'Oswald',sans-serif;color:#c0392b;font-weight:600;">CHIEFDOM</th>
                    <th style="padding:6px 10px;text-align:left;font-family:'Oswald',sans-serif;color:#c0392b;font-weight:600;">PHU</th>
                    <th style="padding:6px 10px;text-align:left;font-family:'Oswald',sans-serif;color:#c0392b;font-weight:600;">COMMUNITY</th>
                    <th style="padding:6px 10px;text-align:left;font-family:'Oswald',sans-serif;color:#c0392b;font-weight:600;">SCHOOL</th>
                  </tr></thead>
                  <tbody>${dups.map((r,i)=>`<tr style="background:${i%2?'#fff':'#fff5f5'};">
                    <td style="padding:5px 10px;color:#8090a0;">${r.row}</td>
                    <td style="padding:5px 10px;">${r.district}</td>
                    <td style="padding:5px 10px;">${r.chiefdom}</td>
                    <td style="padding:5px 10px;">${r.phu}</td>
                    <td style="padding:5px 10px;">${r.community}</td>
                    <td style="padding:5px 10px;font-weight:600;color:#c0392b;">${r.school}</td>
                  </tr>`).join('')}</tbody>
                </table>
              </div>
              <div style="padding:8px 14px;font-size:10px;color:#607080;border-top:1px solid #fde8e8;">Fix these duplicates in cascading_data1.csv to ensure accurate target counts.</div>
            </div>` : '';

        // ── Build HTML ───────────────────────────────────────────
        let html = sheetBanner + dupBanner + `
        <style>
        .tg-kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px;}
        .tg-kpi{background:#fff;border-radius:10px;padding:14px 10px;text-align:center;box-shadow:0 2px 8px rgba(0,64,128,.07);border-top:4px solid #004080;}
        .tg-kpi.g{border-top-color:#28a745;} .tg-kpi.r{border-top-color:#dc3545;} .tg-kpi.o{border-top-color:#f0a500;}
        .tg-kv{font-family:'Oswald',sans-serif;font-size:28px;font-weight:700;color:#004080;line-height:1;}
        .tg-kpi.g .tg-kv{color:#28a745;} .tg-kpi.r .tg-kv{color:#dc3545;} .tg-kpi.o .tg-kv{color:#b8860b;}
        .tg-kl{font-size:10px;color:#607080;text-transform:uppercase;letter-spacing:.5px;margin-top:5px;font-family:'Oswald',sans-serif;}
        .tg-nat-bar{height:14px;background:#e4eaf2;border-radius:7px;overflow:hidden;margin:10px 0 18px;}
        .tg-nat-fill{height:100%;border-radius:7px;transition:width .5s;background:linear-gradient(90deg,#004080,#1a6abf);}
        .tg-nat-lbl{font-family:'Oswald',sans-serif;font-size:11px;color:#607080;text-align:center;margin-top:-14px;position:relative;}

        /* District card */
        .tg-dist{background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,64,128,.08);overflow:hidden;margin-bottom:14px;border:2px solid #d0dce8;}
        .tg-dist-hdr{background:linear-gradient(135deg,#004080,#1a6abf);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;}
        .tg-dist-hdr svg{width:14px;height:14px;stroke:#fff;fill:none;flex-shrink:0;}
        .tg-dist-name{font-family:'Oswald',sans-serif;font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;flex:1;}
        .tg-dist-badge{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);border-radius:6px;padding:3px 10px;font-family:'Oswald',sans-serif;font-size:11px;white-space:nowrap;}
        .tg-dist-progress{height:4px;background:rgba(255,255,255,.25);}
        .tg-dist-progress-fill{height:100%;background:#c8991a;transition:width .4s;}

        /* District stats row */
        .tg-dist-stats{display:grid;grid-template-columns:repeat(4,1fr);background:#f0f6ff;border-bottom:1px solid #d0dce8;}
        .tg-dist-stat{padding:10px 8px;text-align:center;border-right:1px solid #d0dce8;}
        .tg-dist-stat:last-child{border-right:none;}
        .tg-dst-v{font-family:'Oswald',sans-serif;font-size:18px;font-weight:700;color:#004080;}
        .tg-dst-l{font-size:9px;color:#607080;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;}

        /* Chiefdom table */
        .tg-chief-wrap{overflow-x:auto;}
        .tg-chief-tbl{width:100%;border-collapse:collapse;font-size:12px;}
        .tg-chief-tbl thead tr{background:#e8f1fa;}
        .tg-chief-tbl th{padding:9px 14px;font-family:'Oswald',sans-serif;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#004080;text-align:left;white-space:nowrap;border-bottom:2px solid #c5d9f0;}
        .tg-chief-tbl td{padding:9px 14px;border-bottom:1px solid #f0f4f8;vertical-align:middle;}
        .tg-chief-tbl tr:last-child td{border-bottom:none;}
        .tg-chief-tbl tr:nth-child(even) td{background:#fafcff;}
        .tg-chief-tbl tr:hover td{background:#eef5ff;}
        .tg-prog-cell{display:flex;align-items:center;gap:8px;}
        .tg-prog-bar{background:#e4eaf2;border-radius:4px;height:8px;flex:1;overflow:hidden;min-width:60px;}
        .tg-prog-fill{height:100%;border-radius:4px;}
        .tg-school-chips{display:flex;flex-wrap:wrap;gap:3px;max-width:340px;}
        .tg-chip{display:inline-block;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:600;white-space:nowrap;}
        .tg-chip.done{background:#e8f5e9;color:#28a745;border:1px solid #b2dfcc;}
        .tg-chip.pend{background:#fff8e1;color:#b8860b;border:1px solid #ffe082;}
        .tg-expand-btn{background:none;border:none;cursor:pointer;font-family:'Oswald',sans-serif;font-size:10px;color:#004080;letter-spacing:.4px;text-decoration:underline;padding:0;white-space:nowrap;}
        </style>

        <div class="tg-kpi-row">
          <div class="tg-kpi b"><div class="tg-kv">${districts.length}</div><div class="tg-kl">Districts</div></div>
          <div class="tg-kpi"><div class="tg-kv">${districts.reduce((s,d)=>s+Object.keys(tree[d].chiefdoms).length,0)}</div><div class="tg-kl">Chiefdoms</div></div>
          <div class="tg-kpi b"><div class="tg-kv">${natSchools.toLocaleString()}</div><div class="tg-kl">Target Schools</div></div>
          <div class="tg-kpi g"><div class="tg-kv g">${natDone.toLocaleString()}</div><div class="tg-kl">Submitted</div></div>
          <div class="tg-kpi r"><div class="tg-kv r">${(natSchools-natDone).toLocaleString()}</div><div class="tg-kl">Remaining</div></div>
          <div class="tg-kpi ${natPct>=80?'g':natPct>=50?'o':'r'}"><div class="tg-kv">${natPct}%</div><div class="tg-kl">Progress</div></div>
        </div>

        <div style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;font-family:'Oswald',sans-serif;font-size:11px;color:#607080;margin-bottom:5px;">
            <span>NATIONAL PROGRESS</span><span style="font-weight:700;color:${natPct>=80?'#28a745':natPct>=50?'#b8860b':'#dc3545'}">${natDone} / ${natSchools} schools (${natPct}%)</span>
          </div>
          <div class="tg-nat-bar"><div class="tg-nat-fill" style="width:${natPct}%;background:${natPct>=80?'#28a745':natPct>=50?'#f0a500':'#dc3545'};"></div></div>
        </div>`;

        districts.forEach((district, di) => {
            const chiefdoms = Object.keys(tree[district].chiefdoms).sort();
            let dTotal = 0, dDone = 0;
            chiefdoms.forEach(c => {
                const schs = tree[district].chiefdoms[c].schools;
                dTotal += schs.length;
                dDone  += schs.filter(s => submitted.has(s.key)).length;
            });
            const dPct  = dTotal > 0 ? Math.round((dDone / dTotal) * 100) : 0;
            const dCol  = dPct >= 80 ? '#28a745' : dPct >= 50 ? '#f0a500' : '#dc3545';
            const panelId = 'tg-panel-' + di;

            html += `
            <div class="tg-dist">
              <div class="tg-dist-hdr" onclick="document.getElementById('${panelId}').style.display=document.getElementById('${panelId}').style.display==='none'?'block':'none'">
                <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span class="tg-dist-name">${district}</span>
                <span class="tg-dist-badge">${chiefdoms.length} chiefdom${chiefdoms.length!==1?'s':''}</span>
                <span class="tg-dist-badge">${dTotal} schools</span>
                <span class="tg-dist-badge" style="background:${dPct>=80?'rgba(40,167,69,.35)':dPct>=50?'rgba(240,165,0,.35)':'rgba(220,53,69,.35)'};border-color:${dCol};">${dPct}%</span>
                <svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0;"><path d="M6 9l6 6 6-6"/></svg>
              </div>
              <div class="tg-dist-progress"><div class="tg-dist-progress-fill" style="width:${dPct}%;"></div></div>

              <div id="${panelId}">
                <div class="tg-dist-stats">
                  <div class="tg-dist-stat"><div class="tg-dst-v">${chiefdoms.length}</div><div class="tg-dst-l">Chiefdoms</div></div>
                  <div class="tg-dist-stat"><div class="tg-dst-v">${dTotal}</div><div class="tg-dst-l">Target Schools</div></div>
                  <div class="tg-dist-stat"><div class="tg-dst-v" style="color:#28a745;">${dDone}</div><div class="tg-dst-l">Submitted</div></div>
                  <div class="tg-dist-stat"><div class="tg-dst-v" style="color:#dc3545;">${dTotal-dDone}</div><div class="tg-dst-l">Remaining</div></div>
                </div>

                <div class="tg-chief-wrap">
                  <table class="tg-chief-tbl">
                    <thead><tr>
                      <th>#</th>
                      <th>Chiefdom</th>
                      <th style="text-align:center;">Target</th>
                      <th style="text-align:center;">Submitted</th>
                      <th style="text-align:center;">Remaining</th>
                      <th style="min-width:160px;">Progress</th>
                      <th>Schools</th>
                    </tr></thead>
                    <tbody>`;

            chiefdoms.forEach((chiefdom, ci) => {
                const schs   = tree[district].chiefdoms[chiefdom].schools;
                const cTotal = schs.length;
                const cDone  = schs.filter(s => submitted.has(s.key)).length;
                const cPct   = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0;
                const cCol   = cPct >= 80 ? '#28a745' : cPct >= 50 ? '#f0a500' : '#dc3545';
                const chipsId = `chips-${di}-${ci}`;

                // Show first 5 schools as chips, expandable
                const chips = schs.map(s => {
                    const done  = submitted.has(s.key);
                    const label = s.name.length > 22 ? s.name.substring(0,20)+'…' : s.name;
                    return `<span class="tg-chip ${done?'done':'pend'}" title="${s.name} · ${s.community}">${done?'✓ ':''}${label}</span>`;
                }).join('');

                html += `
                      <tr>
                        <td style="color:#8090a0;font-size:11px;">${ci+1}</td>
                        <td style="font-weight:700;color:#004080;white-space:nowrap;">${chiefdom}</td>
                        <td style="text-align:center;font-weight:700;">${cTotal}</td>
                        <td style="text-align:center;font-weight:700;color:#28a745;">${cDone}</td>
                        <td style="text-align:center;font-weight:700;color:${cTotal-cDone>0?'#dc3545':'#28a745'};">${cTotal-cDone}</td>
                        <td>
                          <div class="tg-prog-cell">
                            <div class="tg-prog-bar"><div class="tg-prog-fill" style="width:${cPct}%;background:${cCol};"></div></div>
                            <span style="font-family:'Oswald',sans-serif;font-size:11px;font-weight:700;color:${cCol};white-space:nowrap;">${cPct}%</span>
                          </div>
                        </td>
                        <td>
                          <div class="tg-school-chips" id="${chipsId}">
                            ${chips}
                          </div>
                        </td>
                      </tr>`;
            });

            html += `
                    </tbody>
                  </table>
                </div>
              </div>
            </div>`;
        });

        body.innerHTML = html;

        // Set the first district panel open by default
        const firstPanel = document.getElementById('tg-panel-0');
        if (firstPanel) firstPanel.style.display = 'block';
        // Others closed
        districts.forEach((_, i) => {
            if (i > 0) {
                const p = document.getElementById('tg-panel-' + i);
                if (p) p.style.display = 'none';
            }
        });
    }

    // ── Open/close analysis ───────────────────────────────
    window.openAnalysisModal = async function(){
        const modal=document.getElementById('analysisModal');
        if(!modal)return;
        modal.classList.add('show');
        switchAnTab('analysis');   // default to analysis tab
        initDistrictFilter();

        const body=document.getElementById('analysisBody');
        const sub=document.getElementById('anSubtitle');
        if(body)body.innerHTML=`<div class="an-loading"><div class="an-spinner"></div><div class="an-load-txt">Fetching data from ICF-SL Server…</div></div>`;
        if(sub)sub.textContent='Loading…';

        // Fetch submissions; targets come from the CSV already in memory
        const sheetRows = await fetchSheetData();
        _sheetRows = sheetRows;
        window._TARGETS = buildTargetsFromCSV();

        runAnalysis(sheetRows);
    };

    window.closeAnalysisModal=function(){
        destroyCharts();
        document.getElementById('analysisModal')?.classList.remove('show');
    };

    window.anRefresh=async function(){
        const body=document.getElementById('analysisBody');
        if(body)body.innerHTML=`<div class="an-loading"><div class="an-spinner"></div><div class="an-load-txt">Refreshing from ICF-SL Server…</div></div>`;
        const rows = await fetchSheetData();
        _sheetRows = rows;
        window._TARGETS = buildTargetsFromCSV();
        runAnalysis(rows);
        // Also re-render targets if that panel is visible
        const tBody = document.getElementById('targetsBody');
        if (tBody && tBody.style.display !== 'none') renderTargetsTab();
    };

    // ════════════════════════════════════════════════════════
    //  AI STATS STRIP
    // ════════════════════════════════════════════════════════
    function statsHTML(sheetCount){
        const s=window.state||{};
        const sess=(s.submittedSchools||[]).length,pend=(s.pendingSubmissions||[]).length,drft=(s.drafts||[]).length;
        let tp=0,ti=0;
        [...(s.submittedSchools||[]).map(r=>r.data||r),...(s.pendingSubmissions||[])].forEach(r=>{tp+=+r.total_pupils||0;ti+=+r.total_itn||0;});
        const pct=tp>0?Math.round((ti/tp)*100):0;
        const sep='<div class="icf-ai-stat-div"></div>';
        return[`<div class="icf-ai-stat"><div class="icf-ai-stat-val">${sess}</div><div class="icf-ai-stat-lbl">Session</div></div>`,sep,`<div class="icf-ai-stat"><div class="icf-ai-stat-val" style="color:#28a745">${sheetCount!==null?sheetCount:'…'}</div><div class="icf-ai-stat-lbl">In Sheet</div></div>`,sep,`<div class="icf-ai-stat"><div class="icf-ai-stat-val" style="color:#e6a800">${pend}</div><div class="icf-ai-stat-lbl">Pending</div></div>`,sep,`<div class="icf-ai-stat"><div class="icf-ai-stat-val">${drft}</div><div class="icf-ai-stat-lbl">Drafts</div></div>`,sep,`<div class="icf-ai-stat"><div class="icf-ai-stat-val">${tp.toLocaleString()}</div><div class="icf-ai-stat-lbl">Pupils</div></div>`,sep,`<div class="icf-ai-stat"><div class="icf-ai-stat-val">${ti.toLocaleString()}</div><div class="icf-ai-stat-lbl">ITNs</div></div>`,sep,`<div class="icf-ai-stat"><div class="icf-ai-stat-val" style="color:${pct>=80?'#28a745':pct>=50?'#e6a800':'#dc3545'}">${pct}%</div><div class="icf-ai-stat-lbl">Coverage</div></div>`].join('');
    }

    window.icfAiRefreshStats=async function(){
        const el=document.getElementById('icfAiStats');if(el)el.innerHTML=statsHTML(null);
        setStatus('chk','Checking GAS…');
        const c=await fetchCount();
        if(el)el.innerHTML=statsHTML(c);
        setStatus(c==='?'?'err':'ok',c==='?'?'GAS unreachable':'GAS connected · '+c+' records');
    };

    function setStatus(t,m){const el=document.getElementById('icfGasStatus');if(el)el.innerHTML=`<div class="icf-pill ${t}"><div class="icf-dot"></div>${m}</div>`;}

    // ════════════════════════════════════════════════════════
    //  AI CHAT
    // ════════════════════════════════════════════════════════
    let chatHist=[];

    function buildCtx(){
        try{
            const all=mergeData(_sheetRows);if(!all.length)return null;
            let tp=0,ti=0,tb=0,tg=0;const byDist={};
            all.forEach(r=>{tp+=+r.total_pupils||0;ti+=+r.total_itn||0;tb+=+r.total_boys||0;tg+=+r.total_girls||0;const d=r.district||'Unknown';if(!byDist[d])byDist[d]={n:0,p:0,i:0};byDist[d].n++;byDist[d].p+=+r.total_pupils||0;byDist[d].i+=+r.total_itn||0;});
            const ov=tp>0?Math.round((ti/tp)*100):0;
            let ctx=`=== ICF-SL ITN DATA ===\nSchools:${all.length}|Pupils:${tp}(${tb}B/${tg}G)|Distributed:${ti}|Coverage:${ov}%\nBY DISTRICT:\n`;
            Object.entries(byDist).forEach(([d,v])=>{ctx+=`  ${d}:${v.n} schools,${v.p} pupils,${v.p>0?Math.round((v.i/v.p)*100):0}% cov\n`;});
            ctx+=`SCHOOLS:\n`;
            all.slice(0,30).forEach((r,i)=>{const vp=+r.total_pupils||0,vi=+r.total_itn||0,cov=vp>0?Math.round((vi/vp)*100):0;ctx+=`[${i+1}] ${r.school_name||'—'}(${r.community||'—'},${r.district||'—'})P:${vp},ITN:${vi},Cov:${cov}%,by:${r.submitted_by||'—'}\n`;});
            return ctx;
        }catch{return null;}
    }

    function addMsg(role,text){
        const w=document.getElementById('icfAiMessages');if(!w)return;
        const d=document.createElement('div');d.className='icf-msg '+role;
        const isAI=role==='ai';
        d.innerHTML=`<div class="icf-msg-av">${isAI?'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'}</div><div class="icf-bub"></div>`;
        w.appendChild(d);d.querySelector('.icf-bub').innerHTML=md(text);w.scrollTop=w.scrollHeight;
    }

    function showTyp(on){
        if(on){const w=document.getElementById('icfAiMessages');if(!w)return;const d=document.createElement('div');d.className='icf-msg ai';d.id='icfTyp';d.innerHTML='<div class="icf-msg-av"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div><div class="icf-bub"><div class="icf-typing"><span></span><span></span><span></span></div></div>';w.appendChild(d);w.scrollTop=w.scrollHeight;}
        else{const e=document.getElementById('icfTyp');if(e)e.remove();}
    }

    function renderSamples(){
        const r=document.getElementById('icfSqRow');if(!r)return;
        r.innerHTML='';
        pickN(4).forEach(q=>{const b=document.createElement('button');b.className='icf-sq';b.textContent=q;b.onclick=()=>icfAiAskQ(q);r.appendChild(b);});
    }

    function icfAiAskQ(q){const i=document.getElementById('icfAiInput');if(i){i.value=q;icfAiAutoResize(i);}icfAiSend();}
    window.icfAiAskQuestion=icfAiAskQ;

    window.icfAiSend=async function(){
        const inp=document.getElementById('icfAiInput'),btn=document.getElementById('icfAiSend');
        if(!inp)return;const q=inp.value.trim();if(!q)return;
        inp.value='';icfAiAutoResize(inp);
        addMsg('user',q);chatHist.push({role:'user',content:q});
        showTyp(true);if(btn)btn.disabled=true;
        try{const r=await callGAS(q,chatHist,buildCtx());showTyp(false);addMsg('ai',r);chatHist.push({role:'assistant',content:r});renderSamples();}
        catch(e){showTyp(false);addMsg('ai',`⚠️ **Error:** ${e.message}`);}
        finally{if(btn)btn.disabled=false;if(inp)inp.focus();}
    };

    window.icfAiKeydown   =e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();icfAiSend();}};
    window.icfAiAutoResize=el=>{el.style.height='auto';el.style.height=Math.min(el.scrollHeight,110)+'px';};
    window.icfAiClearChat =function(){chatHist=[];const w=document.getElementById('icfAiMessages');if(w)w.innerHTML='<div class="icf-welcome"><div class="icf-welcome-icon">🔄</div><div class="icf-welcome-title">Chat cleared</div><div class="icf-welcome-body">Ask me anything about your ITN data.</div></div><div id="icfGasStatus"></div>';renderSamples();};

    window.icfAiOpen=function(){
        document.getElementById('icfAiOverlay').classList.add('show');
        const el=document.getElementById('icfAiStats');if(el)el.innerHTML=statsHTML(null);
        renderSamples();icfAiRefreshStats();
        setTimeout(()=>{const i=document.getElementById('icfAiInput');if(i)i.focus();},200);
    };
    window.icfAiClose       =()=>document.getElementById('icfAiOverlay').classList.remove('show');
    window.icfAiOverlayClick=e=>{if(e.target.id==='icfAiOverlay')icfAiClose();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){icfAiClose();closeAnalysisModal();}});

    console.log('[ICF AI Agent] Loaded ✓');
})();
