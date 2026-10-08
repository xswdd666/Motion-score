// UI functions in a simulated DOM/audio environment, backed by a real test HTTP server.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {harness,boot}=require('./test_original_ui.cjs');
const base=process.env.FLOW_URL;
const evaluate=(app,code)=>vm.runInContext(code,app.context);
const json=value=>JSON.parse(JSON.stringify(value));
async function app(storage=new Map()){
  const a=harness({storage});
  if(base)a.context.fetch=(url,options={})=>fetch(new URL(url,base),{...options,signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(10000)])});
  boot(a);await a.context.window.MotionJourney.refresh();return a;
}
const page=a=>evaluate(a,'at');
const click=(a,id)=>a.context.window.MotionDesign.activate(id);
const go=(a,n)=>evaluate(a,`go(${n})`);
async function generate(a,scene,minutes=20){
  a.context.window.MotionScoreAI.configure({scene,minutes,genres:['流行','民谣'],surprise:true,vibe:'balanced',origin:'流程起点',destination:'流程终点'});
  go(a,['run','drive'].includes(scene)?8:10);
  await click(a,'start');
  assert.equal(a.context.window.MotionScoreAI.getPlan().request.scene,scene);
  assert.equal(page(a),['run','drive'].includes(scene)?2:11);
}
async function checks(){
  const storage=new Map(),a=await app(storage);
  for(const scene of ['run','drive','treadmill','gym','cycle','yoga']){
    await generate(a,scene);
    const ai=a.context.window.MotionScoreAI,j=a.context.window.MotionJourney,d=a.context.window.MotionDesign;
    click(a,'play');a.advance(1000);assert.equal(ai.getPosition().elapsed,40);
    const p=json(ai.getPlan()),position=json(ai.getPosition());
    // Settings for the next activity cannot change the current session clock.
    go(a,10);click(a,'minutes-60');a.advance(1000);
    assert.equal(evaluate(a,'state.playing'),false);assert.equal(ai.getPosition().elapsed,40);
    assert.equal(evaluate(a,'state.duration'),1200);assert.equal(ai.getUIState().minutes,60);
    go(a,['run','drive'].includes(scene)?2:11);
    click(a,'play');a.advance(1000);click(a,'play');assert.equal(ai.getPosition().elapsed,80);
    ai.finish();assert.equal(page(a),['run','drive'].includes(scene)?3:13);
    await d.persist(false);const saved=j.selection();
    assert(saved.id);assert.equal(saved.scene,scene);assert.equal(saved.minutes,1.333);
    assert.deepEqual(json(saved.plan.tracks).map(t=>t.id),p.tracks.map(t=>t.id));
    await d.persist(false);assert.equal(j.selection().id,saved.id,'Save duplicated one activity');
  }
  const fresh=await app(storage),j=fresh.context.window.MotionJourney,d=fresh.context.window.MotionDesign,ai=fresh.context.window.MotionScoreAI;
  assert.equal(j.getRecords().length,6,'Records lost on refresh or duplicated');
  const run=j.getRecords().find(r=>r.scene==='run'),cycle=j.getRecords().find(r=>r.scene==='cycle');
  // Details must use the selected saved plan, even with a different active session.
  await generate(fresh,'drive',30);
  await d.openRecord(cycle,6);assert.equal(page(fresh),5);
  assert(d.getLive().includes(cycle.plan.tracks[0].title));assert(d.getLive().includes('20 分钟'));
  await click(fresh,'song-1');assert.equal(page(fresh),11);
  assert.equal(ai.getPlan().request.scene,'cycle');assert.equal(ai.getPlan().tracks[0].id,cycle.plan.tracks[1].id);
  ai.finish();
  await d.openRecord(run,6);click(fresh,'share');assert.equal(page(fresh),9);
  fresh.context.prompt=()=> '验证后的发布标题';click(fresh,'title');click(fresh,'visibility');click(fresh,'allow-reuse');
  await click(fresh,'publish');assert.equal(page(fresh),4);
  assert.equal(j.getRecords().length,6);assert.equal(j.selection().id,run.id);
  await j.refresh();const published=j.getRecords().find(r=>r.id===run.id);
  assert.equal(published.title,'验证后的发布标题');assert.equal(published.visibility,'local');assert.equal(published.allowReuse,false);
  assert(j.items('all','',true).some(r=>r.id===run.id));assert(!j.items('all','',true).some(r=>r.id===cycle.id));
  d.reuse(published);assert.equal(page(fresh),4,'Disabled public reuse was allowed');
  await d.openRecord(published,6);d.reuse(published);assert.equal(page(fresh),8);
  assert.equal(ai.getUIState().minutes,20);assert.equal(evaluate(fresh,'state.mode'),'run');
  assert.equal(evaluate(fresh,'mockRoute.from'),'流程起点');
  await d.openRecord(published,6);j.toggleFavorite(published);
  const reloaded=await app(storage);assert(reloaded.context.window.MotionJourney.isFavorite(published));
  assert(reloaded.context.window.MotionJourney.items('favorites').some(r=>r.id===published.id));
  // Scene preference returns to the page where it was opened.
  go(reloaded,12);click(reloaded,'nav-7');assert.equal(page(reloaded),7);click(reloaded,'back');assert.equal(page(reloaded),12);
  go(reloaded,1);click(reloaded,'prefs');click(reloaded,'back');assert.equal(page(reloaded),1);
  // Reused gym scenes cannot retain a previously selected yoga training slot.
  go(reloaded,12);click(reloaded,'training-3');
  go(reloaded,6);reloaded.context.window.MotionDesign.reuse(reloaded.context.window.MotionJourney.getRecords().find(r=>r.scene==='gym'));
  await click(reloaded,'start');assert.equal(reloaded.context.window.MotionScoreAI.getPlan().request.scene,'gym');
  // Failed skip restores queue and position; playback continues instead of silently losing a song.
  const bad=await app();await generate(bad,'run');click(bad,'play');bad.advance(1000);
  const prior=json(bad.context.window.MotionScoreAI.getPlan()),pos=json(bad.context.window.MotionScoreAI.getPosition()),normalFetch=bad.context.fetch;
  bad.context.fetch=async(url,options)=>url==='/api/playlist/adjust'?{ok:false,json:async()=>({error:'测试中的调整失败'})}:normalFetch(url,options);
  await click(bad,'next-track');assert.deepEqual(json(bad.context.window.MotionScoreAI.getPlan()),prior);
  assert.deepEqual(json(bad.context.window.MotionScoreAI.getPosition()),pos);assert.equal(evaluate(bad,'state.playing'),true);
  bad.advance(1000);assert.equal(bad.context.window.MotionScoreAI.getPosition().elapsed,80);
  // Zero-length skipped entries retain their original row identity when a saved song is selected.
  const savedQueue=json(prior);savedQueue.tracks[0].playDuration=0;
  assert.equal(bad.context.window.MotionScoreAI.loadPlan(savedQueue,0),false);
  assert.equal(bad.context.window.MotionScoreAI.loadPlan(savedQueue,1),true);
  assert.equal(bad.context.window.MotionScoreAI.getPlan().tracks[0].id,savedQueue.tracks[1].id);
  const last=json(prior);last.tracks=[last.tracks.at(-1)];last.targetSeconds=last.tracks[0].playDuration;
  bad.context.window.MotionScoreAI.loadPlan(last);bad.audioObjects[0].emit('error');
  assert.equal(evaluate(bad,'state.playing'),false,'Broken last audio kept a silent timer running');
  // Changing pages during generation cancels the old request and cannot later jump back to a player.
  const cancel=boot(harness()),normal=cancel.context.fetch;let pending=0;
  cancel.context.fetch=(url,options={})=>{
    if(url!=='/api/playlist/generate')return normal(url,options);
    pending++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}))));
  };
  go(cancel,8);const generation=click(cancel,'start');
  await new Promise(resolve=>setImmediate(resolve));click(cancel,'start');assert.equal(pending,1);
  go(cancel,0);await generation;assert.equal(page(cancel),0);assert.equal(cancel.context.window.MotionScoreAI.getUIState().busy,false);
  // Selecting another card changes details/reuse together, rather than reusing the active session.
  const carousel=boot(harness());await generate(carousel,'run');carousel.context.window.MotionScoreAI.finish();
  click(carousel,'card-1');click(carousel,'reuse');assert.equal(page(carousel),8);
  assert.equal(evaluate(carousel,'mockRoute.from'),'成都');assert.equal(evaluate(carousel,'state.mode'),'drive');
  console.log('PASS: all 6 scenes generate/play/pause/finish/save; refresh, selected-record playback, publication updates/privacy, favorites, reuse and failure rollback.');
  // Exercise every registered hotspot once in isolation, checking synchronous and async completion.
  // This verifies action dispatch, not physical browser clicking or export rendering.
  let count=0;
  let sideCount=0;
  const definition=boot(harness()).context.window.MotionDesign.pages;
  for(let n=0;n<definition.length;n++)for(const h of definition[n].hits){
    const isolated=boot(harness());await isolated.context.window.MotionJourney.refresh();
    go(isolated,n);await click(isolated,h.id);count++;
    assert.equal(isolated.context.window.MotionScoreAI.getUIState().busy,false,`Stuck: page ${n+1}, ${h.id}`);
    assert.equal(isolated.context.window.MotionJourney.getStatus().saving,false);
  }
  for(let n=0;n<14;n++){
    const sample=boot(harness());go(sample,n);
    const total=[...sample.nodes.get('#acts').innerHTML.matchAll(/MotionDesign\.sideAction\((\d+)\)/g)].length;
    for(let i=0;i<total;i++){
      const isolated=boot(harness());await isolated.context.window.MotionJourney.refresh();go(isolated,n);
      await isolated.context.window.MotionDesign.sideAction(i);sideCount++;
      assert.equal(isolated.context.window.MotionScoreAI.getUIState().busy,false);
    }
  }
  const entrance=boot(harness());await entrance.context.window.MotionDesign.sideAction(1);assert.equal(page(entrance),10,'Home has no usable indoor entry');
  console.log(`PASS: ${count} actions across all 14 pages execute without an exception or a stuck waiting state.`);
  console.log(`PASS: ${sideCount} sidebar actions, including the home indoor entrance.`);
}
checks().catch(error=>{console.error(error);process.exitCode=1;});
