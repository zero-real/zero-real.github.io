/* Zero-real Agent Policy (ZAP): page script (video slots, race, charts, figures, carousels, contents rail). */
(function(){
'use strict';
var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='text')e.textContent=attrs[k];else if(k==='html')e.innerHTML=attrs[k];else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c)e.appendChild(c);});return e;}
var MINF=0;
function sv(tag, attrs, text){if(MINF&&attrs['font-size']!=null&&attrs['font-size']<MINF)attrs['font-size']=MINF;var e=document.createElementNS(SVGNS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;return e;}

/* ---------- fallback media list (replaced by media/manifest.json when present) ---------- */
var FALLBACK = {videos:[
 {id:'hero',file:'hero.mp4',kind:'hero',prompt:'Highlights from real-rig episodes',prompt_verified:false},
 {id:'real_test_tube',file:'real_test_tube.mp4',kind:'real',prompt:'Place the test tube in the test tube rack',prompt_verified:false},
 {id:'real_test_tube_topleft',file:'real_test_tube_topleft.mp4',kind:'real',prompt:'Place the test tube in the top-left hole of the rack',prompt_verified:false},
 {id:'real_handoff',file:'real_handoff.mp4',kind:'real',prompt:'Hand the test tube from one arm to the other in mid-air, then place it in the rack',prompt_verified:false},
 {id:'real_tictactoe',file:'real_tictactoe.mp4',kind:'real',prompt:'Draw an X in the center of the tic-tac-toe board',prompt_verified:false},
 {id:'real_chess',file:'real_chess.mp4',kind:'real',prompt:'Make the winning chess move',prompt_verified:false},
 {id:'fail_five_tubes',file:'fail_five_tubes.mp4',kind:'real',prompt:'Place five test tubes in the rack',prompt_verified:false},
 {id:'fail_fruit_sort',file:'fail_fruit_sort.mp4',kind:'real',prompt:'Sort the fruit by color: orange left, yellow middle, red right',prompt_verified:false},
 {id:'race_ours',file:'race_ours.mp4',kind:'race',speed:8,prompt:'',prompt_verified:false},
 {id:'race_astra',file:'race_astra.mp4',kind:'race',speed:8,prompt:'',prompt_verified:false}
]};

var MEDIA = {};
function indexManifest(m){
  MEDIA = {};
  (m.videos||[]).forEach(function(v){ MEDIA[v.id]=v; });
}
function mediaPath(p){ if(!p) return ''; return /^(https?:|\/|media\/)/.test(p) ? p : 'media/'+p; }
function versioned(p,ver){ return (p&&ver) ? p+(p.indexOf('?')<0?'?':'&')+'v='+ver : p; }

/* ---------- video component ---------- */
var PLAY_ICON='<svg viewBox="0 0 10 10"><path d="M1.5 0l8 5-8 5z"/></svg>', PAUSE_ICON='<svg viewBox="0 0 10 10"><path d="M1 0h3v10H1zM6 0h3v10H6z"/></svg>';
var lazyObs = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){loadSrc(e.target);lazyObs.unobserve(e.target);}});},{rootMargin:'400px 0px'}) : null;
// Autoplay: a clip plays while it is on screen. Carousel clips (v._inCar defined) must also be
// inside their carousel's visible scroll area. With prefers-reduced-motion nothing autoplays.
// A clip in the open lightbox counts as visible, so scrolling a tall enlarged race never pauses one lane.
function visible(v){ return (LB&&LB.node&&LB.node.contains(v)) || (v._inView && v._inCar!==false); }
function syncPlay(v){ if(!visible(v)){ if(!v.paused) v.pause(); return; } if(v._auto&&!RM&&!v._userPaused&&!v._hidden){ loadSrc(v); safePlay(v); } }
var playObs = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){es.forEach(function(e){e.target._inView=e.isIntersecting; syncPlay(e.target);});},{threshold:0.3}) : null;
function loadSrc(v){ if(v._loaded) return; v._loaded=true; if(v.preload!=='auto') v.preload='metadata'; v.src=v.dataset.src; }
function applyRate(v){ if(v._rate&&v.playbackRate!==v._rate){ v.defaultPlaybackRate=v._rate; v.playbackRate=v._rate; } }
function safePlay(v){ applyRate(v); var p=v.play(); if(p&&p.catch)p.catch(function(){}); }
function missing(frame, v, entry){
  frame.classList.add('missing'); frame.innerHTML='';
  frame.appendChild(el('div',{class:'ph',text:'Video pending · '+(entry.file||entry.id)}));
}
function badgeText(entry, seg, opts){
  if(seg&&seg.speed) return (+seg.speed)+'×'+(seg.speed_note?' · '+seg.speed_note:'');
  if(entry.id==='real_chess') return '5×'; // 41.4 s clip covers the 216.5 s episode (~5.2x overall)
  return entry.speed ? (Math.round(entry.speed*10)/10)+'×' : '';
}
/* ---------- lightbox: click a clip to enlarge it ---------- */
// The clip's own node (its .vid, or the whole .race for a race lane) moves into a modal <dialog>
// and back, so the same <video> keeps decoding: currentTime, playbackRate, captions and the race
// timers carry over with no second load. A same-height placeholder holds the page layout meanwhile.
var CAN_LB = typeof HTMLDialogElement==='function' && 'showModal' in HTMLDialogElement.prototype;
var ZOOM_ICON='<svg viewBox="0 0 12 12"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg>', CLOSE_ICON='<svg viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11"/></svg>';
var LB=null;
function lbEl(){
  if(LB) return LB;
  var x=el('button',{class:'lb-close',type:'button','aria-label':'Close enlarged video',html:CLOSE_ICON});
  var stage=el('div',{class:'lb-stage'});
  var d=el('dialog',{class:'lb','aria-modal':'true','aria-label':'Enlarged video'},[x,stage]);
  x.addEventListener('click',function(){ d.close(); });
  d.addEventListener('click',function(e){ if(e.target===d||e.target===stage) d.close(); }); // backdrop
  d.addEventListener('close',lbRestore); // Esc, the close button and the backdrop all end here
  window.addEventListener('resize',function(){ if(LB.node) lbFit(); });
  document.body.appendChild(d);
  LB={d:d,stage:stage,x:x,node:null}; return LB;
}
// Largest width at which the node (frames plus labels, prompt, lane heads) fits the stage;
// frame height scales with width and the rest barely does, so a few passes converge. It never
// drops below the inline width (the stacked race on a phone scrolls instead of shrinking).
function lbFit(){
  var n=LB.node, st=LB.stage, cs=getComputedStyle(st), fs=n.querySelectorAll('.vid-frame');
  var aw=st.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight), ah=LB.d.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom), w=aw;
  for(var i=0;i<3;i++){ n.style.width=w+'px'; var fh=0; fs.forEach(function(f){fh+=f.offsetHeight;}); if(!fh) break; w=Math.floor(Math.min(aw,Math.max(LB.w0,w*(ah-(n.offsetHeight-fh))/fh))); }
  n.style.width=w+'px';
}
function lbOpen(w){
  var L=lbEl(), n=w._lbNode||w; if(L.node||!n.parentNode) return;
  var ph=el('div',{class:'lb-ph','aria-hidden':'true'}); ph.style.height=n.offsetHeight+'px';
  document.documentElement.classList.add('lb-open'); // also turns off scroll anchoring, which would follow the moved node
  n.parentNode.insertBefore(ph,n);
  L.node=n; L.ph=ph; L.w0=n.offsetWidth; L.from=document.activeElement;
  L.stage.appendChild(n); // a synchronous move does not pause a playing <video>
  L.d.setAttribute('aria-label',w._lbLabel||'Enlarged video');
  L.d.showModal(); L.x.focus(); lbFit();
  if(!w._lbNode){ var v=w._video; loadSrc(v); v._userPaused=false; safePlay(v); } // race lanes keep the race's own state
}
function lbRestore(){
  var L=LB, n=L&&L.node; if(!n) return;
  n.style.width=''; L.ph.parentNode.insertBefore(n,L.ph); L.ph.parentNode.removeChild(L.ph); L.node=null;
  document.documentElement.classList.remove('lb-open');
  if(L.from&&L.from.focus&&document.contains(L.from)) L.from.focus({preventScroll:true});
}

function makeVideo(entry, opts){
  opts=opts||{};
  var wrap=el('div',{class:'vid'});
  var res=(entry.output_resolution||'').split('x').map(Number);
  var isTrip = res.length===2&&res[1] ? (res[0]/res[1]>4) : (entry.kind==='real' || entry.kind==='hero' || opts.triptych);
  var frame=el('div',{class:'vid-frame'});
  frame.style.aspectRatio = (res.length===2&&res[1]) ? (res[0]+'/'+res[1]) : (entry.kind==='train' ? '16/9' : (isTrip ? '16/3' : '4/3'));
  var v=document.createElement('video');
  v.muted=true; v.defaultMuted=true; v.setAttribute('muted',''); v.setAttribute('playsinline',''); v.playsInline=true; v.preload='none';
  if(opts.loop!==false){v.loop=true;v.setAttribute('loop','');}
  if(entry.poster) v.poster=versioned(mediaPath(entry.poster),entry.v);
  v.dataset.src=versioned(mediaPath(entry.file),entry.v);
  v._auto = opts.autoplay!==false;
  if(opts.rate){ // some browsers reset playbackRate on load and on loop, so set it again each time
    v._rate=opts.rate; v.defaultPlaybackRate=opts.rate;
    ['loadedmetadata','loadeddata','play','playing','seeked'].forEach(function(t){ v.addEventListener(t,function(){applyRate(v);}); });
  }
  v.setAttribute('aria-label', 'Video: '+(entry.prompt||entry.id));
  frame.appendChild(v);
  var badge=el('span',{class:'badge',text:badgeText(entry, entry.segments&&entry.segments[0], opts)}); if(badge.textContent) frame.appendChild(badge);
  var btn=el('button',{class:'vid-toggle',type:'button','aria-label':'Play video',html:PLAY_ICON});
  btn.addEventListener('click',function(){ loadSrc(v); if(v.paused){v._userPaused=false;safePlay(v);} else {v._userPaused=true;v.pause();} });
  v.addEventListener('play',function(){btn.innerHTML=PAUSE_ICON;btn.setAttribute('aria-label','Pause video');});
  v.addEventListener('pause',function(){btn.innerHTML=PLAY_ICON;btn.setAttribute('aria-label','Play video');});
  frame.appendChild(btn);
  if(CAN_LB){ // enlarge from the corner button or a click anywhere on the clip except its buttons
    var zb=el('button',{class:'vid-zoom',type:'button','aria-label':'Enlarge video',html:ZOOM_ICON});
    zb.addEventListener('click',function(){ lbOpen(wrap); });
    frame.appendChild(zb); frame.classList.add('zoomable');
    frame.addEventListener('click',function(e){ if(e.target.closest('button')||frame.classList.contains('missing')||(LB&&LB.node)) return; lbOpen(wrap); });
    wrap._lbLabel='Enlarged video: '+(entry.prompt||entry.id);
  }
  v.addEventListener('loadedmetadata',function(){ if(v.videoWidth&&v.videoHeight) frame.style.aspectRatio=v.videoWidth+'/'+v.videoHeight; });
  v.addEventListener('error',function(){ missing(frame,v,entry); if(wrap._onMissing) wrap._onMissing(); });
  wrap.appendChild(frame);
  if(isTrip && opts.views!==false) wrap.appendChild(el('div',{class:'views','aria-hidden':'true'},[el('span',{text:'Left wrist'}),el('span',{text:'Overhead'}),el('span',{text:'Right wrist'})]));
  if(opts.caption!==false && (entry.prompt || entry.segments)){
    var pr=el('p',{class:'prompt'+(entry.prompt_verified===false?' unverified':'')},[el('span',{class:'k',text:opts.label||'Prompt'}),el('span',{class:'t',text:entry.prompt||''})]);
    wrap.appendChild(pr);
    if(entry.segments && entry.segments.length){
      var t=pr.querySelector('.t'), last=null;
      pr.classList.remove('unverified');
      var upd=function(){var ct=v.currentTime,s=null;for(var i=0;i<entry.segments.length;i++){var g=entry.segments[i];if(ct>=g.start&&ct<g.end){s=g;break;}}var sg=s||entry.segments[0];var txt=sg.prompt;if(txt!==last){t.textContent=txt;last=txt;var bt=badgeText(entry,sg);badge.textContent=bt;if(bt&&!badge.parentNode)frame.appendChild(badge);}};
      v.addEventListener('timeupdate',upd); v.addEventListener('seeked',upd); upd();
      // timeupdate fires only ~4x/s, so at 6x a caption could lag the cut by >1 s of robot time;
      // switch on the exact decoded frame where supported, else every animation frame while playing.
      if('requestVideoFrameCallback' in v){ var vfc=function(){ upd(); v.requestVideoFrameCallback(vfc); }; v.requestVideoFrameCallback(vfc); }
      else { var raf=function(){ if(!v.paused) upd(); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
    }
  }
  wrap._video=v; wrap._frame=frame;
  if(opts.eager){ v.preload='auto'; loadSrc(v); }
  if(lazyObs&&!opts.eager) lazyObs.observe(v); else loadSrc(v);
  if(playObs) playObs.observe(v); else if(v._auto&&!RM){loadSrc(v);safePlay(v);}
  return wrap;
}

/* ---------- render all [data-video] slots ---------- */
var steerVids=[];
function renderSlots(){
  document.querySelectorAll('[data-video]').forEach(function(slot){
    var id=slot.getAttribute('data-video'); var entry=MEDIA[id]||{id:id,file:id+'.mp4',kind:'real',prompt:''};
    var opts={};
    if(slot.dataset.race){opts.autoplay=false;opts.loop=false;}
    if(slot.dataset.hero){opts.eager=true;opts.label='Task';}
    slot.innerHTML='';
    var w=makeVideo(entry,opts); slot.appendChild(w);
    if(slot.dataset.steer) steerVids.push(w._video);
    if(slot.dataset.race){ setupLane(slot.dataset.race, w, entry); w._lbNode=slot.closest('.race'); w._lbLabel='Enlarged race: ZAP and GPT-6 Astra side by side'; }
  });
}

/* ---------- race ---------- */
var RACE={ours:{cost:0.29,lane:'lane-ours'},astra:{cost:4.87,lane:'lane-astra'}};
function fmtT(s){s=Math.max(0,Math.round(s));var m=Math.floor(s/60);var r=s%60;return m+':'+(r<10?'0':'')+r;}
function setupLane(key,w,entry){
  var r=RACE[key]; var lane=document.getElementById(r.lane); r.v=w._video; r.frame=w._frame;
  r.speed=entry.speed||8; r.orig=entry.orig_duration_s||null;
  var tEl=lane.querySelector('[data-t]'), cEl=lane.querySelector('[data-c]'), nEl=lane.querySelector('[data-n]');
  var ts=entry.turn_starts_s||[];
  function tick(){var v=r.v; var dur=r.orig||(v.duration? v.duration*r.speed : 0); var real=Math.min(v.currentTime*r.speed, dur||Infinity); tEl.textContent=fmtT(real); var frac=dur? Math.min(real/dur,1):0; cEl.textContent='$'+(r.cost*frac).toFixed(2); if(nEl){var n=0;for(var i=0;i<ts.length;i++){if(ts[i]<=real&&v.currentTime>0)n=i+1;} nEl.textContent=String(n);} }
  r.tick=tick;
  r.v.addEventListener('timeupdate',tick);
  r.v.addEventListener('ended',function(){ r.v.currentTime=r.v.duration; var dur=r.orig||r.v.duration*r.speed; tEl.textContent=fmtT(dur); cEl.textContent='$'+r.cost.toFixed(2); if(nEl&&ts.length)nEl.textContent=String(ts.length); stamp(r,'Done · '+fmtT(dur)); });
  r.v.addEventListener('seeking',tick);
}
function stamp(r,txt){ if(!r.frame||r.frame.classList.contains('missing'))return; var s=r.frame.querySelector('.stamp'); if(!s){s=el('div',{class:'stamp'});r.frame.appendChild(s);} s.textContent=txt; s.hidden=false; }
function raf(){ ['ours','astra'].forEach(function(k){var r=RACE[k]; if(r.v&&!r.v.paused&&r.tick)r.tick();}); if(RACE.ours.v&&(!RACE.ours.v.paused||(RACE.astra.v&&!RACE.astra.v.paused))) requestAnimationFrame(raf); }
// The race autoplays when it scrolls into view (both clips from t=0, in sync), loops with a short
// pause after the longer clip ends, pauses while off screen, and can be restarted with Replay.
// With prefers-reduced-motion it only plays on request.
var RS={started:false,inView:false,loopTimer:null,pending:false,gen:0};
function raceLanes(){ return ['ours','astra'].map(function(k){return RACE[k];}).filter(function(r){return r.v&&!r.frame.classList.contains('missing');}); }
function raceStart(){
  clearTimeout(RS.loopTimer); RS.pending=false; RS.started=true; var gen=++RS.gen;
  var vs=raceLanes(); if(!vs.length) return;
  vs.forEach(function(r){ loadSrc(r.v); r.v.preload='auto'; r.v.pause(); r._ended=false; var s=r.frame.querySelector('.stamp'); if(s)s.hidden=true; try{r.v.currentTime=0;}catch(e){} if(r.tick)r.tick(); });
  var ready=0, go=false;
  function begin(){ if(go||gen!==RS.gen)return; go=true; if(!RS.inView&&!RS.forced){return;} RS.forced=false; vs.forEach(function(r){r.v._userPaused=false; safePlay(r.v);}); requestAnimationFrame(raf); }
  setTimeout(begin,2500);
  vs.forEach(function(r){ if(r.v.readyState>=3){ if(++ready===vs.length) begin(); } else { r.v.addEventListener('canplay',function h(){r.v.removeEventListener('canplay',h); if(++ready===vs.length) begin();}); } });
}
function raceEnded(r){ r._ended=true; var vs=raceLanes(); if(vs.every(function(x){return x._ended;})){ var gen=RS.gen; RS.loopTimer=setTimeout(function(){ if(gen!==RS.gen)return; if(RS.inView&&!RM) raceStart(); else RS.pending=true; },2500); } }
function raceVisible(on){
  RS.inView=on;
  if(on){ if(RM&&!RS.started) return; if(!RS.started||RS.pending) raceStart(); else raceLanes().forEach(function(r){ if(!r._ended&&r.v.paused){safePlay(r.v);} }); requestAnimationFrame(raf); }
  else raceLanes().forEach(function(r){ if(!r.v.paused) r.v.pause(); });
}
function setupRaceAuto(){
  var fig=document.getElementById('fig-race'), btn=document.getElementById('race-play');
  if(RM) btn.querySelector('span').textContent='Play both';
  btn.addEventListener('click',function(){ RS.forced=true; RS.inView=true; raceStart(); btn.querySelector('span').textContent='Replay'; });
  ['ours','astra'].forEach(function(k){ var r=RACE[k]; if(r.v) r.v.addEventListener('ended',function(){raceEnded(r);}); });
  if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ raceVisible(es[0].isIntersecting); },{threshold:0.35}).observe(fig); }
  else if(!RM){ RS.inView=true; raceStart(); }
}
(document.getElementById('steer-play')||{addEventListener:function(){}}).addEventListener('click',function(){
  steerVids.forEach(function(v){ loadSrc(v); v._userPaused=false; try{v.currentTime=0;}catch(e){} safePlay(v); });
});

/* ---------- real-world data (per-row counts from the eval tracker) ---------- */
var MODELS=[{k:'ours',n:'ZAP',s:'ZAP'},{k:'astra',n:'GPT-6 Astra (our harness)',s:'Astra, our harness'},{k:'rc',n:'GPT-6 Astra (Robocurve harness)',s:'Astra, Robocurve'},{k:'molmo',n:'MolmoAct2',s:'MolmoAct2'},{k:'qwen',n:'Base Qwen 3.6 27B',s:'Base Qwen 3.6 27B'}];
// Per-task dot matrix: successes out of 3 trials per model, in MODELS order, with optional operator notes.
// Normalized to 3 trials per task (see the comment above #fig-trials in index.html).
var TRIALS=3, MX_LABEL={ours:'ZAP'};
var TASKS=[
 {name:'Mustard in left bin',prompt:'Put the mustard in the left bin',c:[3,3,2,1,0]},
 {name:'Pack canned food',prompt:'Pack canned foods into the bin',c:[3,2,1,1,1],notes:{molmo:'It can pick up the canned food, but gets confused when it sees the mustard in the bin.',qwen:'One trial put the arm in an unsafe posture and was stopped.'}},
 {name:'Marker in mug',prompt:'Put the whiteboard marker in the mug',c:[2,3,1,0,0]},
 {name:'Cube and banana in bowl',prompt:'Put the cube and the banana in the bowl',c:[3,3,0,2,0],notes:{molmo:'The failed trial did not grasp the banana.'}},
 {name:'Rubik’s cube in bowl',prompt:'Put the Rubiks cube in the bowl',c:[3,3,0,3,0]},
 {name:'White cup to table center',prompt:'Put the white cup in the center of the table.',c:[3,3,1,0,2],notes:{molmo:'Two trials knocked the cup over and could not pick it up again, though they pushed it to the center. One did not identify the white cup.'}},
 {name:'Stack two blocks',prompt:'Stack the left block onto the right block',c:[3,3,2,0,0],notes:{qwen:'Failed or got stuck, but called done with success.'}},
 {name:'Cube behind bowl',prompt:'Put the rubiks cube behind the bowl',c:[3,3,0,0,0],notes:{molmo:'Put the cube in the bowl instead.',qwen:'Did not place the cube behind the bowl; put it inside the bowl.'}},
 {name:'Canned food in grey bin',prompt:'Put the canned food in the grey bin',c:[3,3,1,3,2],notes:{molmo:'Always picked the canned food first, but then also placed other items in the bin.'}},
 {name:'Three bananas in bin',prompt:'Make sure there are 3 (three) bananas in the grey bin.',c:[3,3,3,0,0],notes:{molmo:'Put all five bananas in the bin.'}}
];
// Bar chart totals are derived from the per-task dots above, so the two figures cannot drift.
var CUM={};
MODELS.forEach(function(m,i){ CUM[m.k]=[TASKS.reduce(function(a,t){return a+t.c[i];},0), TASKS.length*TRIALS]; });
function pctText(p){ return (Math.round(p*1000)/10).toFixed(1)+'%'; }
// One bar panel: rows are {n: label, p: success in [0, 1], ours: bool}.
function barPanel(title, sub, rows){
  var p=el('div',{class:'bar-panel'}); p.appendChild(el('h4',{html:title+(sub?' <span>· '+sub+'</span>':'')}));
  rows.forEach(function(r){
    var row=el('div',{class:'bar-row'+(r.ours?' ours':'')+(r.t?' '+r.t:'')});
    row.appendChild(el('span',{class:'name',text:r.n}));
    var tr=el('div',{class:'track',role:'img','aria-label':r.n+': '+pctText(r.p)+' success'}); var f=el('div',{class:'fill'}); f.style.width=(r.p*100).toFixed(1)+'%'; tr.appendChild(f); row.appendChild(tr);
    row.appendChild(el('span',{class:'val',text:pctText(r.p)}));
    p.appendChild(row);
  });
  p.appendChild(el('div',{class:'axis'},[el('span'),el('div',{class:'ticks'},['0','25','50','75','100%'].map(function(x){return el('span',{text:x});})),el('span')]));
  return p;
}
function renderBars(){
  document.getElementById('bars').appendChild(barPanel('Real-world tasks','10 tasks, 3 trials each',MODELS.map(function(m){var c=CUM[m.k];return {n:m.n,p:c[1]?c[0]/c[1]:0,ours:m.k==='ours',t:m.k==='astra'||m.k==='rc'?'frontier':''};})));
}
// Robolab-120 in simulation (paper Tables 3 and 5).
function renderSimBars(){
  var host=document.getElementById('sim-bars'); if(!host) return;
  host.appendChild(barPanel('Bimanual YAM','the robot we trained on',[
    {n:'ZAP (SFT + RL)',p:0.740,ours:true},{n:'GPT-6 Astra',p:0.722,t:'frontier'},{n:'Opus 5.5',p:0.612,t:'frontier'},{n:'ZAP (SFT only)',p:0.583,t:'variant'},{n:'Base Qwen 3.6 27B',p:0.083}]));
  host.appendChild(barPanel('Single-arm Franka','never seen in training',[
    {n:'ZAP (trained on YAM only)',p:0.559,ours:true},{n:'Lakeside',p:0.510},{n:'FLUX 3 Action',p:0.429}]));
}
var tip=document.getElementById('tip');
function showTip(dot){
  var d=dot._d; tip.innerHTML='';
  tip.appendChild(el('span',{class:'m',text:d.model+' · trial '+d.i+' of '+d.n}));
  tip.appendChild(el('b',{text:(d.ok?'Success':'Failure')+' · '+d.task}));
  if(d.note) tip.appendChild(el('div',{text:d.note}));
  tip.hidden=false;
  var r=dot.getBoundingClientRect(), tw=tip.offsetWidth, th=tip.offsetHeight;
  var x=Math.min(Math.max(8,r.left+r.width/2-tw/2), window.innerWidth-tw-8);
  var y=r.top-th-10; if(y<8) y=r.bottom+10;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
function hideTip(){tip.hidden=true;}
function renderMatrix(){
  var dm=document.getElementById('dm'); if(!dm) return;
  dm.appendChild(el('div',{class:'hd'}));
  MODELS.forEach(function(m){dm.appendChild(el('div',{class:'hd'+(m.k==='ours'?' ours':''),text:MX_LABEL[m.k]||m.n}));});
  [0].forEach(function(){
    TASKS.forEach(function(t){
      dm.appendChild(el('div',{class:'task'},[document.createTextNode(t.name),el('small',{text:'“'+t.prompt+'”'})]));
      MODELS.forEach(function(m,i){
        var s=t.c[i], note=(t.notes&&t.notes[m.k])||'', name=MX_LABEL[m.k]||m.n, cell=el('div',{class:'cell'+(m.k==='ours'?' ours':'')});
        for(var j=0;j<TRIALS;j++){
          var ok=j<s;
          var dot=el('button',{type:'button',class:'dot'+(ok?' s':''),'aria-label':name+', '+t.name+', trial '+(j+1)+': '+(ok?'success':'failure')+(note?'. Note: '+note:'')});
          dot._d={model:name,task:t.name,i:j+1,n:TRIALS,ok:ok,note:note};
          dot.addEventListener('mouseenter',function(){showTip(this);});
          dot.addEventListener('mouseleave',hideTip);
          dot.addEventListener('focus',function(){showTip(this);});
          dot.addEventListener('blur',hideTip);
          dot.addEventListener('click',function(e){e.stopPropagation(); if(!tip.hidden&&tip._for===this){hideTip();tip._for=null;} else {showTip(this);tip._for=this;}});
          cell.appendChild(dot);
        }
        dm.appendChild(cell);
      });
    });
  });
  document.addEventListener('click',hideTip);
  window.addEventListener('scroll',hideTip,{passive:true});
  var sx=dm.parentNode; if(sx) sx.addEventListener('scroll',hideTip,{passive:true});
}

/* ---------- reward staircase ---------- */
function renderStair(){
  var g=document.getElementById('stair-g');
  var base=290, top1=120; var yL=function(v){return base-(v/1.0)*(base-top1);}; // 0..1 lower segment
  var brk1=104, brk2=90; var yU=function(v){return brk2-(v-4.6)/(5.1-4.6)*(brk2-18);}; // 4.6..5.1 upper segment
  var narrow=(document.getElementById('fig-reward').clientWidth||600)<520;
  document.getElementById('stair').setAttribute('viewBox', narrow?'0 0 400 330':'0 0 560 330'); MINF=narrow?12.5:0;
  var X0=narrow?52:64, GX=narrow?390:540, ink3='var(--ink-3)';
  [0,0.2,0.4,0.6,0.8,1.0].forEach(function(v){var y=yL(v); g.appendChild(sv('line',{x1:X0,x2:GX,y1:y,y2:y,stroke:'var(--rule)','stroke-width':1})); g.appendChild(sv('text',{x:X0-10,y:y+4,'text-anchor':'end','font-size':12,fill:ink3},v.toFixed(1)));});
  g.appendChild(sv('line',{x1:X0,x2:GX,y1:yU(5.0),y2:yU(5.0),stroke:'var(--rule)','stroke-width':1}));
  g.appendChild(sv('text',{x:X0-10,y:yU(5.0)+4,'text-anchor':'end','font-size':12,fill:ink3},'5.0'));
  // axis with break
  g.appendChild(sv('line',{x1:X0,x2:X0,y1:base,y2:brk1,stroke:ink3}));
  g.appendChild(sv('line',{x1:X0,x2:X0,y1:brk2,y2:14,stroke:ink3}));
  g.appendChild(sv('path',{d:'M'+(X0-7)+' '+(brk1+3)+'l14 -6M'+(X0-7)+' '+(brk2+3)+'l14 -6',stroke:ink3,fill:'none'}));
  g.appendChild(sv('text',{x:14,y:(base+top1)/2,'font-size':12,fill:'var(--ink-2)',transform:'rotate(-90 14 '+((base+top1)/2)+')','text-anchor':'middle'},'Reward'));
  var XS=narrow?[68,152,236,320]:[92,204,316,428];
  var cols=[{x:92,v:0.2,l:'Approach',sub:'up to 0.2'},{x:204,v:0.75,l:'Grasp + lift',sub:'0.2 + up to 0.55'},{x:316,v:0.9,l:'Transport',sub:'up to 0.9'},{x:428,v:5.0,l:'Success',sub:'5.0'}];
  var W=narrow?70:88; cols.forEach(function(c,i){c.x=XS[i];});
  cols.forEach(function(c,i){
    var cls='bar b'+(i+1);
    if(i<3){
      var grp=sv('g',{class:cls});
      if(i===1){ grp.appendChild(sv('rect',{x:c.x,y:yL(0.2),width:W,height:base-yL(0.2),fill:'var(--neutral-1)'})); grp.appendChild(sv('rect',{x:c.x,y:yL(0.75),width:W,height:yL(0.2)-yL(0.75),fill:'var(--neutral-2)'})); }
      else grp.appendChild(sv('rect',{x:c.x,y:yL(c.v),width:W,height:base-yL(c.v),fill:i===0?'var(--neutral-2)':'var(--neutral-1)'}));
      g.appendChild(grp);
      g.appendChild(sv('text',{x:c.x+W/2,y:yL(c.v)-8,'text-anchor':'middle','font-size':14,'font-weight':600,fill:'var(--ink)'},String(c.v)));
    } else {
      var grp2=sv('g',{class:cls});
      grp2.appendChild(sv('rect',{x:c.x,y:brk1,width:W,height:base-brk1,fill:'var(--accent)'}));
      grp2.appendChild(sv('rect',{x:c.x,y:yU(5.0),width:W,height:brk2-yU(5.0),fill:'var(--accent)'}));
      g.appendChild(grp2);
      g.appendChild(sv('path',{d:'M'+(c.x-4)+' '+(brk1+1)+' l'+(W/4+2)+' -5 l'+(W/4)+' 5 l'+(W/4)+' -5 l'+(W/4+2)+' 5 M'+(c.x-4)+' '+(brk2+1)+' l'+(W/4+2)+' -5 l'+(W/4)+' 5 l'+(W/4)+' -5 l'+(W/4+2)+' 5',stroke:'var(--bg)','stroke-width':5,fill:'none'}));
      g.appendChild(sv('text',{x:c.x+W/2,y:yU(5.0)-7,'text-anchor':'middle','font-size':15,'font-weight':700,fill:'var(--accent-ink)'},'5.0'));
    }
    g.appendChild(sv('text',{x:c.x+W/2,y:base+20,'text-anchor':'middle','font-size':13,'font-weight':600,fill:'var(--ink)'},c.l));
    g.appendChild(sv('text',{x:c.x+W/2,y:base+36,'text-anchor':'middle','font-size':11.5,fill:ink3},c.sub));
  });
  g.appendChild(sv('text',{x:XS[1]+W/2,y:(yL(0.2)+yL(0.75))/2+4,'text-anchor':'middle','font-size':11,fill:'var(--bg)'},'lift'));
  g.appendChild(sv('text',{x:XS[1]+W/2,y:(base+yL(0.2))/2+4,'text-anchor':'middle','font-size':11,fill:'var(--bg)'},'grasp'));
  g.appendChild(sv('text',{x:XS[3]-8,y:yU(5.0)+30,'text-anchor':'end','font-size':12,fill:'var(--ink-2)'},'5.6× the best partial score'));
  MINF=0;
  var st=document.getElementById('stair');
  if(!RM && 'IntersectionObserver' in window){ var o=new IntersectionObserver(function(es){ if(es[0].isIntersecting && document.visibilityState==='visible'){ st.classList.add('play'); o.disconnect(); } },{threshold:0.5}); o.observe(st); }
}

/* ---------- prefix tree ---------- */
function renderTree(){
  var g=document.getElementById('tree-g'), ink3='var(--ink-3)';
  var narrow=(document.getElementById('fig-tree').clientWidth||600)<520;
  g.parentNode.setAttribute('viewBox', narrow?'0 0 400 250':'0 0 560 250'); MINF=narrow?12.5:0;
  var tx=narrow?function(x){return 20+(x-20)*0.62;}:function(x){return x;};
  var N={r:[280,30],a:[150,95],b:[410,95],a1:[80,160],a2:[210,160],b1:[350,160],b2:[470,160],a21:[170,222],a22:[250,222],b21:[430,222],b22:[510,222]};
  var E=[['r','a'],['r','b'],['a','a1'],['a','a2'],['b','b1'],['b','b2'],['a2','a21'],['a2','a22'],['b2','b21'],['b2','b22']];
  Object.keys(N).forEach(function(k){N[k][0]=tx(N[k][0]);});
  var best=['r','b','b2','b22'];
  E.forEach(function(e){var p=N[e[0]],c=N[e[1]];var on=best.indexOf(e[0])>=0&&best.indexOf(e[1])>=0;g.appendChild(sv('line',{x1:p[0],y1:p[1],x2:c[0],y2:c[1],stroke:on?'var(--accent)':'var(--neutral-2)','stroke-width':on?2:1.2}));});
  Object.keys(N).forEach(function(k){var p=N[k];var pruned=(k==='a1'||k==='a21'||k==='b1');var win=k==='b22';var onp=best.indexOf(k)>=0;
    g.appendChild(sv('circle',{cx:p[0],cy:p[1],r:k==='r'?11:9,fill:win?'var(--accent)':(onp?'var(--accent-soft)':'var(--bg)'),stroke:win||onp?'var(--accent)':'var(--neutral-1)','stroke-width':1.5}));
    if(pruned) g.appendChild(sv('path',{d:'M'+(p[0]-5)+' '+(p[1]-5)+'l10 10M'+(p[0]+5)+' '+(p[1]-5)+'l-10 10',stroke:ink3,'stroke-width':1.5}));
  });
  g.appendChild(sv('text',{x:tx(298),y:34,'font-size':12,fill:'var(--ink-2)'},'Reset scene'));
  g.appendChild(sv('text',{x:tx(428),y:99,'font-size':12,fill:'var(--ink-2)'},'after move'));
  g.appendChild(sv('text',{x:tx(488),y:164,'font-size':12,fill:'var(--ink-2)'},'after grasp'));
  g.appendChild(sv('text',{x:tx(510),y:246,'text-anchor':'middle','font-size':12,'font-weight':600,fill:'var(--accent-ink)'},'success'));
  g.appendChild(sv('text',{x:tx(64),y:190,'text-anchor':'middle','font-size':11.5,fill:ink3},'pruned'));
  g.appendChild(sv('text',{x:20,y:20,'font-size':11.5,fill:ink3},'best-first path in blue'));
  MINF=0;
}

/* ---------- copy BibTeX ---------- */
document.getElementById('copy-bib').addEventListener('click',function(){
  var txt=document.getElementById('bibtex').textContent, out=document.getElementById('copied');
  function fallback(){ var r=document.createRange(); r.selectNodeContents(document.getElementById('bibtex')); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); var ok=false; try{ok=document.execCommand('copy');}catch(e){} out.textContent= ok?'Copied':'Selected. Press Ctrl+C or Cmd+C to copy.'; }
  try{ navigator.clipboard.writeText(txt).then(function(){out.textContent='Copied';},fallback); }catch(e){ fallback(); }
});

/* ---------- contents rail: highlight the current part ---------- */
(function(){
  var toc=document.getElementById('toc'); if(!toc) return;
  var links=[].slice.call(toc.querySelectorAll('a[href^="#"]'));
  var parts=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1));});
  var cur=-1;
  function upd(){
    var line=window.innerHeight*0.3, idx=-1;
    parts.forEach(function(p,i){ if(p&&p.getBoundingClientRect().top<=line) idx=i; });
    // at the very bottom the last part may never reach the line; highlight it anyway
    if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-2) idx=parts.length-1;
    if(idx===cur) return; cur=idx;
    links.forEach(function(a,i){ var on=i===idx; a.classList.toggle('on',on); if(on)a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current'); });
  }
  var q=0; function sched(){ if(!q) q=requestAnimationFrame(function(){q=0;upd();}); }
  window.addEventListener('scroll',sched,{passive:true}); window.addEventListener('resize',sched); upd();
  // hide the rail while the full-bleed hero is on screen
  var hero=document.getElementById('top');
  if(hero&&'IntersectionObserver' in window){ new IntersectionObserver(function(es){ toc.classList.toggle('hide', es[0].isIntersecting); },{threshold:0.15}).observe(hero); }
  else toc.classList.remove('hide');
})();

/* ---------- placeholder links (e.g. Paper, until it exists) ---------- */
document.querySelectorAll('a[aria-disabled="true"]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();});});

/* ---------- theme toggle (initial theme is set by theme.js in <head>) ---------- */
(function(){ var bs=[].slice.call(document.querySelectorAll('.theme-btn')); if(!bs.length)return; var root=document.documentElement;
  var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
  function current(){ var t=root.getAttribute('data-theme'); if(t==='light'||t==='dark')return t; return mq&&mq.matches?'dark':'light'; }
  function label(){ var d=current()==='dark'; bs.forEach(function(b){ b.setAttribute('aria-label', d?'Switch to light theme':'Switch to dark theme'); b.setAttribute('aria-pressed', d?'true':'false'); }); }
  bs.forEach(function(b){ b.addEventListener('click',function(){ var next=current()==='dark'?'light':'dark'; root.setAttribute('data-theme',next); try{localStorage.setItem('theme',next);}catch(e){} label(); }); });
  if(mq&&mq.addEventListener) mq.addEventListener('change',label);
  label();
})();

/* ---------- mounts ---------- */
function mount(id,fn,arg){ var m=document.getElementById(id); if(typeof window[fn]==='function'){ try{ m.textContent=''; m.classList.add('live'); var pr=window[fn](m,arg); if(pr&&pr.catch)pr.catch(function(e){ if(window.console)console.error(e); }); }catch(e){ m.classList.remove('live'); m.textContent='This interactive figure failed to load.'; if(window.console)console.error(e);} } }
mount('orientation-mount','mountOrientationWidget');
mount('episode-mount','mountEpisodeExplorer',{dataUrl:'data/episode.json',basePath:''});

/* ---------- boot ---------- */
renderBars(); renderSimBars(); renderMatrix(); renderStair(); renderTree();
var OVERRIDES={
  // Author-confirmed 2026-10-26: this run used a top-left prompt.
  real_test_tube_topleft:{prompt:'Place the test tube in a hole at the top left of the rack',prompt_verified:true,prompt_full:null}
};
function boot(m){ indexManifest(m); Object.keys(OVERRIDES).forEach(function(id){ if(MEDIA[id]) for(var k in OVERRIDES[id]) MEDIA[id][k]=OVERRIDES[id][k]; }); FALLBACK.videos.forEach(function(v){ if(!MEDIA[v.id]&&v.kind!=='train') MEDIA[v.id]=v; });
  renderSlots(); setupRaceAuto(); }
fetch('media/manifest.json',{cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }).then(boot).catch(function(){ boot({videos:[]}); });
})();

/* ---------- citations: open References and scroll to the entry ---------- */
(function(){
  function openRef(hash){
    if(!/^#(ref|app)-/.test(hash||'')) return false;
    var li=document.getElementById(hash.slice(1)); if(!li) return false;
    var d=li.closest('details'); if(d) d.open=true;
    li.classList.add('ref-hit'); setTimeout(function(){ li.classList.remove('ref-hit'); },1800);
    li.scrollIntoView({block:'center',behavior:'instant'});
    return true;
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a.cite, a.xref'); if(!a) return;
    if(openRef(a.hash)){ e.preventDefault(); try{ history.pushState(null,'',a.hash); }catch(_){} }
  });
  window.addEventListener('hashchange',function(){ openRef(location.hash); });
  if(location.hash.indexOf('#ref-')===0){
    // media slots render after load and shift the layout, so re-anchor a few times
    openRef(location.hash);
    window.addEventListener('load',function(){ [0,500,1500].forEach(function(t){ setTimeout(function(){ if(location.hash.indexOf('#ref-')===0) openRef(location.hash); },t); }); });
  }
})();
