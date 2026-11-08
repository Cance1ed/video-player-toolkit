const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'video-player-toolkit.user.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.test={bind,setA,setB,clear,load,playSelected,playHere,playRange,toggleLoop,applySeek,ready,enforce,containing,identity,docking,findVideos,remove,rename,keys,state:()=>({a,b,loop,pending,clips,selected,expanded,storageError}),select:id=>{selected=id;},hover:n=>{hover=n;},fakeRoot:r=>{root=r;}};})();`);
const memory=new Map();let passed=0;
function session(path='/watch?v=demo'){
 const window={location:{href:'https://example.test'+path,pathname:path.split('?')[0]},crypto,addEventListener(){},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)}};
 vm.runInNewContext(source,{window,document:{readyState:'loading',addEventListener(){}},navigator:{language:'en-US'},setInterval(){},URL,Date,Set,console});
 const listeners={};const video={id:'',isConnected:true,paused:true,readyState:4,duration:100,currentTime:0,seeking:false,seekable:{length:1,start:()=>0,end:()=>100},addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k],play(){this.paused=false;listeners.play?.();return Promise.resolve()},pause(){this.paused=true;listeners.pause?.()}};
 window.test.bind(video);return {api:window.test,video,window,listeners};
}
function check(name,fn){fn();console.log('PASS',name);passed++;}
const s=session();
check('starts collapsed',()=>assert.equal(s.api.state().expanded,false));
check('A/B auto-saves a time-named clip',()=>{s.video.currentTime=10;s.api.setA();s.video.currentTime=20;s.api.setB();const st=s.api.state();assert.equal(st.clips.length,1);assert.equal(st.clips[0].name,'00:10.0 – 00:20.0');assert.equal(st.selected,st.clips[0].id);assert.equal(s.video.currentTime,10)});
check('identical range reuses clip',()=>{s.video.currentTime=10;s.api.setA();s.video.currentTime=20;s.api.setB();assert.equal(s.api.state().clips.length,1)});
check('multiple ranges persist',()=>{s.video.currentTime=30;s.api.setA();s.video.currentTime=40;s.api.setB();assert.equal(s.api.state().clips.length,2)});
const r=session();
check('refresh restores selection and arms the previous loop',()=>{const st=r.api.state();assert.equal(st.a,30);assert.equal(st.b,40);assert.equal(st.pending,30);assert.equal(st.loop,true);assert.equal(st.selected,st.clips[1].id);assert.equal(r.video.paused,true)});
check('original Play resumes last range',()=>{r.video.play();assert.equal(r.video.currentTime,30);assert.equal(r.api.state().pending,null)});
check('play selected before metadata queues seek',()=>{r.video.readyState=0;r.video.duration=NaN;r.video.currentTime=0;r.api.select(r.api.state().clips[0].id);r.api.playSelected();assert.equal(r.api.state().pending,10);assert.equal(r.video.paused,false);r.video.readyState=1;r.video.duration=100;r.api.ready();assert.equal(r.video.currentTime,10);assert.equal(r.api.state().pending,null)});
check('unseekable target stays queued until buffered',()=>{r.video.seekable={length:1,start:()=>0,end:()=>5};r.api.playSelected();assert.equal(r.api.state().pending,10);r.video.seekable={length:1,start:()=>0,end:()=>100};r.api.ready();assert.equal(r.api.state().pending,null)});
check('loop boundary seeks to A',()=>{r.video.readyState=4;r.video.currentTime=20.1;r.api.enforce();assert.equal(r.video.currentTime,10)});
check('manual pause is preserved',()=>{r.video.paused=true;r.video.currentTime=22;r.api.enforce();assert.equal(r.video.currentTime,22)});
check('hover within saved range chooses matching clip',()=>{r.api.hover(35);r.api.playHere();assert.equal(r.video.currentTime,30);assert.equal(r.api.state().b,40)});
check('overlapping ranges choose shortest',()=>{r.video.currentTime=32;r.api.setA();r.video.currentTime=35;r.api.setB();assert.equal(r.api.containing(33).a,32)});
check('clear preserves saved clips and clears remembered loop',()=>{r.api.clear();assert.equal(r.api.state().clips.length,3);assert.equal(session().api.state().a,null)});
check('delete requires confirmation and persists',()=>{r.api.select(r.api.state().clips[0].id);r.api.remove();assert.equal(r.api.state().clips.length,3);r.api.remove();assert.equal(session().api.state().clips.length,2)});
check('timestamps do not split identity; video IDs do',()=>{assert.equal(session('/watch?v=demo&t=9').api.identity(),session().api.identity());assert.notEqual(session('/watch?v=other').api.identity(),session().api.identity())});
check('docking stays on requested video edge',()=>{const box={left:100,top:100,right:900,bottom:600,width:800,height:500};for(const side of ['left','right','top','bottom']){const p=s.api.docking(box,132,42,1200,900,side,.5);assert.ok(p.x>=100&&p.x+132<=900);assert.ok(p.y>=100&&p.y+42<=600);}assert.equal(s.api.docking(box,132,42,1200,900,'left',.5).x,108)});
check('metadata range mismatch does not seek beyond duration',()=>{const x=session();x.video.duration=12;x.api.playRange({a:30,b:40});assert.equal(x.api.state().loop,false);assert.equal(x.api.state().pending,null)});
check('legacy last range becomes a saved clip',()=>{const x=session('/legacy');memory.set(x.api.identity(),JSON.stringify({schema:1,last:{a:2,b:5},clips:[]}));x.api.load();assert.equal(x.api.state().clips.length,1);assert.equal(x.api.state().selected,x.api.state().clips[0].id)});
check('malformed storage is not overwritten',()=>{const x=session('/bad');memory.set(x.api.identity(),'{bad');x.api.load();x.video.currentTime=2;x.api.setA();assert.equal(memory.get(x.api.identity()),'{bad');assert.ok(x.api.state().storageError)});
check('blocked writes report failure',()=>{const x=session('/quota');x.window.localStorage.setItem=()=>{throw Error('quota')};x.video.currentTime=2;x.api.setA();assert.ok(x.api.state().storageError)});
check('deleting active clip does not recreate it on refresh',()=>{const x=session('/delete-active');x.video.currentTime=2;x.api.setA();x.video.currentTime=8;x.api.setB();x.api.remove();x.api.remove();assert.equal(session('/delete-active').api.state().clips.length,0)});
console.log(`${passed} behavior checks passed.`);
