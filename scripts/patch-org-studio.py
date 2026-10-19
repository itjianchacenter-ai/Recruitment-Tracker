# Usage: python3 scripts/patch-org-studio.py public/org-studio/index.html   (run on a FRESH copy of Org Studio index.html)
"""Patch JC Org Studio index.html so it runs inside JC People Core.
Every replacement must match exactly once, or the script aborts without writing."""
import re, sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
orig = src

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit(f"ABORT: expected {count} match(es), found {n}:\n{old[:200]}")
    src = src.replace(old, new)

# 0) explicit encoding (the page had none; nginx here does not send charset). No doctype on
#    purpose: adding one would switch the page out of the rendering mode it was built in.
rep('<title>JC Org Studio</title>', '<meta charset="utf-8">\n<title>JC Org Studio</title>')

# 1) the bridge from JC People Core
rep('<script>\n"use strict";\n', """<script>
"use strict";
/* ═══════════════════ JC People Core host ═══════════════════
   This page runs inside JC People Core (menu "Org Studio") in a SANDBOXED iframe: it has an
   origin of its own, so it cannot read People Core's login session, its database client or
   any other HR data. The only way out is this message bridge, answered by the parent page:
     load()             -> {data:<org-data.json text>, version} | null when nothing saved yet
     save(text,version) -> {ok:true,version} | {ok:false,conflict:true}   (rejects on error)
     canEdit()          -> true for People Core admin Level 2 (fixed for the session)
   The chart lives in the People Core database instead of org-data.json. Browser storage is
   not available to a sandboxed page, so localStorage / sessionStorage are replaced by a small
   in-page store that the parent keeps (under its own "orgstudio:" keys) - the draft and the
   view settings survive a reload exactly as before.
   Opened on its own (not inside People Core) the page goes back to People Core. */
const HOST=(function(){
  if(window.parent===window) return null;
  const target=(location.ancestorOrigins&&location.ancestorOrigins[0])||"*";
  let seq=0, editable=false, readyDone;
  const wait={};
  const send=function(msg){ window.parent.postMessage(Object.assign({jcOrg:1},msg),target); };
  const ask=function(op,args,ms){
    return new Promise(function(res,rej){
      const id=++seq;
      const t=setTimeout(function(){ if(wait[id]){ delete wait[id]; rej(new Error("JC People Core did not answer")); } },ms||30000);
      wait[id]={res:function(v){ clearTimeout(t); res(v); },rej:function(e){ clearTimeout(t); rej(e); }};
      send({id:id,op:op,args:args||[]});
    });
  };
  function makeStore(kind){
    const m=new Map();
    return { _m:m,
      get length(){ return m.size; },
      key:function(i){ return Array.from(m.keys())[i]==null?null:Array.from(m.keys())[i]; },
      getItem:function(k){ k=String(k); return m.has(k)?m.get(k):null; },
      setItem:function(k,v){ k=String(k); v=String(v);
        if(v.length>4500000) throw new DOMException("quota","QuotaExceededError");
        m.set(k,v); send({op:kind+":set",args:[k,v]}); },
      removeItem:function(k){ k=String(k); m.delete(k); send({op:kind+":remove",args:[k]}); },
      clear:function(){ m.forEach(function(_,k){ send({op:kind+":remove",args:[k]}); }); m.clear(); }
    };
  }
  const ls=makeStore("ls"), ss=makeStore("ss");
  [["localStorage",ls],["sessionStorage",ss]].forEach(function(p){
    try{ Object.defineProperty(window,p[0],{value:p[1],configurable:true}); }catch(e){}
  });
  window.addEventListener("message",function(e){
    if(e.source!==window.parent) return;
    const m=e.data; if(!m||m.jcOrg!==1) return;
    if(m.cmd==="relayout"){ try{ relayoutChart(); }catch(err){} return; }
    if(m.cmd==="tab"&&typeof m.tab==="string"){
      try{
        const ok=S.views.some(function(v){return v.id===m.tab})||SYS_TABS.some(function(t){return t.id===m.tab&&(!t.admin||MODE==="edit")});
        if(ok&&m.tab!==activeTab) switchTab(m.tab);
      }catch(err){}
      return;
    }
    const w=wait[m.id]; if(!w) return;
    delete wait[m.id];
    if(m.error) w.rej(new Error(m.error)); else w.res(m.result);
  });
  const ready=ask("hello").then(function(r){
    editable=!!(r&&r.canEdit);
    Object.keys((r&&r.local)||{}).forEach(function(k){ ls._m.set(k,r.local[k]); });
    Object.keys((r&&r.session)||{}).forEach(function(k){ ss._m.set(k,r.session[k]); });
  });
  return {
    ready:ready,
    load:function(){ return ask("load",[],60000); },
    save:function(text,version){ return ask("save",[text,version],120000); },
    state:function(dirty){ send({op:"state",args:[!!dirty]}); },
    canEdit:function(){ return editable; },
    /* the People Core sidebar lists the boards as its sub menus - labels go out as plain text */
    tabs:function(list,active){ send({op:"tabs",args:[list,active]}); }
  };
})();
if(!HOST){ try{ location.replace("/"); }catch(e){} throw new Error("JC Org Studio: open it from JC People Core"); }
""")
rep('''  $("#tabbar").innerHTML=chart+'<span class="tabdiv"></span>'+sys;
}''', '''  $("#tabbar").innerHTML=chart+'<span class="tabdiv"></span>'+sys;
  if(HOST){
    const txt=function(h){ try{ return new DOMParser().parseFromString(String(h),"text/html").body.textContent||""; }catch(e){ return String(h); } };
    HOST.tabs(S.views.map(function(v){ return {id:v.id,label:txt(v.label)}; })
      .concat(SYS_TABS.filter(function(t){return !t.admin||MODE==="edit"}).map(function(t){ return {id:t.id,label:t.label,sys:true}; })),activeTab);
  }
}''')
# boot only once the parent has answered (edit right + the stored draft / view settings)
rep('\nboot();\n</script>', '\nHOST.ready.then(boot,function(){ boot(); });\n</script>')

# 2) the built-in fallback chart: keep the structure, drop the people (this file is in a
#    public repository). Unit banners (g:1) keep their labels.
m = re.search(r'const SEED=\[\n(.*?)\n\];', src, re.S)
if not m: sys.exit("ABORT: SEED not found")
rows = m.group(1).split("\n")
out = []
blanked = 0
for line in rows:
    r = re.match(r'^\["([^"]*)",(null|"[^"]*"),"([^"]*)","([^"]*)","([^"]*)","([^"]*)",(\d),(\d),(\{.*\})\](,?)$', line)
    if not r:
        if line.strip():
            sys.exit("ABORT: unexpected SEED row: " + line)
        out.append(line); continue
    rid, par, role, name, dept, lvl, vac, ver, x, comma = r.groups()
    if "g:1" not in x and name:
        name, vac = "", "1"
        blanked += 1
    out.append('["%s",%s,"%s","%s","%s","%s",%s,%s,%s]%s' % (rid, par, role, name, dept, lvl, vac, ver, x, comma))
src = src[:m.start(1)] + "\n".join(out) + src[m.end(1):]
print("seed names blanked:", blanked)

# 3) autosave goes to the host
rep('''    const h={"Content-Type":"application/json"};
    if(fileTag) h["X-Jc-Tag"]=fileTag;
    const r=await fetch("./org-data.json",{method:"PUT",headers:h,body:body});
    if(r.status===409){''', '''    let r;
    if(HOST){
      const res=await HOST.save(body,fileTag);
      r={ok:!!(res&&res.ok),status:(res&&res.conflict)?409:((res&&res.ok)?200:500),
         headers:{get:function(){ return (res&&res.version!=null)?res.version:null; }}};
    }else{
    const h={"Content-Type":"application/json"};
    if(fileTag) h["X-Jc-Tag"]=fileTag;
    r=await fetch("./org-data.json",{method:"PUT",headers:h,body:body});
    }
    if(r.status===409){''')
rep('''      modal("The chart changed on disk",
        "<p style='margin:0'>Another window, or a change made outside the app, has written "+
        "<span class='mono'>org-data.json</span> since this window opened it. Saving now would "+
        "wipe that.</p>''', '''      modal(HOST?"The chart changed in JC People Core":"The chart changed on disk",
        "<p style='margin:0'>Another window, or a change made outside the app, has written "+
        (HOST?"the chart":"<span class='mono'>org-data.json</span>")+" since this window opened it. Saving now would "+
        "wipe that.</p>''')
rep('''  }catch(e){
    if(autoSaveOn===null){ autoSaveOn=false; }      /* not this deployment - stop asking */
    autoSaveMark("");
  }''', '''  }catch(e){
    if(autoSaveOn===null){ autoSaveOn=false; }      /* not this deployment - stop asking */
    autoSaveMark("");
    /* in People Core the save always exists, so a failure is a real one - say so. The draft
       in this browser still holds the edit, and the next change or Saved tries again. */
    if(HOST) toast("Could not save to JC People Core &mdash; "+esc((e&&e.message)||"error")+". Your edits are kept in this browser.");
  }''')

# 4) loading comes from the host
rep('''async function loadPublished(){
  const shared=await dbLoad();''', '''async function loadPublished(){
  if(HOST){
    try{
      const r=await HOST.load();
      if(!r||!r.data) return null;                 /* nothing saved yet */
      const d=normalize(JSON.parse(r.data));
      /* the version is taken only for a chart that was accepted: if the stored chart cannot be
         read, this window holds no version, so any save it tries is refused as out of date and
         the seed can never be written over the real chart */
      if(!d){ toast("The chart in JC People Core could not be read &mdash; nothing will be saved over it"); return null; }
      fileTag=r.version;
      return d;
    }catch(e){
      toast("Could not load the chart from JC People Core &mdash; "+esc((e&&e.message)||"error"));
      return null;
    }
  }
  const shared=await dbLoad();''')

# 5) the save endpoint question has a fixed answer in People Core
rep('''async function saveEndpointLive(){
  if(autoSaveOn===true) return true;''', '''async function saveEndpointLive(){
  if(HOST){ autoSaveOn=true; return true; }
  if(autoSaveOn===true) return true;''')
rep('''  loadUI();
  /* One plain GET, before anything else can ask. If a file is behind the page there is no
     reason to keep a draft beside it, and no reason to ever ask which of the two is real. */
  try{''', '''  loadUI();
  /* One plain GET, before anything else can ask. If a file is behind the page there is no
     reason to keep a draft beside it, and no reason to ever ask which of the two is real. */
  if(HOST){ autoSaveOn=true; fileTag=null; }
  else try{''')

# 6) who may edit = People Core admin Level 2 (no passphrase / Microsoft gate in here)
rep('''  if(MODE==="edit"){ signOutLocal(); setMode("present"); toast("Back to presentation mode"); return; }
  const c=authCfg();''', '''  if(MODE==="edit"){ signOutLocal(); setMode("present"); toast("Back to presentation mode"); return; }
  if(HOST){
    if(!HOST.canEdit()){ toast("Level 1 &middot; view only &mdash; editing the chart needs admin Level 2"); return; }
    try{ sessionStorage.setItem(SS_ADMIN,"1"); }catch(e){}
    enterEdit(); return;
  }
  const c=authCfg();''')
rep('''  const c=authCfg();
  if(c.clientId){
    if(c.gateViewers) showViewerGate();''', '''  const c=authCfg();
  if(HOST){ if(!HOST.canEdit()) $("#btnAdmin").hidden=true; }
  else if(c.clientId){
    if(c.gateViewers) showViewerGate();''')
rep('''  if(unlocked||wantEdit){
    if(unlocked) enterEdit();''', '''  if(HOST&&!HOST.canEdit()){ /* view only */ }
  else if(unlocked||wantEdit){
    if(unlocked) enterEdit();''')
rep('''  if(w) w.hidden=!!(c.clientId||c.requirePass);   /* recomputed on every sync */''',
    '''  if(w) w.hidden=!!(HOST||c.clientId||c.requirePass);   /* recomputed on every sync */''')

# 7) wording where the save target is named
rep('''    toast(autoSaveOn===true
      ? "Saved to org-data.json"''', '''    toast(autoSaveOn===true
      ? (HOST?"Saved to JC People Core":"Saved to org-data.json")''')
rep('''    b.title="Every change is written to org-data.json on this computer";''',
    '''    b.title=HOST?"Every change is saved to JC People Core":"Every change is written to org-data.json on this computer";''')
rep('''<p class="empty">Click any box to edit it. Changes are saved to this browser only &mdash; press <b>Publish</b> to produce the <span class="mono">org-data.json</span> file your server serves to everyone.</p>''',
    '''<p class="empty" id="editHelp">Click any box to edit it. Changes are saved to this browser only &mdash; press <b>Publish</b> to produce the <span class="mono">org-data.json</span> file your server serves to everyone.</p>''')
rep('''  if(w) w.hidden=!!(HOST||c.clientId||c.requirePass);   /* recomputed on every sync */''',
    '''  if(w) w.hidden=!!(HOST||c.clientId||c.requirePass);   /* recomputed on every sync */
  const eh=$("#editHelp");
  if(eh&&HOST) eh.innerHTML="Click any box to edit it. Every change is saved to JC People Core a moment after you make it &mdash; everyone with access sees it on their next load.";''')

# 8) hardening (security audit 2026-10-19) — chart data is untrusted input: it comes from
#    imports (JSON / Excel) and from whoever edited last. Rendered as HTML in many places, so
#    the shape is checked and the HTML-bearing fields are made safe once, in normalize().
rep("""function normalize(d){
  if(!d||!d.nodes||!Object.keys(d.nodes).length) return null;""", """const ID_RE=/^[A-Za-z0-9_.:-]{1,64}$/, HEX_RE=/^#[0-9A-Fa-f]{3,8}$/;
const PHOTO_RE=/^(data:image\\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\\/=]+|@[^<>"'`]*)$/;
/* text from a label that may hold entities (&middot;) or markup -> plain text, never run */
function plainText(h){ try{ return new DOMParser().parseFromString(String(h==null?"":h),"text/html").body.textContent||""; }catch(e){ return String(h==null?"":h); } }
/* labels and section titles are written into the page as HTML: keep them as escaped text */
const safeLabel=function(h){ return esc(plainText(h)); };
/* reject a chart whose ids could break out of an attribute, or whose parts are not the shape
   the renderer assumes - a bad import must fail here, not after it has been saved */
function chartShapeOk(d){
  if(!d||typeof d!=="object"||!d.nodes||typeof d.nodes!=="object"||Array.isArray(d.nodes)) return false;
  for(const k of Object.keys(d.nodes)){
    const n=d.nodes[k];
    if(!ID_RE.test(k)||!n||typeof n!=="object") return false;
    if(n.id==null) n.id=k;
    if(n.id!==k) return false;
    if(n.parentId!=null&&n.parentId!==""&&!(typeof n.parentId==="string"&&ID_RE.test(n.parentId))) return false;
  }
  if(d.views!=null){
    if(!Array.isArray(d.views)) return false;
    for(const v of d.views){
      if(!v||typeof v!=="object"||!ID_RE.test(String(v.id))||!Array.isArray(v.sections)) return false;
      for(const sec of v.sections) if(!sec||typeof sec!=="object"||!Array.isArray(sec.ids)) return false;
    }
  }
  if(d.depts!=null){
    if(!Array.isArray(d.depts)) return false;
    for(const x of d.depts) if(!x||typeof x!=="object"||!ID_RE.test(String(x.id))) return false;
  }
  if(d.levels!=null){
    if(!Array.isArray(d.levels)) return false;
    for(const l of d.levels) if(!l||typeof l!=="object"||!ID_RE.test(String(l.code))) return false;
  }
  return true;
}
function sanitizeChart(o){
  (o.views||[]).forEach(function(v){
    v.label=safeLabel(v.label);
    (v.sections||[]).forEach(function(sec){ sec.title=safeLabel(sec.title||""); });
  });
  (o.depts||[]).forEach(function(x){ if(!HEX_RE.test(String(x.color||""))) x.color="#78827E"; });
  Object.keys(o.nodes).forEach(function(k){
    const n=o.nodes[k];
    if(n.color&&!HEX_RE.test(String(n.color).trim())) n.color="";
    if(n.photo&&!PHOTO_RE.test(String(n.photo))) n.photo="";
  });
  Object.keys(o.photos||{}).forEach(function(k){ if(!PHOTO_RE.test(String(o.photos[k]))) delete o.photos[k]; });
  Object.keys(o.jd||{}).forEach(function(k){
    const r=o.jd[k]; if(r&&r.file&&!/^[A-Za-z0-9._-]+\\.pdf$/i.test(String(r.file))) delete r.file;
  });
  return o;
}
function normalize(d){
  if(!d||!d.nodes||!Object.keys(d.nodes).length) return null;
  if(!chartShapeOk(d)) return null;""")
rep("""  const codes=new Set(out.levels.map(l=>l.code));""", """  sanitizeChart(out);
  const codes=new Set(out.levels.map(l=>l.code));""")
# the Tabs editor: typed text is text, not markup
rep("""    if(f==="label") v.label=e.target.value;
    if(f==="sectitle") v.sections[+e.target.closest(".vsec").dataset.s].title=e.target.value;""",
    """    if(f==="label") v.label=esc(e.target.value);
    if(f==="sectitle") v.sections[+e.target.closest(".vsec").dataset.s].title=esc(e.target.value);""")
rep("""value='"+esc(v.label.replace(/&middot;/g,"·").replace(/&amp;/g,"&"))+"'>""", """value='"+esc(plainText(v.label))+"'>""")
rep("""value='"+esc(sec.title||"")+"'>""", """value='"+esc(plainText(sec.title||""))+"'>""")
# Excel import: an id that could break out of an attribute gets a fresh one instead
rep("""    let id=cell(r,"id");""", """    let id=cell(r,"id");
    if(id&&!ID_RE.test(id)){ id=""; }""")
# names in dialog titles / toasts are text
rep("""  toast(mode==="in" ? "Now reports to "+(t.role||label(t))""", """  toast(mode==="in" ? "Now reports to "+esc(t.role||label(t))""")
rep("""  confirmModal("Delete "+label(n),""", """  confirmModal("Delete "+esc(label(n)),""")
rep("""    confirmModal("Delete "+d.name,""", """    confirmModal("Delete "+esc(d.name),""")
# colours reach style="" unescaped here
rep("""  return String(n.color||"").trim() || deptOf(n.dept).color;""", """  const c=String(n.color||"").trim();
  return (HEX_RE.test(c)?c:"") || (HEX_RE.test(String(deptOf(n.dept).color||""))?deptOf(n.dept).color:"#78827E");""")
# a job title "__proto__" must not reach Object.prototype
rep("""  /* one entry per distinct job title, with how many boxes carry it */
  const by={};""", """  /* one entry per distinct job title, with how many boxes carry it */
  const by=Object.create(null);""")
# pdf.js 3.11: CVE-2024-4367 (font code run via eval) - turn eval off; no jd/ folder in People Core
rep("""lib.getDocument({data:bytes.slice(0)})""", """lib.getDocument({data:bytes.slice(0),isEvalSupported:false})""")
rep("""  if(rec.file){""", """  if(rec.file&&!HOST&&/^[A-Za-z0-9._-]+\\.pdf$/i.test(String(rec.file))){""")
# a file that is not JSON is a message, not an exception
rep("""    const d=normalize(JSON.parse(fr.result||"null"));""", """    let d=null;
    try{ d=normalize(JSON.parse(fr.result||"null")); }catch(e){ d=null; }""")

# 9) data-integrity fixes (robustness audit 2026-10-19)
# 9a) every edit is numbered, and the draft remembers which saved version it was built on
rep("""let autoSaveOn=null;                 /* null = not tried yet, false = not available here */""",
    """let autoSaveOn=null;                 /* null = not tried yet, false = not available here */
let editSeq=0;                       /* bumped by every edit - a save only "clears" the edits it carried */
let hostLoadFailed=false;            /* People Core: the stored chart could not be read - no editing */
const LS_DRAFT_BASE="jc-org-draft-base";
function draftBaseMark(){ if(HOST){ try{ localStorage.setItem(LS_DRAFT_BASE,String(fileTag==null?"":fileTag)); }catch(e){} } }""")
rep("""function saveDraft(){
  dirty=true;
  try{localStorage.setItem(LS_DRAFT,JSON.stringify(packState(S)));}""", """function saveDraft(){
  dirty=true; editSeq++;
  draftBaseMark();
  try{localStorage.setItem(LS_DRAFT,JSON.stringify(packState(S)));}""")
rep("""  HPOS=i; histBusy=true;
  S=pixRestore(JSON.parse(HIST[HPOS]));""", """  HPOS=i; histBusy=true; editSeq++; draftBaseMark();
  S=pixRestore(JSON.parse(HIST[HPOS]));""")
# 9b) a save that finished while newer edits were made must not mark those edits saved
rep("""  autoSaveBusy=true;
  const body=JSON.stringify(packState(S),null,2);""", """  autoSaveBusy=true;
  const seqAt=editSeq;
  const body=JSON.stringify(packState(S),null,2);""")
rep("""    fileTag=r.headers.get("X-Jc-Tag")||fileTag;
    autoSaveOn=true;
    PUBLISHED=JSON.parse(JSON.stringify(S));""", """    fileTag=r.headers.get("X-Jc-Tag")||fileTag;
    autoSaveOn=true;
    if(HOST&&editSeq!==seqAt){
      /* edits were made while this save was in flight: they are not in what was saved, so the
         draft that holds them stays, the page stays "unsaved", and they go in the next save */
      draftBaseMark(); autoSaveBusy=false; autoSaveSoon(); return;
    }
    PUBLISHED=JSON.parse(JSON.stringify(S));""")
# 9c) a stored chart that could not be loaded blocks editing (nothing may be saved over it)
rep("""  if(HOST){
    try{
      const r=await HOST.load();""", """  if(HOST){
    hostLoadFailed=false;
    try{
      const r=await HOST.load();""")
rep("""      if(!d){ toast("The chart in JC People Core could not be read &mdash; nothing will be saved over it"); return null; }""",
    """      if(!d){ hostLoadFailed=true; toast("The chart in JC People Core could not be read &mdash; nothing will be saved over it"); return null; }""")
rep("""    }catch(e){
      toast("Could not load the chart from JC People Core &mdash; "+esc((e&&e.message)||"error"));
      return null;""", """    }catch(e){
      hostLoadFailed=true;
      toast("Could not load the chart from JC People Core &mdash; "+esc((e&&e.message)||"error"));
      return null;""")
rep("""  const fileMode=await saveEndpointLive();
  if(fileMode){
    const fresh=await loadPublished();
    if(fresh) PUBLISHED=fresh;
  }
  const draft=loadDraft();
  const forked=!!(draft&&PUBLISHED&&JSON.stringify(draft)!==JSON.stringify(PUBLISHED));
  if(fileMode&&!forked){
    try{ localStorage.removeItem(LS_DRAFT); }catch(e){}
    if(PUBLISHED) S=JSON.parse(JSON.stringify(PUBLISHED));
    dirty=false;
    enterEditRender();
    return;
  }""", """  const fileMode=await saveEndpointLive();
  if(fileMode){
    const fresh=await loadPublished();
    if(fresh) PUBLISHED=fresh;
  }
  if(HOST&&hostLoadFailed){
    toast("The chart could not be loaded &mdash; reload the page before editing");
    return;
  }
  const draft=loadDraft();
  const forked=!!(draft&&PUBLISHED&&JSON.stringify(draft)!==JSON.stringify(PUBLISHED));
  /* People Core: a draft built on an older saved version must not be saved over a newer one */
  let draftBase=null; try{ draftBase=localStorage.getItem(LS_DRAFT_BASE); }catch(e){}
  const draftStale=!!(HOST&&forked&&String(draftBase)!==String(fileTag==null?"":fileTag));
  if(fileMode&&!forked){
    if(PUBLISHED){
      try{ localStorage.removeItem(LS_DRAFT); }catch(e){}
      S=JSON.parse(JSON.stringify(PUBLISHED));
      dirty=false;
    }else if(draft){ S=draft; dirty=true; }          /* nothing saved yet: the draft is the only copy */
    enterEditRender();
    return;
  }""")
rep("""      if(b.dataset.m==="draft"){S=draft;dirty=true;if(fileMode)autoSaveSoon()}""",
    """      if(b.dataset.m==="draft"&&draftStale){
        /* someone saved after these edits were made: hand them over as a file instead of
           writing them over the newer chart, and carry on from the newer chart */
        offerFile("org-data-unsaved-edits.json",JSON.stringify(packState(draft),null,2),"application/json");
        S=JSON.parse(JSON.stringify(PUBLISHED));dirty=false;
        try{ localStorage.removeItem(LS_DRAFT); }catch(e){}
        toast("Your earlier edits were downloaded as a file &mdash; the chart shows the newer saved version");
      }
      else if(b.dataset.m==="draft"){S=draft;dirty=true;if(fileMode)autoSaveSoon()}""")
rep("""          "the file as it stands now?</p>"
        : "<p style='margin:0'>This browser has edits""", """          "the file as it stands now?</p>"+
          (draftStale?"<p class='note'>The chart was saved by someone else after these edits were made, so they cannot be saved over it. You can download them as a file and start from the newer chart.</p>":"")
        : "<p style='margin:0'>This browser has edits""")
rep("""      (fileMode?"Keep this window's edits":"Continue draft")+"</button>");""",
    """      (draftStale?"Download my edits":(fileMode?"Keep this window's edits":"Continue draft"))+"</button>");""")
# 9d) undo history starts from the chart that editing starts from
rep("""function enterEditRender(){
  const dept=focusDept, box=sel;""", """function enterEditRender(){
  const dept=focusDept, box=sel;
  histReset();""")
# 9e) a parent loop in stored or imported data would hang every viewer: break it on load
rep("""  sanitizeChart(out);
  const codes=new Set(out.levels.map(l=>l.code));""", """  sanitizeChart(out);
  Object.keys(out.nodes).forEach(function(id){
    const seen=new Set([id]); let p=out.nodes[id].parentId;
    while(p){
      if(!out.nodes[p]||seen.has(p)){ out.nodes[id].parentId=null; break; }
      seen.add(p); p=out.nodes[p].parentId;
    }
  });
  const codes=new Set(out.levels.map(l=>l.code));""")
# 9f) PDF filing: there is no jd/ folder behind People Core - say so instead of pointing at one
rep("""    if(!put.ok&&put.why==="no-store"){
      /* self-hosted: there is no store, so the file goes in the jd/ folder by hand */""", """    if(!put.ok&&put.why==="no-store"&&HOST){
      closeModal();
      await offerFile(jdId(job.key)+".pdf",stamped,"application/pdf");
      modal("PDF not filed",
        "<p style='margin:0'>Filing JD PDFs is not available inside JC People Core yet. The stamped PDF was downloaded so it is not lost; keep it with the HR documents.</p>"+
        "<p class='note'>The Job Highlight and KPI lines typed in the chart are saved as usual.</p>",
        "<button class='btn btn--sm btn--primary' data-m='c'>Close</button>");
      $("#modalFoot").onclick=closeModal;
      return;
    }
    if(!put.ok&&put.why==="no-store"){
      /* self-hosted: there is no store, so the file goes in the jd/ folder by hand */""")
# 9g) tell People Core whether there are unsaved edits (it asks before signing out)
rep("""function updatePublishState(){
  const b=$("#btnPublish"); if(!b) return;""", """function updatePublishState(){
  if(HOST&&HOST.state) HOST.state(!!dirty);
  const b=$("#btnPublish"); if(!b) return;""")

if src == orig: sys.exit("ABORT: nothing changed")
open(path, "w", encoding="utf-8").write(src)
print("patched OK")
