const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {harness,boot}=require('./test_original_ui.cjs');
const root=path.resolve(__dirname,'..');
const mobile=fs.readFileSync(path.join(root,'mobile-app.js'),'utf8');
const page=a=>vm.runInContext('at',a.context);
async function create(protocol='http:'){
  const a=harness({protocol});
  for(const id of ['mobile-tools','mobile-records','mobile-record-list','mobile-record-status','mobile-content','mobile-primary','mobile-notice','mobile-route','mobile-origin','mobile-destination','mobile-route-error'])a.nodes.set('#'+id,{open:false,hidden:true,innerHTML:'',textContent:'',value:'',scrollTop:0,clientWidth:390,focus(){this.focused=true;},select(){this.selected=true;}});
  const navButtons=['home','explore','records','mine'].map(tab=>({dataset:{tab},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}}));
  a.nodes.set('#mobile-nav',{querySelectorAll:()=>navButtons});a.navButtons=navButtons;
  if(process.env.FLOW_URL)a.context.fetch=(url,options={})=>fetch(new URL(url,process.env.FLOW_URL),{...options,signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(10000)])});
  boot(a);vm.runInContext(mobile,a.context);await a.context.window.MotionJourney.refresh();return a;
}
async function main(){
  const a=await create(),reference=boot(harness()),m=a.context.window.MotionMobile,ai=a.context.window.MotionScoreAI,j=a.context.window.MotionJourney;
  const html=fs.readFileSync(path.join(root,'mobile-app.html'),'utf8');
  assert(html.includes('design-pages.js?v=7'));assert(html.includes('design-pages.css?v=1'));
  assert(!html.includes('class="app"'));assert(html.includes('class="mobile-nav"'));
  assert.equal((html.match(/data-tab=/g)||[]).length,4);
  assert(html.includes('更多操作'));assert(!/app-header|player-art|scene-card|hero-copy/.test(mobile));
  for(let i=0;i<14;i++){
    vm.runInContext(`go(${i})`,a.context);vm.runInContext(`go(${i})`,reference.context);
    assert.equal(a.nodes.get('#screen').innerHTML,reference.nodes.get('#screen').innerHTML,`Mobile changed page ${i+1}`);
    assert.equal(a.context.window.MotionDesign.getLive(),'','Mobile added visible content to original artwork');
    assert(!a.nodes.get('#acts').innerHTML.includes('下一页'));
    assert(!a.nodes.get('#acts').innerHTML.includes('返回上一页'));
    for(const width of [320,360,390,430,440]){
      a.nodes.get('#mobile-content').clientWidth=width;
      const g=m.layout(),p=a.context.window.MotionDesign.pages[i];
      const [x,y,w,h]=g.crop;
      assert(Math.abs(g.width/p.w-g.height/p.h)<1e-10,'Artwork stretched');
      assert(Math.abs(w*g.scale-width)<1e-8,'Page width inconsistent');
      assert.equal(parseFloat(a.nodes.get('#screen').style.height),g.contentHeight);
      const stage=a.nodes.get('#screen').querySelector('.design-stage');
      assert.equal(stage.style.left,g.left+'px');assert.equal(stage.style.top,g.top+'px');
      for(const hit of p.hits.filter(hit=>!hit.id.startsWith('nav-'))){
        const [hx,hy,hw,hh]=hit.rect;
        assert(hx/100*p.w>=x-1 && (hx+hw)/100*p.w<=x+w+1,`Page ${i+1} button ${hit.id} clipped horizontally`);
        assert(hy/100*p.h>=y-1 && (hy+hh)/100*p.h<=y+h+1,`Page ${i+1} button ${hit.id} clipped vertically`);
        // A long image remains reachable by scrolling; the bottom navigation consumes fixed space.
        for(const deviceHeight of [568,640,844,932]){
          const viewport=deviceHeight-42-126;
          const hitBottom=((hy+hh)/100*p.h-y)*g.scale;
          assert(hitBottom<=Math.max(viewport,g.contentHeight)+1);
        }
      }
    }
    m.tools();assert.equal(a.nodes.get('#mobile-tools').hidden,false);m.close();
    m.explore();assert.equal(page(a),4);assert.equal(a.navButtons[1].attrs['aria-current'],'page');
    m.records();assert.equal(m.getState().tab,'records');assert.equal(a.nodes.get('#mobile-records').hidden,false);
    assert.equal(a.navButtons[2].attrs['aria-current'],'page');
    m.mine();assert.equal(page(a),6);assert.equal(a.nodes.get('#mobile-records').hidden,true);
    m.home();assert.equal(page(a),0);assert.equal(a.navButtons[0].attrs['aria-current'],'page');
  }
  assert(a.nodes.get('#mobile-record-list').innerHTML.includes('还没有保存的记录'));
  const css=fs.readFileSync(path.join(root,'mobile-app.css'),'utf8');
  assert(css.includes('height:100dvh'));assert(css.includes('overflow-y:auto'));assert(css.includes('.mobile-nav{flex:none'));
  assert(css.includes('.design-hit[data-id^="nav-"]{display:none}'));
  // Repeated observer/render callbacks must preserve the mounted artwork and unchanged content.
  m.explore();a.nodes.get('#mobile-content').clientWidth=390;m.layout();m.activate('filter-0');
  const screen=a.nodes.get('#screen'),stage=screen.querySelector('.design-stage'),image=screen.querySelector('#design-art'),live=screen.querySelector('#design-live');
  let styleWrites=0,liveWrites=0,markup=live.innerHTML;
  screen.style=new Proxy(screen.style,{set(target,key,value){styleWrites++;target[key]=value;return true;}});
  stage.style=new Proxy(stage.style,{set(target,key,value){styleWrites++;target[key]=value;return true;}});
  Object.defineProperty(live,'innerHTML',{get:()=>markup,set:value=>{liveWrites++;markup=value;},configurable:true});
  a.nodes.get('#mobile-content').scrollTop=123;
  for(let i=0;i<50;i++){m.layout();a.context.render();}
  assert.equal(styleWrites,0,'Stable explore page repeatedly rewrote layout');assert.equal(liveWrites,0,'Stable explore page replaced unchanged card content');
  assert.equal(screen.querySelector('#design-art'),image);assert.equal(a.nodes.get('#mobile-content').scrollTop,123);
  a.nodes.get('#mobile-content').clientWidth=360;m.layout();assert(styleWrites>0,'Real resize did not update layout');
  m.activate('filter-3');assert(liveWrites>0,'Filter change did not update cards');
  m.home();m.activate('start');assert.equal(page(a),1);m.activate('scene-drive');m.activate('start');assert.equal(page(a),8);
  const route=a.context.window.MotionDesign;
  a.context.prompt=()=>{throw new Error('Route editing must not use a browser prompt');};
  m.activate('origin');assert.equal(m.getState().panel,'route');assert.equal(a.nodes.get('#mobile-route').hidden,false);
  assert.equal(a.nodes.get('#mobile-origin').value,'上海');assert.equal(a.nodes.get('#mobile-origin').focused,true);
  a.nodes.get('#mobile-origin').value='取消后的出发地';m.close();assert.equal(route.getRoute().origin,'上海');
  m.activate('destination');assert.equal(a.nodes.get('#mobile-destination').focused,true);
  a.nodes.get('#mobile-origin').value='  ';a.nodes.get('#mobile-destination').value='目的地';m.saveRoute();
  assert.equal(m.getState().panel,'route');assert(a.nodes.get('#mobile-route-error').textContent.includes('1–60'));assert.equal(route.getRoute().origin,'上海');
  a.nodes.get('#mobile-origin').value='长'.repeat(61);m.saveRoute();assert.equal(m.getState().panel,'route');
  a.nodes.get('#mobile-origin').value='  北京  ';a.nodes.get('#mobile-destination').value='  杭州  ';
  let prevented=false;m.saveRoute({preventDefault(){prevented=true;}});assert(prevented);assert.equal(m.getState().panel,'');
  assert.equal(route.getRoute().origin,'北京');assert.equal(route.getRoute().destination,'杭州');
  assert(route.getLive().includes('北京'));assert(route.getLive().includes('杭州'));
  m.activate('swap');assert.equal(route.getRoute().origin,'杭州');assert.equal(route.getRoute().destination,'北京');
  m.activate('destination');assert.equal(a.nodes.get('#mobile-destination').value,'北京');m.close();
  ai.setGoal(20);m.activate('vibe-2');await m.activate('start');assert.equal(page(a),2);
  assert.equal(ai.getPlan().request.scene,'drive');assert.equal(ai.getPlan().request.minutes,20);
  assert.equal(ai.getPlan().request.origin,'杭州');assert.equal(ai.getPlan().request.destination,'北京');
  m.activate('play');a.advance(1000);assert.equal(ai.getPosition().elapsed,40);
  m.tools();assert.equal(vm.runInContext('state.playing',a.context),false);m.close();m.activate('play');
  await ai.adjustTarget(30);assert.equal(ai.getPlan().targetSeconds,1800);assert.equal(ai.getPosition().elapsed,40);
  a.nodes.get('#mobile-content').scrollTop=100;
  a.context.render();assert.equal(a.nodes.get('#mobile-content').scrollTop,100,'Playback render reset scroll');
  m.primary();assert.equal(page(a),3);assert.equal(a.nodes.get('#mobile-content').scrollTop,0);
  await m.primary();assert(j.current().id);
  assert(a.nodes.get('#mobile-notice').textContent.includes('已保存'));assert.equal(a.nodes.get('#mobile-notice').hidden,false);
  m.records();assert(a.nodes.get('#mobile-record-list').innerHTML.includes(j.getRecords()[0].title));
  await m.refresh();await m.openRecord(0);assert.equal(page(a),5);assert.equal(m.getState().tab,'records');
  m.activate('back');assert.equal(m.getState().panel,'records');m.close();assert.equal(m.getState().tab,'mine');
  const savedFetch=a.context.fetch;a.context.fetch=async()=>{throw new TypeError('network failure');};
  m.records();await m.refresh();assert(a.nodes.get('#mobile-record-status').textContent.includes('未能连接'));
  assert(a.nodes.get('#mobile-record-list').innerHTML.includes(j.getRecords()[0].title),'Failed refresh lost saved records');
  a.context.fetch=savedFetch;await m.refresh();assert.equal(a.nodes.get('#mobile-record-status').textContent,'');m.close();
  m.mine();assert.equal(page(a),6);await m.activate('collection');assert.equal(page(a),5);
  m.activate('share');assert.equal(page(a),9);a.context.prompt=()=> '保留原图的记录';m.activate('title');m.activate('visibility');await m.activate('publish');assert.equal(page(a),4);
  assert(j.getRecords().some(r=>r.title==='保留原图的记录'&&r.visibility==='local'));
  m.home();m.extra(1);assert.equal(page(a),10);m.activate('indoor-cycle');m.activate('minutes-10');await m.activate('start');assert.equal(page(a),11);
  m.activate('play');a.advance(15000);assert.equal(page(a),13);await m.activate('save');assert(j.getRecords().some(r=>r.scene==='cycle'));
  const offline=await create('file:');offline.context.window.MotionMobile.home();offline.context.window.MotionMobile.activate('start');offline.context.window.MotionMobile.activate('start');
  await offline.context.window.MotionMobile.activate('start');
  assert(offline.nodes.get('#acts').innerHTML.includes('/mobile-app.html'));assert.equal(offline.nodes.get('#mobile-tools').open,true);
  const cancel=await create(),cm=cancel.context.window.MotionMobile;
  const normalFetch=cancel.context.fetch;
  cancel.context.fetch=(url,options={})=>url==='/api/playlist/generate'?new Promise((resolve,reject)=>{
    const abort=()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));
    if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});
  }):normalFetch(url,options);
  cm.activate('start');cm.activate('start');const waiting=cm.activate('start');
  assert.equal(cancel.context.window.MotionScoreAI.getUIState().busy,true);
  assert.equal(cancel.nodes.get('#mobile-primary').textContent,'取消当前操作');
  cm.primary();await waiting;assert.equal(page(cancel),0);assert.equal(cancel.context.window.MotionScoreAI.getUIState().busy,false);
  console.log('PASS: stable explore layout/content across repeated callbacks; real resize/filter updates; 14 original artworks, all-size hotspots, fixed navigation, records and journey flows.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
