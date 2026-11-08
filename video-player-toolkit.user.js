// ==UserScript==
// @name         Video Player Toolkit · 通用视频工具
// @namespace    canceled9369.video-player-toolkit
// @version      3.1.0
// @description  Dockable video tools, automatic A/B clips and resume / 吸附视频工具、自动区间片段与恢复
// @match        https://*/*
// @match        http://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
 'use strict';
 if(window.__videoPlayerToolkit)return;window.__videoPlayerToolkit=true;
 const doc=document,PREFIX='video-player-toolkit:v1:',PREFS='video-player-toolkit:preferences';
 let video=null,videos=[],key='',clips=[],selected='',a=null,b=null,loop=false,pending=null;
 let host=null,root=null,expanded=false,dragging=false,edge='right',ratio=.2,lang=/^zh/i.test(navigator.language)?'zh':'en';
 let status='',storageError='',hover=null,confirmDelete='',guard=true,pip=null,marker=null,container=null,oldControls=false,opening=false;
 let frame=null,frameVideo=null,lastList='',lastGeometry='',scrubbing=false;
 let overlayMode=false,revealUntil=0,overTool=false;
 const $=s=>root?.querySelector(s),t=(zh,en)=>lang==='zh'?zh:en;
 const point=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const valid=r=>r&&point(r.a)&&point(r.b)&&r.b>r.a+.1;
 const clamp=(n,l,h)=>Math.min(Math.max(n,l),Math.max(l,h));
 function time(n){if(!point(n))return '—';const h=Math.floor(n/3600),m=Math.floor(n%3600/60);return `${h?h+':':''}${String(m).padStart(2,'0')}:${(n%60).toFixed(1).padStart(4,'0')}`;}
 function identity(keepTime=false){const u=new URL(window.location.href);if(!keepTime)for(const p of ['t','start','time_continue'])u.searchParams.delete(p);u.searchParams.sort();return PREFIX+u.href+'|'+(video?.id?'id:'+video.id:'slot:'+Math.max(0,videos.indexOf(video)));}
 function read(){
  let raw=window.localStorage.getItem(key)||window.localStorage.getItem(identity(true));
  if(!raw&&videos.length<=1){const slug=window.location.pathname.split('/').filter(Boolean).pop()||'index';raw=window.localStorage.getItem('max-player-tools:v1:'+slug.toLowerCase());}
  if(!raw)return {schema:1,last:null,clips:[],selectedId:''};const d=JSON.parse(raw);
  if(d?.schema!==1||!Array.isArray(d.clips))throw Error('Invalid record');
  return {schema:1,autoClips:d.autoClips===true,last:d.last&&point(d.last.a)&&(d.last.b===null||valid(d.last))?d.last:null,selectedId:typeof d.selectedId==='string'?d.selectedId:'',clips:d.clips.filter(c=>valid(c)&&typeof c.id==='string'&&typeof c.name==='string').map(c=>({id:c.id,name:c.name.slice(0,80),a:c.a,b:c.b,createdAt:c.createdAt||0}))};
 }
 function write(fn){try{const d=read();fn(d);d.autoClips=true;window.localStorage.setItem(key,JSON.stringify(d));clips=d.clips;storageError='';return true;}catch{storageError=t('无法保存，请检查网站存储权限或空间。原记录未清空。','Cannot save: check storage permissions or space. Existing data was not cleared.');render();return false;}}
 function remember(){return write(d=>{d.last=a===null?null:{a,b,enabled:loop};d.selectedId=selected;});}
 const same=(c,r)=>Math.abs(c.a-r.a)<.05&&Math.abs(c.b-r.b)<.05;
 function autoSave(){if(!valid({a,b}))return false;let id='';if(!write(d=>{let c=d.clips.find(x=>same(x,{a,b}));if(!c){c={id:window.crypto.randomUUID(),name:time(a)+' – '+time(b),a,b,createdAt:Date.now()};d.clips.push(c);}id=c.id;d.selectedId=id;d.last={a,b,enabled:loop};}))return false;selected=id;return true;}
 function load(){
  key=identity();a=b=null;loop=false;pending=null;hover=null;confirmDelete='';
  try{const d=read();clips=d.clips;a=d.last?.a??null;b=d.last?.b??null;loop=!!valid({a,b})&&d.last?.enabled!==false;
   selected=clips.some(c=>c.id===d.selectedId)?d.selectedId:(clips.find(c=>valid({a,b})&&same(c,{a,b}))?.id||clips.at(-1)?.id||'');storageError='';
   if(!d.autoClips&&valid({a,b})&&!clips.some(c=>same(c,{a,b})))autoSave();if(loop)pending=a;
   status=valid({a,b})?t('上次区间已恢复，点击播放后继续循环。','Last range restored. Press Play to resume the loop.'):'';
  }catch{clips=[];selected='';storageError=t('无法读取记录，原数据未覆盖。','Could not read records; original data was not overwritten.');}
  render();if(video&&!video.paused)applySeek();
 }
 function say(zh,en){status=t(zh,en);render();}
 function setA(){if(!video||!point(video.currentTime))return;a=video.currentTime;b=null;loop=false;pending=null;remember();say('A 已设置，到终点按 ]。','A set. Press ] at the end.');}
 function setB(){if(a===null)return say('请先设置 A。','Set A first.');if(!valid({a,b:video?.currentTime}))return say('B 必须比 A 至少晚 0.1 秒。','B must be more than 0.1 seconds after A.');b=video.currentTime;loop=true;pending=a;const ok=autoSave();applySeek();say(ok?'片段已自动保存，循环已开启。':'循环开启，但未能保存。',ok?'Clip saved automatically. Loop enabled.':'Loop enabled, but save failed.');}
 function clear(){a=b=null;loop=false;pending=null;remember();say('已清除当前区间，保存的片段仍保留。','Current range cleared. Saved clips are kept.');}
 function applySeek(){
  if(pending===null||!video||video.readyState<1||!Number.isFinite(video.duration))return false;
  if(pending>=video.duration||(loop&&b>video.duration+.1)){pending=null;loop=false;say('区间超出当前视频，请检查视频选择。','Range exceeds this video. Check the selected player.');return false;}
  try{if(video.seekable?.length&&!Array.from({length:video.seekable.length},(_,i)=>i).some(i=>pending>=video.seekable.start(i)&&pending<=video.seekable.end(i)))return false;
   video.currentTime=pending;if(Math.abs(video.currentTime-pending)<.3)pending=null;return true;
  }catch{return false;}
 }
 function playRange(c){if(!valid(c)||!video)return;a=c.a;b=c.b;selected=c.id||selected;loop=true;pending=a;remember();render();applySeek();video.play().catch(()=>say('区间已就绪，请点击原播放器的播放按钮。','Range queued. Press Play on the original player.'));}
 function playSelected(){const c=clips.find(c=>c.id===selected)||(valid({a,b})?{a,b}:null);if(c)playRange(c);else say('先设置区间或选择片段。','Set a range or select a clip first.');}
 function containing(at){return clips.filter(c=>at>=c.a&&at<=c.b).sort((x,y)=>(x.b-x.a)-(y.b-y.a)||x.a-y.a)[0]||null;}
 function playHere(){const c=containing(hover??video?.currentTime);if(c)playRange(c);else say('这个位置没有保存的片段。','No saved clip contains this position.');}
 function toggleLoop(){if(!valid({a,b}))return playSelected();loop=!loop;pending=loop?a:null;if(loop)applySeek();remember();render();}
 function rename(){const name=$('#name').value.trim().slice(0,80);if(!name||!selected)return say('选择片段并输入新名称。','Select a clip and enter a new name.');if(write(d=>{const c=d.clips.find(c=>c.id===selected);if(c)c.name=name;})){$('#name').value='';say('名称已更新。','Name updated.');}}
 function remove(){if(!selected)return;if(confirmDelete!==selected){confirmDelete=selected;return render();}if(write(d=>{d.clips=d.clips.filter(c=>c.id!==selected);d.selectedId='';})){selected=clips.at(-1)?.id||'';confirmDelete='';render();}}
 function enforce(){applySeek();if(!video||!loop||!valid({a,b})||video.paused||video.seeking||scrubbing||pending!==null||video.readyState<2)return;if(video.currentTime>=b||video.currentTime<a-.15){pending=a;applySeek();}}
 function stopFrames(){if(frame!==null)frameVideo?.cancelVideoFrameCallback?.(frame);frame=null;}
 function onPlay(){applySeek();stopFrames();frameVideo=video;if(!video?.requestVideoFrameCallback)return;const next=()=>{enforce();if(frameVideo===video&&!video.paused)frame=video.requestVideoFrameCallback(next);};frame=video.requestVideoFrameCallback(next);}
 function ready(){if(!video.paused||pending!==null)applySeek();syncTimeline();}
 const events={play:onPlay,playing:ready,loadedmetadata:ready,canplay:ready,progress:ready,timeupdate:()=>{enforce();syncTimeline();},pause:stopFrames,ended:()=>{if(loop&&valid({a,b}))playRange({a,b});}};
 function bind(v){if(v===video)return;stopFrames();if(video)for(const[type,fn]of Object.entries(events))video.removeEventListener(type,fn);video=v;for(const[type,fn]of Object.entries(events))video.addEventListener(type,fn);load();if(!video.paused)onPlay();}
 function preventPause(e){if(!guard||!video?.isConnected||video.paused)return;if(e.type==='blur'&&e.target!==window&&e.target!==doc)return;e.stopImmediatePropagation();}
 window.addEventListener('blur',preventPause,true);window.addEventListener('visibilitychange',preventPause,true);

 const css=`
 :host{all:initial;position:fixed!important;z-index:2147483646!important;display:block!important;pointer-events:auto!important;color-scheme:light;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;--ink:#202124;--muted:#6d727c;--blue:#007aff;--hair:rgba(30,40,60,.1);width:132px;isolation:isolate}
 :host{transition:opacity .18s ease}:host([sleeping]){opacity:0!important;pointer-events:none!important}:host([sleeping]) *{pointer-events:none!important}:host([dragging]){transition:none!important}:host([hidden]){display:none!important}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;color:var(--ink);border:0;background:none;transition:background .15s,transform .15s}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #82baff;outline-offset:2px}button:disabled{opacity:.4;cursor:default}
 #shell{border:1px solid #ffffffcf;border-radius:22px;background:rgba(249,250,252,.95);box-shadow:0 8px 30px #0003,0 1px 3px #0002;backdrop-filter:blur(24px) saturate(1.5);-webkit-backdrop-filter:blur(24px) saturate(1.5);color:var(--ink);overflow:hidden;transition:border-radius .22s,box-shadow .22s}
 #head{height:42px;display:flex;align-items:center;gap:4px;padding:4px 6px}#grip{width:25px;height:32px;border-radius:10px;touch-action:none;cursor:grab;color:#7a7f88;font-size:18px;letter-spacing:-2px}#grip:active{cursor:grabbing}#open{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;height:32px;padding:0 8px;border-radius:12px;font-weight:600;white-space:nowrap}#dot{width:6px;height:6px;border-radius:50%;background:#b3b7bf;flex:none}#dot.active{background:#34c759;box-shadow:0 0 0 3px #34c7591a}#caret{color:#8a8f98;font-size:11px}
 #body{display:grid;grid-template-rows:0fr;opacity:0;transition:opacity .18s}#inner{min-height:0;overflow:hidden}#content{padding:2px 16px 14px;max-height:var(--panel-max,420px);overflow:auto;overscroll-behavior:contain}:host([open]){width:350px}:host([open]) #shell{border-radius:24px}:host([open]) #body{grid-template-rows:1fr;opacity:1}:host([open]) #head{border-bottom:1px solid var(--hair);margin-bottom:12px}
 .row{display:flex;align-items:center;gap:7px}.between{justify-content:space-between}.caption{font-size:10px;letter-spacing:1.1px;font-weight:650;color:var(--muted);text-transform:uppercase}.icon{height:30px;min-width:30px;border-radius:10px;background:#eceef2}.icon:hover,.secondary:hover{background:#e0e4eb}.primary{background:var(--blue);color:white;border-radius:12px;height:36px;padding:0 13px;font-weight:600;width:100%}.primary:hover{background:#006ce0}.primary:active,.secondary:active,.icon:active{transform:scale(.97)}.secondary{height:32px;padding:0 11px;border-radius:10px;background:#eceef2;font-size:12px}.danger{color:#d73430}.grow{flex:1}.top{margin-bottom:12px}#players{max-width:190px;border:0;background:transparent;color:var(--ink);font-size:12px;padding:4px;border-radius:6px}#lang{font-size:11px}#clock{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
 #timeline{position:relative;height:38px;margin:10px 0 3px;direction:ltr}#seek{appearance:none;-webkit-appearance:none;position:absolute;left:0;top:15px;width:100%;height:4px;border-radius:3px;background:#d9dce2;margin:0;cursor:pointer;z-index:2}#seek::-webkit-slider-thumb{appearance:none;width:12px;height:12px;background:#fff;border:1px solid #b8bdc7;border-radius:50%;box-shadow:0 1px 4px #0002}#seek::-moz-range-thumb{width:12px;height:12px;background:white;border:1px solid #b8bdc7;border-radius:50%}#bands{position:absolute;left:6px;right:6px;top:25px;height:5px}.band{position:absolute;height:5px;border-radius:3px;background:#007aff40;min-width:2px;padding:0}.band:hover{background:#007aff}.range{position:absolute;top:15px;height:4px;background:#007aff;pointer-events:none;z-index:3}.pin{position:absolute;top:0;font-size:9px;font-weight:700;color:#007aff;transform:translateX(-50%);pointer-events:none;z-index:4}.pin:after{content:'';display:block;width:1px;height:8px;background:#007aff;margin:auto}#rangeLabel{font-variant-numeric:tabular-nums;font-weight:600;font-size:12px}#ab{margin:10px 0 12px}#ab button{flex:1}#loop[aria-pressed=true]{background:#e3f0ff;color:#0069d9}
 #libraryTitle{margin:17px 0 8px}#count{font-size:10px;background:#e9ecf1;border-radius:8px;padding:2px 6px;color:var(--muted)}#clips{display:flex;flex-direction:column;gap:4px;max-height:142px;overflow:auto;margin-bottom:10px}.clip{display:flex;align-items:center;gap:10px;text-align:left;padding:8px 10px;border-radius:12px;width:100%;border:1px solid transparent}.clip:hover{background:#edf0f5}.clip[aria-pressed=true]{background:#e6f1ff;border-color:#cce2ff}.symbol{color:#007aff;font-size:14px;width:16px}.clip .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:550}.clip .duration{font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}.clip .text{flex:1;min-width:0}.empty{padding:15px 6px;color:var(--muted);font-size:12px;line-height:1.6;text-align:center}#name{width:100%;min-width:0;flex:1;background:#fff9;border:1px solid #dce0e7;border-radius:9px;padding:7px 9px;color:var(--ink);font-size:12px}#edit{margin-top:8px}#status{display:block;min-height:15px;line-height:1.5;font-size:10px;color:var(--muted);margin:10px 0 0;overflow-wrap:anywhere}#help{font-size:10px;color:#8a8f98;margin-top:6px}#guard[aria-pressed=true]{color:#007aff}
 @media(prefers-reduced-motion:reduce){:host,*,*:before,*:after{transition:none!important;animation:none!important}}@media(prefers-contrast:more){#shell{background:#fff;border-color:#333}.caption,#status{color:#444}}@supports not(backdrop-filter:blur(1px)){#shell{background:#fafbfc}}
 `;
 function el(tag,attrs={},text=''){const e=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;}
 function btn(id,label,fn,cls='secondary'){const e=el('button',{id,type:'button',class:cls},label);e.addEventListener('click',fn);return e;}
 function build(){
  host=el('div',{'data-video-player-toolkit':'3'});root=host.attachShadow({mode:'open'});root.append(el('style',{},css));
  const shell=el('section',{id:'shell','aria-label':'Video Player Toolkit'}),head=el('div',{id:'head'}),grip=btn('grip','⠿',()=>{},'');grip.setAttribute('aria-label','Drag / 拖动吸附');
  const open=btn('open','',()=>{expanded=!expanded;host.toggleAttribute('open',expanded);open.setAttribute('aria-expanded',String(expanded));$('#body').inert=!expanded;render();},'');open.setAttribute('aria-expanded','false');open.append(el('span',{id:'dot'}),el('span',{id:'title'},'Loop'),el('span',{id:'caret'},'⌄'));head.append(grip,open);shell.append(head);
  const body=el('div',{id:'body'}),inner=el('div',{id:'inner'}),content=el('div',{id:'content'});body.inert=true;
  const top=el('div',{class:'row between top'}),players=el('select',{id:'players','aria-label':'Video / 视频'});players.addEventListener('change',()=>{const v=videos[Number(players.value)];if(v&&!pip)bind(v);});top.append(players,btn('lang','EN',()=>{lang=lang==='zh'?'en':'zh';prefs();render();},'icon'));content.append(top);
  const transport=el('div',{class:'row'});transport.append(btn('play','▶',()=>{if(!video)return;if(video.paused){applySeek();video.play().catch(()=>say('请点击原播放器。','Use the original player to start.'));}else video.pause();},'icon'),el('span',{id:'clock',class:'grow'}),btn('popout','↗',popout,'icon'),btn('guard','◉',()=>{guard=!guard;render();},'icon'));content.append(transport);
  const timeline=el('div',{id:'timeline'}),seek=el('input',{id:'seek',type:'range',min:'0',max:'100',step:'.01','aria-label':'Seek / 播放进度'});
  seek.addEventListener('pointerdown',()=>{scrubbing=true;pending=null;loop=false;remember();});seek.addEventListener('input',()=>{if(video&&Number.isFinite(video.duration)){loop=false;pending=null;video.currentTime=Number(seek.value)/100*video.duration;hover=video.currentTime;remember();render();}});for(const ev of ['change','pointerup','pointercancel','blur'])seek.addEventListener(ev,()=>{scrubbing=false;});
  timeline.addEventListener('pointermove',e=>{if(!video||!Number.isFinite(video.duration))return;const r=seek.getBoundingClientRect();hover=clamp((e.clientX-r.left-6)/(r.width-12),0,1)*video.duration;updateHere();});
  timeline.append(seek,el('div',{id:'bands'}),el('div',{id:'fill',class:'range'}),el('span',{id:'pinA',class:'pin'},'A'),el('span',{id:'pinB',class:'pin'},'B'));content.append(timeline);
  const rr=el('div',{class:'row between'});rr.append(el('span',{id:'rangeLabel'}),btn('here','',playHere));content.append(rr);
  const ab=el('div',{id:'ab',class:'row'});ab.append(btn('setA','A  [',setA),btn('setB','B  ]',setB),btn('loop','',toggleLoop),btn('clear','',clear));content.append(ab,btn('playSelected','',playSelected,'primary'));
  const title=el('div',{id:'libraryTitle',class:'row between'});title.append(el('span',{id:'libraryLabel',class:'caption'}),el('span',{id:'count'}));content.append(title,el('div',{id:'clips'}));
  const edit=el('div',{id:'edit',class:'row'});edit.append(el('input',{id:'name',type:'text',maxlength:'80','aria-label':'Clip name / 片段名称'}),btn('rename','',rename),btn('delete','',remove,'secondary danger'));content.append(edit,el('output',{id:'status','aria-live':'polite'}),el('div',{id:'help'}));
  inner.append(content);body.append(inner);shell.append(body);root.append(shell);installDrag(grip);
  host.addEventListener('pointerenter',()=>{overTool=true;revealUntil=Date.now()+1800;position();});
  host.addEventListener('pointerleave',()=>{overTool=false;revealUntil=Date.now()+1800;position();});
  host.addEventListener('focusin',()=>{revealUntil=Date.now()+1800;position();});
  doc.body.append(host);render();
 }
 function render(){
  if(!root)return;$('#title').textContent=t('片段','Loop');$('#caret').textContent=expanded?'⌃':'⌄';$('#lang').textContent=lang==='zh'?'EN':'中';$('#popout').title=t('画中画 / 返回','Picture-in-picture / Return');$('#popout').setAttribute('aria-label',$('#popout').title);$('#guard').title=t('防失焦暂停','Prevent blur pause');$('#guard').setAttribute('aria-label',$('#guard').title);$('#guard').setAttribute('aria-pressed',String(guard));
  $('#loop').textContent=t('循环','Loop');$('#loop').setAttribute('aria-pressed',String(loop));$('#clear').textContent=t('清除','Clear');$('#playSelected').textContent=t('▶ 播放所选片段','▶ Play selected clip');$('#playSelected').disabled=!selected&&!valid({a,b});$('#rangeLabel').textContent=time(a)+' – '+time(b);$('#dot').classList.toggle('active',loop);
  $('#libraryLabel').textContent=t('已保存片段','Saved clips');$('#count').textContent=String(clips.length);$('#name').placeholder=t('输入名称以重命名','Enter a new clip name');$('#rename').textContent=t('改名','Rename');$('#delete').textContent=confirmDelete===selected&&selected?t('确认','Confirm'):t('删除','Delete');$('#status').textContent=storageError||status;$('#help').textContent=t('[ 起点 · ] 终点并保存 · L 循环 · P 浮窗','[ Start · ] End & save · L Loop · P PiP');
  const sig=JSON.stringify([clips,selected,lang]);if(sig!==lastList){lastList=sig;renderClips();}syncTimeline();updateHere();position();
 }
 function renderClips(){
  const list=$('#clips'),bands=$('#bands');list.replaceChildren();bands.replaceChildren();if(!clips.length)list.append(el('div',{class:'empty'},t('设置 A 和 B，即可自动保存第一个片段。','Set A and B to save your first clip automatically.')));
  for(const c of clips){const row=btn('','',()=>{selected=c.id;confirmDelete='';write(d=>{d.selectedId=selected;});render();},'clip');row.removeAttribute('id');row.setAttribute('aria-pressed',String(c.id===selected));const text=el('span',{class:'text'});text.append(el('div',{class:'name'},c.name),el('div',{class:'duration'},time(c.a)+' – '+time(c.b)));row.append(el('span',{class:'symbol'},c.id===selected?'●':'○'),text);list.append(row);const band=btn('','',()=>playRange(c),'band');band.removeAttribute('id');band.dataset.id=c.id;band.title=c.name+' · '+time(c.a)+' – '+time(c.b);band.setAttribute('aria-label',band.title);bands.append(band);}
 }
 function syncTimeline(){
  if(!root||!video)return;updateHere();const finite=Number.isFinite(video.duration)&&video.duration>0,seek=$('#seek');seek.disabled=!finite;if(finite&&!scrubbing)seek.value=String(video.currentTime/video.duration*100);$('#clock').textContent=time(video.currentTime)+' / '+time(video.duration);$('#play').textContent=video.paused?'▶':'Ⅱ';$('#play').setAttribute('aria-label',video.paused?t('播放','Play'):t('暂停','Pause'));
  const w=seek.clientWidth-12,pct=n=>clamp(n/video.duration,0,1)*w+6;for(const[id,n]of [['pinA',a],['pinB',b]]){$('#'+id).hidden=!finite||n===null;if(finite&&n!==null)$('#'+id).style.left=pct(n)+'px';}$('#fill').hidden=!finite||!valid({a,b});if(finite&&valid({a,b})){$('#fill').style.left=pct(a)+'px';$('#fill').style.width=Math.max(0,pct(b)-pct(a))+'px';$('#fill').style.opacity=loop?'1':'.35';}
  for(const band of $('#bands').children){const c=clips.find(c=>c.id===band.dataset.id);band.hidden=!finite;if(c&&finite){band.style.left=clamp(c.a/video.duration*100,0,100)+'%';band.style.width=clamp((c.b-c.a)/video.duration*100,0,100)+'%';}}
 }
 function updateHere(){if(!root)return;const at=hover??video?.currentTime,c=containing(at);$('#here').textContent=t('播放此区间','Play here');$('#here').disabled=!c;$('#here').title=c?time(at)+' · '+c.name:t('悬停进度条，或拖到已保存的区间内','Hover the timeline or seek into a saved range');}
 // Never clamp an exterior position back onto the video. Try another edge instead.
 function docking(r,w,h,vw,vh,side,f,minW=w,minH=h){
  const gap=10,margin=6,opposite={left:'right',right:'left',top:'bottom',bottom:'top'};
  const order=[...new Set([side,opposite[side],'bottom','top','right','left'])];
  const choices=order.map(s=>{
   const horizontal=s==='left'||s==='right';
   const room=({left:r.left-gap-margin,right:vw-r.right-gap-margin,top:r.top-gap-margin,bottom:vh-r.bottom-gap-margin})[s];
   const width=Math.min(w,horizontal?room:vw-2*margin),height=Math.min(h,horizontal?vh-2*margin:room);
   if(width<minW||height<minH)return null;
   let x,y;if(horizontal){x=s==='left'?r.left-gap-width:r.right+gap;y=clamp(r.top+f*Math.max(0,r.height-height),margin,vh-height-margin);}
   else{x=clamp(r.left+f*Math.max(0,r.width-width),margin,vw-width-margin);y=s==='top'?r.top-gap-height:r.bottom+gap;}
   if(x<margin||y<margin||x+width>vw-margin||y+height>vh-margin)return null;
   return {x,y,width,height,side:s,outside:true,full:width>=w&&height>=h};
  }).filter(Boolean);
  return choices.find(p=>p.full)||choices[0]||null;
 }
 function wake(e){
  if(!overlayMode||!video||!host)return;
  const r=video.getBoundingClientRect();
  if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){revealUntil=Date.now()+1800;position();}
 }
 function position(){
  if(!host||!video)return;const view=host.ownerDocument.defaultView,r=video.getBoundingClientRect();const visible=video.isConnected&&r.width>30&&r.height>30&&r.bottom>0&&r.right>0&&r.top<view.innerHeight&&r.left<view.innerWidth;host.hidden=!visible;if(!visible)return;
  const width=Math.min(expanded?350:132,view.innerWidth-12),height=expanded?Math.min(500,view.innerHeight-12):44;
  let p=docking(r,width,height,view.innerWidth,view.innerHeight,edge,ratio,expanded?Math.min(240,width):width,expanded?144:44);
  const noOutside=!p;if(noOutside&&!overlayMode)revealUntil=Date.now()+1800;overlayMode=noOutside;
  if(!p){const fw=Math.min(width,Math.max(120,r.width-16)),fh=expanded?Math.max(110,Math.min(500,r.height-16,view.innerHeight-12)):44;
   p={x:clamp(r.right-fw-8,6,view.innerWidth-fw-6),y:clamp(r.top+8,6,view.innerHeight-fh-6),width:fw,height:fh,side:'overlay'};
  }
  host.toggleAttribute('sleeping',overlayMode&&!expanded&&!dragging&&!overTool&&!root.activeElement?.matches(':focus-visible')&&Date.now()>revealUntil);
  host.dataset.placement=p.side;host.style.width=p.width+'px';host.style.setProperty('--panel-max',Math.max(64,p.height-64)+'px');
  $('#open').title=overlayMode?t('外侧空间不足：移入视频显示工具，停止移动后自动隐藏','No exterior space: move over the video to reveal; idle controls auto-hide'):t('吸附在播放器外侧','Docked outside the player');
  const g=[p.x,p.y,p.width,p.height].map(Math.round).join(',');if(g!==lastGeometry){lastGeometry=g;host.style.left=p.x+'px';host.style.top=p.y+'px';}
 }
 function installDrag(grip){
  grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;host.setAttribute('dragging','');grip.setPointerCapture(e.pointerId);e.preventDefault();});grip.addEventListener('pointermove',e=>{if(!dragging)return;const r=video.getBoundingClientRect();edge=[['left',Math.abs(e.clientX-r.left)],['right',Math.abs(e.clientX-r.right)],['top',Math.abs(e.clientY-r.top)],['bottom',Math.abs(e.clientY-r.bottom)]].sort((a,b)=>a[1]-b[1])[0][0];ratio=edge==='top'||edge==='bottom'?clamp((e.clientX-r.left)/r.width,0,1):clamp((e.clientY-r.top)/r.height,0,1);position();});
  const end=()=>{if(!dragging)return;dragging=false;host.removeAttribute('dragging');prefs();position();};grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);grip.addEventListener('keydown',e=>{const s={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'top',ArrowDown:'bottom'};if(s[e.key]){e.preventDefault();edge=s[e.key];ratio=.5;prefs();position();}});
 }
 function prefs(){try{window.localStorage.setItem(PREFS,JSON.stringify({edge,ratio,lang}));}catch{}}
 try{const p=JSON.parse(window.localStorage.getItem(PREFS)||'{}');if(['left','right','top','bottom'].includes(p.edge))edge=p.edge;if(point(p.ratio))ratio=clamp(p.ratio,0,1);if(['zh','en'].includes(p.lang))lang=p.lang;}catch{}
 function restore(){if(!pip)return;const playing=video&&!video.paused;if(marker?.parentNode)marker.replaceWith(container);else if(container)doc.body.append(container);container?.classList.remove('vpt-pip-media');video.controls=oldControls;doc.body.append(host);pip=null;marker=null;lastGeometry='';if(playing)video.play().catch(()=>{});render();}
 async function popout(){
  if(pip&&!pip.closed){pip.close();return;}if(opening||!video)return;
  if(!window.documentPictureInPicture||window.top!==window){try{if(doc.pictureInPictureElement)await doc.exitPictureInPicture();else await video.requestPictureInPicture();}catch{say('当前环境不支持画中画。','Picture-in-picture is unavailable here.');}return;}
  if(doc.pictureInPictureElement)return say('请先退出基础画中画。','Exit basic picture-in-picture first.');opening=true;container=video.closest('.plyr,.video-js,.jwplayer')||video;oldControls=video.controls;const playing=!video.paused;
  try{pip=await window.documentPictureInPicture.requestWindow({width:960,height:600});pip.addEventListener('pagehide',restore,{once:true});const d=pip.document;d.title='Video Player Toolkit';const base=el('base');base.href=doc.baseURI;d.head.append(base);
   for(const sheet of doc.styleSheets){try{d.head.append(el('style',{},Array.from(sheet.cssRules,r=>r.cssText).join('\n')));}catch{if(sheet.href)d.head.append(el('link',{rel:'stylesheet',href:sheet.href}));}}
   d.head.append(el('style',{},'html,body{margin:0!important;background:#000!important;width:100%!important;height:100%!important;overflow:hidden!important}.vpt-pip-media{width:100%!important;height:100%!important;max-height:none!important;position:relative!important}.vpt-pip-media video,video.vpt-pip-media{width:100%!important;height:100%!important;object-fit:contain!important}.vpt-pip-media [data-plyr="pip"],.vpt-pip-media [data-plyr="fullscreen"]{display:none!important}'));
   const copied=new Set();for(const use of container.querySelectorAll('use')){const href=use.getAttribute('href')||use.getAttribute('xlink:href')||'';if(href.startsWith('#')){const svg=doc.getElementById(href.slice(1))?.closest('svg');if(svg&&!container.contains(svg)&&!copied.has(svg)){copied.add(svg);const clone=svg.cloneNode(true);clone.style.display='none';d.body.append(clone);}}}
   marker=el('div',{},t('播放器已移入浮窗，关闭浮窗即可返回。','Player moved to PiP. Close the window to return.'));container.before(marker);container.classList.add('vpt-pip-media');if(container===video)video.controls=true;d.body.append(container,host);pip.addEventListener('keydown',keys,true);pip.addEventListener('resize',position);pip.addEventListener('pointermove',wake,true);lastGeometry='';if(playing)video.play().catch(()=>{});render();
  }catch(e){const w=pip;restore();if(w&&!w.closed)w.close();say('无法打开浮窗：'+e.message,'Unable to open PiP: '+e.message);}finally{opening=false;}
 }
 function keys(e){const target=e.composedPath?.()[0]||e.target;if(e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable=true]'))return;const fn={BracketLeft:setA,BracketRight:setB,Backslash:clear,KeyL:toggleLoop,KeyP:popout}[e.code];if(fn&&video){e.preventDefault();e.stopImmediatePropagation();fn();}}
 function findVideos(r=doc){const found=Array.from(r.querySelectorAll('video'));for(const e of r.querySelectorAll('*'))if(e.shadowRoot&&e!==host)found.push(...findVideos(e.shadowRoot));return found;}
 function discover(){
  if(pip||opening)return;videos=findVideos();if(!videos.length){if(host)host.hidden=true;return;}const next=videos.includes(video)?video:videos.slice().sort((x,y)=>{const score=v=>{const r=v.getBoundingClientRect();return r.width*r.height+(!v.paused?1e9:0);};return score(y)-score(x);})[0];
  if(!doc.body)return;if(!host)build();bind(next);if(key!==identity())load();const parent=doc.fullscreenElement||doc.body;if(host.ownerDocument===doc&&host.parentElement!==parent)parent.append(host);const select=$('#players');if(root.activeElement!==select){select.replaceChildren();videos.forEach((v,i)=>select.append(el('option',{value:String(i)},t('视频','Video')+' '+(i+1)+(v.id?' · '+v.id:''))));select.value=String(videos.indexOf(video));}position();syncTimeline();
 }
 window.addEventListener('keydown',keys,true);window.addEventListener('pointermove',wake,true);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);doc.addEventListener('fullscreenchange',discover);window.addEventListener('storage',e=>{if(e.key===key){try{clips=read().clips;if(!clips.some(c=>c.id===selected))selected=clips.at(-1)?.id||'';render();}catch{}}});
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',discover,{once:true});else discover();setInterval(discover,1800);setInterval(()=>{if((host&&!doc.hidden)||pip){position();syncTimeline();}},250);
})();
