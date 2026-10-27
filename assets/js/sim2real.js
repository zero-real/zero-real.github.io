/* Figure 1: "Sim -> Real, same agent in the loop".
 * A fully vector, 10 s seamless loop drawn in one inline SVG. Every frame is a
 * pure function of time t (render(t)), so playback can pause off-screen and an
 * exporter can drive it deterministically: ?s2r_t=<seconds> renders one still,
 * ?s2r_layout=wide|tall|square forces a layout, and window.__s2r.set(t) seeks.
 * prefers-reduced-motion shows one composed static frame. */
(function(){
'use strict';
var host = document.getElementById('s2r'); if(!host) return;
var Q = new URLSearchParams(location.search);
var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var T_FIX = Q.has('s2r_t') ? parseFloat(Q.get('s2r_t')) : null;
var FORCE = Q.get('s2r_layout');
var LOOP = 15, STATIC = RM && T_FIX === null;

function clamp(x,a,b){ return x<a?a:x>b?b:x; }
function seg(t,a,b){ return clamp((t-a)/(b-a),0,1); }
function ease(x){ return x<.5 ? 4*x*x*x : 1-Math.pow(-2*x+2,3)/2; }
function eout(x){ return 1-Math.pow(1-x,3); }
function lerp(a,b,u){ return a+(b-a)*u; }
function mix(p,q,u){ return [lerp(p[0],q[0],u), lerp(p[1],q[1],u)]; }
function f1(v){ return Math.round(v*10)/10; }
// Polyline with rounded corners of radius r.
function rp(pts,r){
  var d='M'+pts[0].join(' ');
  for(var i=1;i<pts.length-1;i++){
    var p=pts[i-1], c=pts[i], n=pts[i+1];
    var a=Math.hypot(c[0]-p[0],c[1]-p[1]), b=Math.hypot(n[0]-c[0],n[1]-c[1]), k=Math.min(r,a/2,b/2);
    d+=' L'+f1(c[0]+(p[0]-c[0])/a*k)+' '+f1(c[1]+(p[1]-c[1])/a*k)+' Q'+c.join(' ')+' '+f1(c[0]+(n[0]-c[0])/b*k)+' '+f1(c[1]+(n[1]-c[1])/b*k);
  }
  return d+' L'+pts[pts.length-1].join(' ');
}

/* ---------- copy (tool calls are real calls from data/episode.json, truncated) ---------- */
var SIM_CHIPS = ['move_to(left: [0.41, 0.20, 0.12], …)', 'move_to(left: [0.41, 0.20, 0.00], …)', 'set_gripper(left: 0, right: 0)', 'move_to(left: [0.41, 0.20, 0.15], …)'];
var REAL_CHIPS = ['move_to(left: [0.41, 0.20, 0.03], …)', 'set_gripper(left: 0)', 'move_to(left: […, 0.22], tilt: 90, …)', 'move_to(right: [0.38, 0.05, 0.31], …)',
  'set_gripper(left: 1, right: 0)', 'move_to(left: [0.30, 0.25, 0.20], …)', 'move_to(right: [0.39, -0.24, 0.15], …)', 'move_to(right: [0.39, -0.24, 0.01], …)'];
var HOLD = ['matches GPT-6 Astra', '3× faster', '17× cheaper'];

/* ---------- layouts (the panels are drawn in local 360x280 units) ---------- */
var LAYOUTS = {
  wide: { vb:[1200,530], hs:12, chip:13, tile:1,
    sim:{x:40,y:64,s:1}, real:{x:800,y:64,s:1}, lap:{x:600,y:204,w:136,h:88,f:28},
    obsL:'M400 150 C468 150 468 186 532 186', obsR:'M800 150 C732 150 732 186 668 186',
    actL:rp([[575,248],[575,392],[220,392],[220,344]],16), actR:rp([[625,248],[625,392],[980,392],[980,344]],16),
    trkL:[[478,392],[378,392]], trkR:[[722,392],[822,392]],
    bnd:[[600,64,600,160],[600,248,600,470]], sr:[600,18], tag:{x:600,y:42,f:13},
    lbl:[[466,136,'middle','observations'],[734,136,'middle','observations'],[400,418,'middle','tool calls'],[800,418,'middle','tool calls']],
    hold:{x:600,y:510,f:22,one:true} },
  tall: { vb:[400,1006], hs:13, chip:12.5, tile:1,
    sim:{x:20,y:40,s:1}, real:{x:20,y:630,s:1}, lap:{x:200,y:462,w:136,h:84,f:28},
    obsL:'M130 320 C130 372 168 368 168 420', actL:'M232 420 C232 368 270 372 270 320',
    obsR:'M130 630 C130 566 168 568 168 504', actR:'M232 504 C232 568 270 566 270 630',
    trkL:[[200,398],[200,344]], trkR:[[200,526],[200,566]],
    bnd:[[14,462,124,462],[276,462,386,462]], sr:[20,452,'start'], tag:{x:380,y:434,f:12,two:true},
    lbl:[], hold:{x:200,y:954,f:19} },
  square: { vb:[1000,1000], hs:14, chip:14, tile:1.15,
    sim:{x:50,y:156,s:1.111}, real:{x:550,y:156,s:1.111}, lap:{x:500,y:650,w:152,h:94,f:32},
    obsL:'M330 467 C330 586 366 640 424 640', obsR:'M670 467 C670 586 634 640 576 640',
    actL:rp([[456,697],[456,804],[150,804],[150,467]],18), actR:rp([[544,697],[544,804],[850,804],[850,467]],18),
    trkL:[[350,804],[260,804]], trkR:[[650,804],[740,804]],
    bnd:[[500,92,500,603],[500,697,500,860]], sr:[500,40], tag:{x:500,y:66,f:15},
    lbl:[[318,598,'end','observations'],[682,598,'start','observations'],[300,832,'middle','tool calls'],[700,832,'middle','tool calls']],
    hold:{x:500,y:922,f:30,one:true} }
};

/* ---------- panel scenes ---------- */
var SIM = { S:[[60,168],[300,168]], L1:74, L2:70,
  rest:[112,124], hover:[150,140], grasp:[150,182], lift:[150,120], rrest:[246,128] };
// Real beat: the left arm picks up a lying tube, turns it cap-up, hands it to the right arm by the cap, retreats;
// the right arm seats it in the rack. Wrist targets W are gripper flange points; a = gripper angle (0 = pointing down).
var REAL = { S:[[54,150],[306,150]], L1:88, L2:84, GL:24, G:8, GR:26, CAP:25.5,
  lrest:[96,112], lhover:[150,140], lgrasp:[150,174], lhand:[150,128], lback:[116,128],
  rrest:[276,104], rabove:[174,44], rhand:[174,68.5], rup:[174,56], rcarry:[258,90], rinsert:[258,116] };

function simPanel(){
  return '<rect class="fr" x=".75" y=".75" width="358.5" height="278.5" rx="14"/>'+
  '<text class="lab" x="18" y="32" font-size="16">Simple tasks</text>'+
  '<text class="sm" x="342" y="32" font-size="12" text-anchor="end" font-family="var(--f-mono)">training</text>'+
  '<line class="trk" x1="18" y1="46" x2="342" y2="46"/><line class="pf" data-k="prog" x1="18" y1="46" x2="18" y2="46"/>'+
  '<g data-k="simc">'+
  // wireframe table
  '<path class="grid" d="M54 199H306M126 176L108 222M180 176V222M234 176L252 222"/>'+
  '<path class="ln" d="M72 176H288L324 222H36Z"/>'+
  // bowl and a spare block
  '<ellipse class="ln" cx="222" cy="190" rx="20" ry="4"/><path class="ln" d="M202 190C202 208 242 208 242 190"/>'+
  '<rect class="ln" x="257" y="190" width="14" height="14" rx="1.5"/>'+
  '<rect class="lnf" data-k="blk" x="141" y="186" width="18" height="18" rx="1.5"/>'+
  armSim(0)+armSim(1)+'</g>'+
  '<text class="sm" x="18" y="266" font-size="13">trains here</text>';
}
function armSim(i){
  var S=SIM.S[i];
  return '<rect class="lnf" x="'+(S[0]-12)+'" y="'+S[1]+'" width="24" height="12" rx="2"/>'+
    '<polyline class="ln" data-k="sl'+i+'"/><path class="ln" data-k="sg'+i+'"/>'+
    '<circle class="lnf" data-k="sj'+i+'a" r="3"/><circle class="lnf" data-k="sj'+i+'b" r="3"/>';
}
function realPanel(){
  return '<rect class="fr" x=".75" y=".75" width="358.5" height="278.5" rx="14"/>'+
  '<g data-k="realc">'+
  '<text class="lab" x="18" y="32" font-size="16">Complex manipulation and reasoning</text>'+
  // table with thickness, receding edges and legs
  '<path class="bk" d="M48 166H312M20 214L48 166M340 214L312 166"/>'+
  '<path class="ln" d="M20 214H340V222H20Z"/><rect class="ln" x="28" y="222" width="8" height="30"/><rect class="ln" x="324" y="222" width="8" height="30"/>'+
  // cup
  '<path class="lnf" d="M96 186L99 204H115L118 186Z"/><ellipse class="lnf" cx="107" cy="186" rx="11" ry="2.6"/>'+
  // rack: top face and holes, then the tube, then the front face so a seated tube's lower end is hidden
  '<path class="lnf" d="M214 180L222 172H302L294 180Z"/>'+
  '<ellipse class="ln" cx="238" cy="176" rx="5" ry="1.8"/><ellipse class="ln" cx="258" cy="176" rx="5" ry="1.8"/><ellipse class="ln" cx="278" cy="176" rx="5" ry="1.8"/>'+
  '<g data-k="tube"><rect class="lnf" x="-5" y="-21" width="10" height="49" rx="5"/><path class="ln" d="M-5 6H5"/><rect class="lnf" x="-6" y="-30" width="12" height="9" rx="1.5"/></g>'+
  '<rect class="lnf" x="214" y="180" width="80" height="24"/><path class="lnf" d="M294 180L302 172V196L294 204Z"/>'+
  armReal(0)+armReal(1)+'</g>'+
  '<text class="sm" data-k="realcap" x="18" y="266" font-size="13">deploys here · never seen in training</text>';
}
function armReal(i){
  var S=REAL.S[i];
  return '<rect class="lnf" x="'+(S[0]-18)+'" y="190" width="36" height="6" rx="1"/><rect class="lnf" x="'+(S[0]-10)+'" y="'+S[1]+'" width="20" height="40" rx="4"/>'+
    '<path class="co" data-k="rl'+i+'"/><path class="ci" data-k="rm'+i+'"/>'+
    '<g data-k="rg'+i+'"><rect class="lnf" x="-5" y="0" width="10" height="6" rx="1"/><rect class="lnf" x="-14" y="6" width="28" height="10" rx="2"/>'+
    '<rect class="lnf" data-k="rf'+i+'a" y="16" width="4" height="16" rx="1"/><rect class="lnf" data-k="rf'+i+'b" y="16" width="4" height="16" rx="1"/></g>'+
    '<circle class="lnf" data-k="rj'+i+'a" r="6.5"/><circle class="dotk" data-k="rk'+i+'a" r="2"/><circle class="lnf" data-k="rj'+i+'b" r="6"/><circle class="dotk" data-k="rk'+i+'b" r="2"/>';
}
function tile(real){
  var sc = real ? '<path class="tl" d="M5 21H35"/><rect class="tl" x="20" y="15" width="12" height="6"/><path class="tl" d="M8 18H17M26 15V8M24.5 8H27.5"/>'
                : '<path class="tl" d="M5 21H35M9 16L31 16"/><rect class="tl" x="13" y="11" width="6" height="6"/><path class="tl" d="M28 4L24 9V12"/>';
  return '<rect class="tb" x="0" y="0" width="40" height="28" rx="4"/>'+sc;
}

/* ---------- build ---------- */
var K = {}, LY = null, LNAME = null, lens = {};
function build(name){
  LNAME = name; LY = LAYOUTS[name]; var L = LY, h = '', W = L.vb[0], H = L.vb[1];
  h += '<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true" focusable="false">';
  h += '<defs><marker id="s2r-an" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L8 5L1 9" class="mk-n"/></marker>'+
       '<marker id="s2r-aa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L8 5L1 9" class="mk-a"/></marker></defs>';
  // boundary + tag
  h += '<g data-k="bnd">';
  L.bnd.forEach(function(b){ h += '<line class="bnd" x1="'+b[0]+'" y1="'+b[1]+'" x2="'+b[2]+'" y2="'+b[3]+'"/>'; });
  h += '<text class="sm" x="'+L.sr[0]+'" y="'+L.sr[1]+'" font-size="'+(L.hs-1)+'" text-anchor="'+(L.sr[2]||'middle')+'" font-family="var(--f-mono)">sim → real</text></g>';
  var tg = L.tag;
  if(tg.two){ h += '<g data-k="tag"><text class="tagt" x="'+tg.x+'" y="'+tg.y+'" font-size="'+tg.f+'" text-anchor="end">0 real-world</text><text class="tagt" x="'+tg.x+'" y="'+(tg.y+16)+'" font-size="'+tg.f+'" text-anchor="end">training data</text></g>'; }
  else { var tw = tg.f*0.56*26+28; h += '<g data-k="tag"><rect class="tagb" x="'+(tg.x-tw/2)+'" y="'+(tg.y-tg.f*1.05)+'" width="'+tw+'" height="'+(tg.f*2.1)+'" rx="'+(tg.f*1.05)+'"/><text class="tagt" x="'+tg.x+'" y="'+(tg.y+tg.f*0.36)+'" font-size="'+tg.f+'" text-anchor="middle">0 real-world training data</text></g>'; }
  // loops
  ['L','R'].forEach(function(s){
    h += '<g data-k="loop'+s+'"><path class="obs" data-k="obs'+s+'" d="'+L['obs'+s]+'" marker-end="url(#s2r-an)"/><path class="act" data-k="act'+s+'" d="'+L['act'+s]+'" marker-end="url(#s2r-aa)"/></g>';
  });
  L.lbl.forEach(function(b,i){ h += '<text class="sm" data-k="lb'+i+'" x="'+b[0]+'" y="'+b[1]+'" font-size="'+(L.hs-1)+'" text-anchor="'+b[2]+'" font-family="var(--f-mono)">'+b[3]+'</text>'; });
  // panels
  [['sim',L.sim,simPanel,'SIMULATION'],['real',L.real,realPanel,'REAL WORLD']].forEach(function(p){
    var g=p[1]; h += '<g data-k="'+p[0]+'"><text class="hd" x="'+g.x+'" y="'+(g.y-12)+'" font-size="'+L.hs+'" font-family="var(--f-mono)">'+p[3]+'</text>'+
      '<g transform="translate('+g.x+' '+g.y+') scale('+g.s+')">'+p[2]()+'</g></g>';
  });
  // ZAP node (the only accent besides its outputs)
  var n=L.lap; h += '<g data-k="lap"><rect class="lapr" data-k="ring" x="'+(n.x-n.w/2-6)+'" y="'+(n.y-n.h/2-6)+'" width="'+(n.w+12)+'" height="'+(n.h+12)+'" rx="20"/>'+
    '<rect class="lapb" x="'+(n.x-n.w/2)+'" y="'+(n.y-n.h/2)+'" width="'+n.w+'" height="'+n.h+'" rx="14"/>'+
    '<text class="lapt" x="'+n.x+'" y="'+(n.y+n.f*0.18)+'" font-size="'+n.f+'" text-anchor="middle">ZAP</text>'+
    '<text class="sm" x="'+n.x+'" y="'+(n.y+n.f*0.18+n.f*0.72)+'" font-size="'+(n.f*0.43)+'" text-anchor="middle" font-family="var(--f-mono)">27B</text></g>';
  // moving parts: tiles, dots, chips
  ['L','R'].forEach(function(s){
    h += '<g data-k="tile'+s+'" class="tile">'+tile(s==='R')+'</g><circle class="adot" data-k="dot'+s+'" r="3.5"/>'+
      '<g data-k="chip'+s+'" class="chip"><rect data-k="cr'+s+'" rx="7"/><text data-k="ct'+s+'" font-size="'+L.chip+'" text-anchor="middle"></text></g>';
  });
  // hold line
  var o=L.hold; h += '<g data-k="hold">';
  if(o.one){ h += '<text class="holdt" x="'+o.x+'" y="'+o.y+'" font-size="'+o.f+'" text-anchor="middle">'+HOLD[0]+'<tspan class="sep"> · </tspan><tspan class="b">'+HOLD[1]+'</tspan><tspan class="sep"> · </tspan><tspan class="b">'+HOLD[2]+'</tspan></text>'; }
  else { h += '<text class="holdt" x="'+o.x+'" y="'+o.y+'" font-size="'+o.f+'" text-anchor="middle">'+HOLD[0]+'</text><text class="holdt" x="'+o.x+'" y="'+(o.y+o.f*1.4)+'" font-size="'+o.f+'" text-anchor="middle"><tspan class="b">'+HOLD[1]+'</tspan><tspan class="sep"> · </tspan><tspan class="b">'+HOLD[2]+'</tspan></text>'; }
  h += '</g></svg>';
  host.innerHTML = h; host.dataset.layout = name;
  K = {}; [].forEach.call(host.querySelectorAll('[data-k]'), function(e){ K[e.getAttribute('data-k')] = e; });
  ['obsL','obsR','actL','actR'].forEach(function(k){ lens[k] = K[k].getTotalLength(); });
  last = -1;
}

/* ---------- pose helpers ---------- */
function ik(S,W,L1,L2,sg){
  var dx=W[0]-S[0], dy=W[1]-S[1], d=clamp(Math.hypot(dx,dy), Math.abs(L1-L2)+1, L1+L2-.5);
  var a=Math.atan2(dy,dx), b=Math.acos(clamp((L1*L1+d*d-L2*L2)/(2*L1*d),-1,1)), q=a+sg*b;
  return [S[0]+L1*Math.cos(q), S[1]+L1*Math.sin(q)];
}
function at(e,o){ for(var k in o) e.setAttribute(k, typeof o[k]==='number'? f1(o[k]) : o[k]); }
function op(e,v){ e.style.opacity = f1(v*100)/100 + ''; e.style.visibility = v<=0.005 ? 'hidden' : 'visible'; }
function drawSimArm(i,W,f){
  var S=SIM.S[i], E=ik(S,W,SIM.L1,SIM.L2,i?1:-1);
  at(K['sl'+i],{points:f1(S[0])+','+f1(S[1])+' '+f1(E[0])+','+f1(E[1])+' '+f1(W[0])+','+f1(W[1])});
  at(K['sj'+i+'a'],{cx:S[0],cy:S[1]}); at(K['sj'+i+'b'],{cx:E[0],cy:E[1]});
  var x=W[0], y=W[1], hw=Math.max(f,4)+3;
  at(K['sg'+i],{d:'M'+f1(x)+' '+f1(y)+'v6M'+f1(x-hw)+' '+f1(y+6)+'h'+f1(2*hw)+'M'+f1(x-f)+' '+f1(y+6)+'v12M'+f1(x+f)+' '+f1(y+6)+'v12'});
}
function drawRealArm(i,W,f,a){
  var S=REAL.S[i], E=ik(S,W,REAL.L1,REAL.L2,i?1:-1), d='M'+f1(S[0])+' '+f1(S[1])+'L'+f1(E[0])+' '+f1(E[1])+'L'+f1(W[0])+' '+f1(W[1]);
  at(K['rl'+i],{d:d}); at(K['rm'+i],{d:d});
  at(K['rj'+i+'a'],{cx:S[0],cy:S[1]}); at(K['rk'+i+'a'],{cx:S[0],cy:S[1]});
  at(K['rj'+i+'b'],{cx:E[0],cy:E[1]}); at(K['rk'+i+'b'],{cx:E[0],cy:E[1]});
  at(K['rg'+i],{transform:'translate('+f1(W[0])+' '+f1(W[1])+') rotate('+f1(a||0)+')'});
  at(K['rf'+i+'a'],{x:-f-4}); at(K['rf'+i+'b'],{x:f});
}
function mw(t,b){ return ease(seg(t,b+.62,b+.98)); }

/* ---------- render(t): everything is a function of t ---------- */
var last = -1;
function render(t){
  t = ((t%LOOP)+LOOP)%LOOP;
  var st = STATIC, L = LY;
  // phase opacities
  var simC = st?1 : t<4?1 : t<5? lerp(1,.3,ease(seg(t,4,4.6))) : t<14.2? .3 : t<14.6? lerp(.3,0,seg(t,14.2,14.5)) : seg(t,14.6,15);
  var realC = st?1 : t<5?0 : t<14.2? ease(seg(t,5,5.45)) : 1-ease(seg(t,14.2,14.6));
  var lit = st?1 : t<4?0 : t<14.3? ease(seg(t,4,4.5)) : 1-ease(seg(t,14.3,14.7));
  var hold = st?1 : ease(seg(t,12.95,13.3))*(1-ease(seg(t,14.3,14.65)));
  op(K.sim, simC); op(K.loopL, simC);
  op(K.real, .3+.7*realC); op(K.realc, realC); op(K.realcap, realC); op(K.loopR, .14+.86*realC);
  if(L.lbl.length){ op(K.lb0, simC); op(K.lb2, simC); op(K.lb1, .14+.86*realC); op(K.lb3, .14+.86*realC); }
  op(K.bnd, .3+.7*lit); op(K.tag, lit); op(K.hold, hold);

  // sim robot
  var ts = (st || t>=14.6) ? (st?4:0) : t;
  var W = SIM.rest, m1=mw(ts,1), m3=mw(ts,3), g=1-mw(ts,2);
  W = mix(SIM.rest, SIM.hover, mw(ts,0)); if(m1>0) W = mix(SIM.hover, SIM.grasp, m1); if(m3>0) W = mix(SIM.grasp, SIM.lift, m3);
  drawSimArm(0, W, lerp(10,13,g)); drawSimArm(1, SIM.rrest, lerp(3,13,g));
  var blk = m3>0 ? [W[0], W[1]+13] : [150,195];
  at(K.blk,{x:blk[0]-9, y:blk[1]-9});
  at(K.prog,{x2: 18+324*(st?1 : t>=14.6?0 : seg(t,0,4))});

  // real robot
  var tr = st ? 4.765 : (t<5 || t>=14.6) ? 0 : t-5, A = [];
  for(var q=0;q<8;q++) A.push(ease(seg(tr, q+.55, q+.98)));
  function pw(u,pts,br){ return u<br ? mix(pts[0],pts[1],ease(u/br)) : mix(pts[1],pts[2],ease((u-br)/(1-br))); }
  var WL = REAL.lrest, aL = 0, fL = 10, WR = REAL.rrest, fR = 10, own = 'table';
  if(A[0]>0) WL = pw(A[0],[REAL.lrest,REAL.lhover,REAL.lgrasp],.5);
  fL = lerp(10,1.5,A[1]);
  if(A[2]>0){ own='L'; if(A[2]<.4) WL = mix(REAL.lgrasp,REAL.lhover,ease(A[2]/.4)); else { var u2=ease((A[2]-.4)/.6); WL = mix(REAL.lhover,REAL.lhand,u2); aL = -90*u2; } }
  if(A[3]>0) WR = pw(A[3],[REAL.rrest,REAL.rabove,REAL.rhand],.55);
  fR = lerp(10,5.5,seg(A[4],0,.5)); fL = lerp(fL,9,seg(A[4],.5,1)); if(A[4]>=.5) own='R';
  if(A[5]>0){ if(A[5]<.5) WL = mix(REAL.lhand,REAL.lback,ease(A[5]/.5)); else { var u5=ease((A[5]-.5)/.5); WL = mix(REAL.lback,REAL.lrest,u5); aL = -90*(1-u5); } }
  if(A[6]>0) WR = pw(A[6],[REAL.rhand,REAL.rup,REAL.rcarry],.3);
  if(A[7]>0) WR = mix(REAL.rcarry,REAL.rinsert,A[7]);
  drawRealArm(0, WL, fL, aL); drawRealArm(1, WR, fR, 0);
  // the tube is rigidly attached to whichever gripper holds it (no floating)
  var tc, ta;
  if(own==='R'){ tc = [WR[0], WR[1]+REAL.GR+REAL.CAP]; ta = 0; }
  else { var Wg = own==='L' ? WL : REAL.lgrasp, ag = own==='L' ? aL : 0, r=ag*Math.PI/180, r2=(ag+90)*Math.PI/180;
    tc = [Wg[0]-REAL.GL*Math.sin(r)+REAL.G*Math.sin(r2), Wg[1]+REAL.GL*Math.cos(r)-REAL.G*Math.cos(r2)]; ta = ag+90; }
  at(K.tube,{transform:'translate('+f1(tc[0])+' '+f1(tc[1])+') rotate('+f1(ta)+')'});

  // control loop traffic: obs tile in, tool-call chip out, motion
  var ring = 0;
  ['L','R'].forEach(function(s){
    var base = s==='L' ? 0 : 5, chips = s==='L' ? SIM_CHIPS : REAL_CHIPS, tl = K['tile'+s], ch = K['chip'+s], dt = K['dot'+s];
    var N = chips.length, u = t-base, c = Math.floor(u), live = !st && u>=0 && u<N+.4;
    var te = s==='L'?.28:.24, cs = s==='L'?.26:.22, ce = s==='L'?.62:.52;
    if(st){ // composed still: a frame mid-flight and the chip that drives the pose shown
      placeTile(s, s==='L'?.55:.25, 1); placeChip(s, chips[s==='L'?3:4], 1, 1); op(dt,0); return;
    }
    if(!live){ op(tl,0); op(dt,0); if(s==='R' && u>=N+.4) placeChip(s, chips[N-1], 1, realC); else op(ch,0); return; }
    // tile
    var tu = u-c;
    if(c<N && tu<te+.02){ placeTile(s, eout(seg(tu,0,te)), Math.min(1, seg(tu,0,.05), 1-seg(tu,te-.03,te+.02))); } else op(tl,0);
    // chip: cycle k shows from k+.26 until (k+1)+.12..22 fade
    var k = tu>=cs ? c : c-1; if(k>N-1 && s==='R') k = N-1; var cu = u-k;
    if(k>=0 && k<N){
      var fin = (k===N-1) ? (s==='L' ? 1-seg(cu,1.15,1.3) : 1) : 1-seg(cu,1.1,1.2);
      placeChip(s, chips[k], eout(seg(cu,cs,ce)), Math.min(seg(cu,cs,cs+.08), fin) * (s==='R'?realC:1));
    } else op(ch,0);
    // dot along the action path
    if(c<N && tu>=cs && tu<=ce+.02){ var p = K['act'+s].getPointAtLength(lens['act'+s]*ease(seg(tu,cs,ce))); at(dt,{cx:p.x,cy:p.y}); op(dt, 1-seg(tu,ce-.04,ce+.02)); } else op(dt,0);
    if(c<N) ring = Math.max(ring, Math.sin(Math.PI*seg(tu,.22,.5)));
  });
  op(K.ring, ring*.6);
}
function placeTile(s,u,o){
  var p = K['obs'+s].getPointAtLength(lens['obs'+s]*u), sc = LY.tile;
  at(K['tile'+s],{transform:'translate('+f1(p.x-20*sc)+' '+f1(p.y-14*sc)+') scale('+sc+')'}); op(K['tile'+s], o);
}
function placeChip(s,txt,u,o){
  var tr = LY['trk'+s], p = mix(tr[0], tr[1], u), fs = LY.chip, tw = txt.length*fs*0.6+fs*1.7, th = fs*2;
  var ct = K['ct'+s], cr = K['cr'+s];
  if(ct.textContent!==txt) ct.textContent = txt;
  at(cr,{x:p[0]-tw/2, y:p[1]-th/2, width:tw, height:th}); at(ct,{x:p[0], y:p[1]+fs*0.35}); op(K['chip'+s], o);
}

/* ---------- playback ---------- */
function pick(){ if(FORCE && LAYOUTS[FORCE]) return FORCE; return (host.parentNode.clientWidth || host.clientWidth) < 560 ? 'tall' : 'wide'; }
var t0 = 0, clock = 0, prev = null, inView = false, raf = 0;
function frame(now){
  raf = 0; if(!inView || document.hidden){ prev = null; return; }
  if(prev!==null) clock += Math.min(now-prev, 100)/1000;
  prev = now; render(clock); raf = requestAnimationFrame(frame);
}
function kick(){ if(!raf && !STATIC && T_FIX===null && inView && !document.hidden){ prev = null; raf = requestAnimationFrame(frame); } }
function redraw(){ render(T_FIX!==null ? T_FIX : clock); }
build(pick()); redraw();
if('ResizeObserver' in window){ new ResizeObserver(function(){ var n=pick(); if(n!==LNAME){ build(n); redraw(); } }).observe(host.parentNode); }
if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ inView = es[0].isIntersecting; kick(); },{threshold:.25}).observe(host); }
else { inView = true; kick(); }
document.addEventListener('visibilitychange', kick);
window.__s2r = { set:function(t){ clock=t; render(t); }, loop:LOOP, layout:function(n){ build(n); redraw(); } };
})();
