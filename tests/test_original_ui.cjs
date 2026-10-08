// Regression: original artwork identity, image controls and AI playback flow.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'original/motion-score-html.js'),'utf8');
const integration=fs.readFileSync(path.join(root,'ai-integration.js'),'utf8');
const design=fs.readFileSync(path.join(root,'design-pages.js'),'utf8');
const journey=fs.readFileSync(path.join(root,'journey-data.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
const references=JSON.parse(fs.readFileSync(path.join(__dirname,'design-reference.json'),'utf8'));

function harness(options={}){
  const nodes=new Map();
  const requests=[];
  const alerts=[];
  const storage=options.storage||new Map();
  let cards=[];
  function element(){return {innerHTML:'',textContent:'',style:{},childNodes:[],setAttribute(){},appendChild(node){node.parentNode=this;this.childNodes.push(node);},querySelector(){return null;},querySelectorAll(){return [];}};}
  for(const id of ['#screen','#bar','#steps','#acts','#prev','#next','#actionDesc'])nodes.set(id,element());
  // Parse only the image/live slots to exercise image reuse on playback ticks.
  const screen=nodes.get('#screen');let screenMarkup='',slots=new Map();
  Object.defineProperty(screen,'innerHTML',{get:()=>screenMarkup,set:value=>{
    screenMarkup=value;slots=new Map();
    if(value.includes('id="design-art"')){
      const src=value.match(/id="design-art" src="([^"]+)"/)[1];
      slots.set('#design-art',{getAttribute:name=>name==='src'?src:null});
      slots.set('#design-live',element());
      slots.set('.design-stage',element());
    }
  }});
  screen.querySelector=selector=>slots.get(selector)||null;
  screen.classList={add(){}};
  let clock=0;
  const audioObjects=[];
  const intervals=new Map();let nextId=1;
  class Audio {
    constructor(){this.paused=true;this.currentTime=0;this.src='';this.events=new Map();audioObjects.push(this);}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    load(){}
    addEventListener(event,fn){this.events.set(event,fn);}
    emit(event){return this.events.get(event)?.();}
  }
  const generated={request:{scene:'run',minutes:30,genres:['流行'],vibe:'balanced',text:'',surprise:true,origin:'深圳湾',destination:'人才公园'},
    targetSeconds:1800,playlistSeconds:1800,source:'rules',message:'test local rules',warnings:[],intent:{summary:'test'},
    tracks:[{...catalog[0],playDuration:195,stage:'开场'}, {...catalog[1],playDuration:213,stage:'进行中'},
      {...catalog[2],playDuration:231,stage:'进行中'}, {...catalog[3],playDuration:249,stage:'进行中'},
      {...catalog[4],playDuration:204,stage:'进行中'}, {...catalog[5],playDuration:222,stage:'进行中'},
      {...catalog[6],playDuration:240,stage:'进行中'}, {...catalog[7],playDuration:246,stage:'收尾'}]};
  // Last demo slice is the exact remainder.
  generated.tracks[7].playDuration=1800-generated.tracks.slice(0,7).reduce((s,t)=>s+t.playDuration,0);
  const context=vm.createContext({console,Audio,AbortController,window:{location:{protocol:options.protocol||'http:'}},
    document:{head:element(),body:element(),createElement:element,querySelector:s=>nodes.get(s)||null},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    performance:{now:()=>clock},
    setTimeout(){return 999;},clearTimeout(){},
    setInterval(fn){const id=nextId++;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);},
    prompt(){return null;},alert(message){alerts.push(message);},
    fetch:async (url,options={})=>{
      const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
      let result={};
      if(url==='/api/playlist/generate' || url==='/api/playlist/preview'){
        result=structuredClone(generated);result.request=body;result.targetSeconds=body.minutes*60;
        result.tracks.forEach(t=>t.playDuration=t.playDuration*body.minutes/30);
      }
      if(url==='/api/health')result={application:'motion-score-local',ok:true,deepseekConfigured:false};
      if(url==='/api/playlist')result={tracks:catalog};
      if(url==='/api/community'){
        if(body){result={...body,id:body.id||'saved-'+(cards.length+1)};cards=[result,...cards.filter(c=>c.id!==result.id)];}
        else result={items:structuredClone(cards)};
      }
      if(url==='/api/playlist/adjust'){
        result={...structuredClone(generated),request:body.request,targetSeconds:body.request.minutes*60,tracks:structuredClone(body.tracks)};
        const currentEnd=body.elapsed+body.tracks[body.currentIndex].playDuration-body.trackElapsed;
        result.targetSeconds=Math.max(result.targetSeconds,currentEnd);
        result.tracks=result.tracks.slice(0,body.currentIndex+1);
        if(result.targetSeconds>currentEnd)result.tracks.push({...catalog[0],playDuration:result.targetSeconds-currentEnd});
      }
      return {ok:true,json:async()=>result};
    }
  });
  vm.runInContext(original,context);
  return {context,nodes,requests,alerts,audioObjects,advance(ms){clock+=ms;for(const callback of [...intervals.values()])callback();}};
}

async function runChecks(){
  const before=harness(),after=harness();vm.runInContext(integration,after.context);
  for(let i=0;i<14;i++){
    vm.runInContext(`go(${i})`,before.context);vm.runInContext(`go(${i})`,after.context);
    assert.equal(after.nodes.get('#screen').innerHTML,before.nodes.get('#screen').innerHTML,`Page ${i+1} template changed`);
    assert.equal(after.nodes.get('#steps').innerHTML,before.nodes.get('#steps').innerHTML,`Page directory changed`);
  }
  assert.equal(fs.readFileSync(path.join(root,'motion-score-html.js'),'utf8'),original);
  const html=fs.readFileSync(path.join(root,'motion-score-html.html'),'utf8');
  const oldHtml=fs.readFileSync(path.join(root,'original/motion-score-html.html'),'utf8');
  assert.deepEqual(html.match(/<style>[\s\S]*?<\/style>/g).map(s=>s.replace(/\r\n/g,'\n')),oldHtml.match(/<style>[\s\S]*?<\/style>/g).map(s=>s.replace(/\r\n/g,'\n')));
  assert(html.includes('design-pages.css?v=1'));
  assert(html.indexOf('design-pages.js?')>html.indexOf('journey-data.js?'));
  assert(html.indexOf('journey-data.js?')>html.indexOf('ai-integration.js?'));
  assert(!/local-app\.(?:js|css)/.test(html));
  vm.runInContext('go(8)',after.context);
  await vm.runInContext('generateOutdoor()',after.context);
  assert.equal(vm.runInContext('at',after.context),2);
  assert.equal(vm.runInContext('tracks.length',after.context),8);
  vm.runInContext('togglePlay()',after.context);after.advance(1000);
  assert.equal(vm.runInContext('state.elapsed',after.context),40);
  vm.runInContext('togglePlay()',after.context);after.advance(2000);
  assert.equal(vm.runInContext('state.elapsed',after.context),40,'Pause did not stop progress');
  vm.runInContext('togglePlay()',after.context);after.advance(44000);
  assert.equal(vm.runInContext('state.elapsed',after.context),1800);
  assert.equal(vm.runInContext('at',after.context),3);
  assert.equal(vm.runInContext('state.playing',after.context),false);
  const indoor=harness();vm.runInContext(integration,indoor.context);
  vm.runInContext("go(10);window.MotionScoreAI.setGoal(10)",indoor.context);
  await vm.runInContext('startIndoor()',indoor.context);
  assert.equal(vm.runInContext('at',indoor.context),11);
  assert.equal(vm.runInContext('state.playing',indoor.context),false,'Indoor starts before explicit play');
  const adjusting=harness();vm.runInContext(integration,adjusting.context);
  vm.runInContext('go(8)',adjusting.context);await vm.runInContext('generateOutdoor()',adjusting.context);
  vm.runInContext('togglePlay()',adjusting.context);adjusting.advance(1000);
  await vm.runInContext('window.MotionScoreAI.adjustTarget(45)',adjusting.context);
  assert.equal(vm.runInContext('state.duration',adjusting.context),2700);
  assert.equal(vm.runInContext('state.elapsed',adjusting.context),40);
  assert.equal(vm.runInContext('state.playing',adjusting.context),true);
  let sent=adjusting.requests.filter(r=>r.url==='/api/playlist/adjust').at(-1).body;
  assert.equal(sent.currentIndex,0);assert.equal(sent.trackElapsed,40);
  await vm.runInContext('skipTrack(1)',adjusting.context);
  sent=adjusting.requests.filter(r=>r.url==='/api/playlist/adjust').at(-1).body;
  assert.equal(sent.currentIndex,1);assert.equal(sent.trackElapsed,0);
  assert.equal(sent.tracks[0].playDuration,40);
  assert.equal(vm.runInContext('state.elapsed',adjusting.context),40);
  assert.equal(vm.runInContext('state.playing',adjusting.context),true);
  vm.runInContext('stopTimer()',adjusting.context);
  await vm.runInContext('window.MotionScoreAI.adjustTarget("bad",false,true)',adjusting.context);
  assert.equal(vm.runInContext('state.playing',adjusting.context),true,'Invalid input left prompted playback paused');
  const designed=harness();boot(designed);
  const designPages=designed.context.window.MotionDesign.pages;
  assert.equal(designPages.length,14);
  for(let i=0;i<14;i++){
    vm.runInContext(`go(${i})`,designed.context);
    const markup=designed.nodes.get('#screen').innerHTML;
    assert(markup.includes(`design-assets/hd-pages/${designPages[i].file}`),`Design image ${i+1} missing`);
    assert(!markup.includes('scene-grid'),'Simplified page leaked into design view');
    assert(fs.existsSync(path.join(root,'design-assets/hd-pages',designPages[i].file)));
    const artwork=fs.readFileSync(path.join(root,'design-assets/hd-pages',designPages[i].file));
    const sha=crypto.createHash('sha1').update(Buffer.from(`blob ${artwork.length}\0`)).update(artwork).digest('hex');
    assert.equal(sha,references[designPages[i].file],'Artwork differs from original repository');
    assert.equal(artwork.readUInt32BE(16),designPages[i].w);assert.equal(artwork.readUInt32BE(20),designPages[i].h);
    assert.equal(designed.context.window.MotionDesign.getLive(),'','Initial artwork has visible overlays');
    const ids=new Set();
    for(const h of designPages[i].hits){
      assert(!ids.has(h.id));ids.add(h.id);
      const [x,y,w,hgt]=h.rect;
      assert(x>=0&&y>=0&&w>0&&hgt>0&&x+w<=100&&y+hgt<=100,`Hotspot ${h.id} outside image`);
      assert(markup.includes(`aria-label="${h.label.replace(/&/g,'&amp;')}"`));
    }
  }
  vm.runInContext('go(1)',designed.context);
  designed.context.window.MotionDesign.activate('scene-drive');
  assert.equal(vm.runInContext('state.mode',designed.context),'drive');
  designed.context.window.MotionDesign.activate('start');
  assert.equal(vm.runInContext('at',designed.context),8);
  designed.context.window.MotionDesign.activate('vibe-2');
  designed.context.window.MotionDesign.activate('surprise');
  await designed.context.window.MotionDesign.activate('start');
  let generatedRequest=designed.requests.filter(r=>r.url==='/api/playlist/generate').at(-1).body;
  assert.equal(generatedRequest.scene,'drive');assert.equal(generatedRequest.vibe,'energetic');assert.equal(generatedRequest.surprise,false);
  assert.equal(vm.runInContext('at',designed.context),2);
  assert(designed.context.window.MotionDesign.getLive().includes('示例音频'));
  designed.context.window.MotionDesign.activate('play');designed.advance(1000);
  assert.equal(vm.runInContext('state.elapsed',designed.context),40);
  designed.context.window.MotionDesign.activate('play');designed.advance(1000);
  assert.equal(vm.runInContext('state.elapsed',designed.context),40);
  vm.runInContext('go(10)',designed.context);
  designed.context.window.MotionDesign.activate('minutes-20');
  designed.context.window.MotionDesign.activate('indoor-cycle');
  await designed.context.window.MotionDesign.activate('start');
  generatedRequest=designed.requests.filter(r=>r.url==='/api/playlist/generate').at(-1).body;
  assert.equal(generatedRequest.scene,'cycle');assert.equal(generatedRequest.minutes,20);
  assert.equal(vm.runInContext('at',designed.context),11);
  designed.context.window.MotionDesign.activate('play');designed.advance(30000);
  assert.equal(vm.runInContext('at',designed.context),13);
  assert.equal(vm.runInContext('state.elapsed',designed.context),1200);
  const offline=harness({protocol:'file:'});boot(offline);
  vm.runInContext('go(8)',offline.context);await offline.context.window.MotionDesign.activate('start');
  assert.equal(vm.runInContext('at',offline.context),8);
  assert(offline.alerts.some(s=>s.includes('当前直接打开了网页文件')));
  assert(!offline.alerts.some(s=>s.includes('Failed to fetch')));
  assert(!offline.requests.some(r=>r.url==='/api/playlist/generate'),'File page attempted generation');
  assert(offline.nodes.get('#acts').innerHTML.includes('http://127.0.0.1:43821/motion-score-html.html'));
  assert(offline.nodes.get('#actionDesc').textContent.includes('未连接本地服务'));
  const disconnected=harness();disconnected.context.fetch=async()=>{throw new TypeError('Failed to fetch');};
  boot(disconnected);
  vm.runInContext('go(8)',disconnected.context);await disconnected.context.window.MotionDesign.activate('start');
  assert(disconnected.alerts.some(s=>s.includes('页面未能连接本地服务')));
  assert.equal(vm.runInContext('transient',disconnected.context),'');
  assert.equal(disconnected.context.window.MotionScoreAI.getUIState().busy,false);
  console.log('PASS: 14 original artworks and hotspots; AI generation, scene/preferences, playback, adjustment and completion.');
  console.log('PASS: file opening and unavailable server give clear recovery messages, never raw Failed to fetch.');
}
function boot(app){for(const script of [integration,journey,design])vm.runInContext(script,app.context);return app;}
module.exports={harness,integration,journey,design,boot};
if(require.main===module)runChecks().catch(error=>{console.error(error);process.exitCode=1;});
