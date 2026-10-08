/* Attach AI behaviour to the original 14-page prototype. No CSS or page templates. */
(() => {
  'use strict';
  const originalRender = render;
  const originalGo = go;
  const originalTransientView = transientView;
  const sessionAudio = new Audio();
  sessionAudio.id = 'motion-ai-audio';
  sessionAudio.hidden = true;
  sessionAudio.preload = 'auto';
  document.body.appendChild(sessionAudio);
  const supportedGenres = ['民谣','流行','独立','摇滚','电子','轻音乐'];
  const config = {genres:['流行'], vibe:'balanced', text:'', surprise:true, scenery:'海岸', minutes:30};
  let plan = null, currentElapsed = 0, lastTick = 0, loadedAudio = '', busy = false;
  let controller = null, health = null, prefsTouched = false, densityTouched = false, connectionError = '';
  const failed = new Set();
  let sessionId=0, finished=false, replay=false, playbackRate=40;
  function savePreferences(){try{localStorage.setItem('motion-score-preferences',JSON.stringify(config));}catch{}}
  try{
    const saved=JSON.parse(localStorage.getItem('motion-score-preferences')||'null');
    if(saved && typeof saved==='object'){
      config.genres=Array.isArray(saved.genres)?saved.genres.filter(g=>supportedGenres.includes(g)):config.genres;
      config.vibe=['calm','balanced','energetic'].includes(saved.vibe)?saved.vibe:config.vibe;
      config.text=typeof saved.text==='string'?saved.text.slice(0,500):'';config.surprise=saved.surprise!==false;
      config.scenery=['城市','山路','公路','山野','海岸'].includes(saved.scenery)?saved.scenery:'海岸';
      config.minutes=typeof saved.minutes==='number'&&saved.minutes>=5&&saved.minutes<=180?saved.minutes:30;
      state.duration=Math.round(config.minutes*60);state.goal=`${config.minutes} 分钟`;prefsTouched=true;densityTouched=true;
    }
  }catch{}
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const indoorScenes = {treadmill:'treadmill',gym:'gym',cycle:'cycle',yoga:'yoga'};
  const requestScene = inside => inside ? (indoorScenes[state.indoor] || 'treadmill') : state.mode;
  const currentSong = () => plan?.tracks[state.track];
  const minutes = () => state.duration / 60;
  const sessionIndoor = () => plan && !['run','drive'].includes(plan.request.scene);
  const sourceLabel = () => plan?.source === 'deepseek' ? 'DeepSeek 编排' : '本地规则编排';

  async function api(path,data,signal){
    if(window.location?.protocol==='file:')throw new Error('当前直接打开了网页文件，未连接本地服务。请点击右侧“打开本地 AI 页面”，或双击“启动本地版.cmd”。');
    let response;
    try{
      response = await fetch(path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal});
    }catch(error){
      if(error.name==='AbortError')throw error;
      const file=window.location?.protocol==='file:';
      throw new Error(file?'当前直接打开了网页文件，未连接本地服务。请双击“启动本地版.cmd”，使用它打开的网页。':'页面未能连接本地服务。请保持启动窗口运行，并用“启动本地版.cmd”重新打开网页。');
    }
    let result;
    try{result=await response.json();}catch{
      throw new Error('当前网址没有提供 AI 服务。请通过“启动本地版.cmd”打开网页，不能只使用静态页面预览。');
    }
    if(!response.ok) throw new Error(result.error || '本地服务暂时不可用。');
    return result;
  }
  async function checkConnection(signal){
    try{
      const result=await api('/api/health',undefined,signal);
      if(!result || result.application!=='motion-score-local'||result.ok!==true)throw new Error('当前网址不是移动原声带的本地服务，请通过“启动本地版.cmd”重新打开。');
      health=result;connectionError='';return result;
    }catch(error){
      if(error.name!=='AbortError'){health=null;connectionError=error.message;}
      throw error;
    }
  }
  function announce(message){
    if(window.MotionDesign){window.MotionDesign.announce(message);return;}
    // Use the existing text area, not a new toast, badge, panel or style.
    const screen = document.querySelector('#screen');
    const text = screen?.querySelector('p.sub');
    if(text) text.textContent = message;
    else alert(message);
  }
  function setGoal(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n < 5 || n > 180) throw new Error('时长请填写 5–180 分钟。');
    config.minutes=n;
    savePreferences();
    if(!plan){state.duration = Math.round(n * 60);state.goal = `${n} 分钟`;}
  }
  function askGoal(){
    const value = prompt('本次目标时长（5–180 分钟）',String(config.minutes));
    if(value === null) return;
    try{setGoal(value);mockRoute.duration=`${config.minutes} min`;render();}catch(error){alert(error.message);}
  }
  function askRequest(){
    const value = prompt('告诉 AI 你的音乐需求，也可以填写时长，例如：30分钟，喜欢民谣，后半段更有精神。',config.text);
    if(value === null) return;
    if(value.length > 500){alert('音乐需求最多 500 字。');return;}
    try{
      const match = value.match(/(\d+(?:\.\d+)?)\s*(?:分钟|min\b)/i);
      if(match) setGoal(match[1]);
      config.text=value;
      savePreferences();
      if(match)mockRoute.duration=`${config.minutes} min`;
      render();
    }catch(error){alert(error.message);}
  }
  function keyboardAction(element,action,label){
    if(!element)return;
    element.setAttribute('role','button');
    element.setAttribute('tabindex','0');
    element.setAttribute('aria-label',label);
    element.title=label;
    element.onclick=action;
    element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}};
  }
  function bindControls(){
    const screen=document.querySelector('#screen');
    if(!screen)return;
    if(at===8){
      const custom=Array.from(screen.querySelectorAll('.chip')).find(b=>b.textContent==='自定义');
      if(custom){custom.onclick=askRequest;custom.title='填写 AI 音乐需求和目标时长';}
      for(const chip of screen.querySelectorAll('.chips .chip')){
        if(['城市','山野','海岸'].includes(chip.textContent)){
          chip.onclick=()=>{config.scenery=chip.textContent;for(const other of screen.querySelectorAll('.chips .chip'))other.classList.toggle('active',other===chip);};
        }
      }
      // The existing map and ribbon become functional, without adding controls.
      keyboardAction(screen.querySelector('.map'),askGoal,'调整目标时长');
    }
    if(at===8 || at===12){
      keyboardAction(screen.querySelector('.ribbon'),()=>{
        const values=['calm','balanced','energetic'];config.vibe=values[(values.indexOf(config.vibe)+1)%3];densityTouched=true;render();
      },'选择音乐密度：点击在舒缓、平衡和提神间切换');
      if(densityTouched){
        const heading=Array.from(screen.querySelectorAll('h3')).find(h=>h.textContent.startsWith('音乐密度'));
        if(heading)heading.textContent=`音乐密度 · ${{calm:'舒缓',balanced:'平衡',energetic:'提神'}[config.vibe]}`;
      }
      const toggle=screen.querySelector('.toggle');
      if(toggle){toggle.classList.toggle('on',config.surprise);toggle.onclick=()=>{config.surprise=!config.surprise;toggle.classList.toggle('on',config.surprise);};}
    }
    if(at===7){
      for(const chip of screen.querySelectorAll('.chip')){
        const genre=chip.textContent;
        if(prefsTouched)chip.classList.toggle('active',config.genres.includes(genre));
        chip.onclick=()=>{
          if(!supportedGenres.includes(genre)){alert('示例曲库暂未包含这一风格，请选择其他风格。');return;}
          config.genres=config.genres.includes(genre)?config.genres.filter(g=>g!==genre):[...config.genres,genre];
          prefsTouched=true;render();
        };
      }
    }
    if(at===10){
      for(const chip of screen.querySelectorAll('.chip')){
        const label=chip.textContent;
        if(/^\d+ 分钟$/.test(label))chip.onclick=()=>{setGoal(parseInt(label,10));render();};
      }
      const scenes=screen.querySelectorAll('.scene');
      if(scenes[2])scenes[2].onclick=()=>{state.indoor='cycle';render();};
      if(scenes[3])scenes[3].onclick=()=>{state.indoor='yoga';render();};
    }
    if(at===12){
      const choices=screen.querySelectorAll('.chips .chip');
      for(const chip of choices){
        if(/^\d+ 分钟$/.test(chip.textContent)){
          chip.classList.toggle('active',chip.textContent===state.goal);
          chip.onclick=()=>{setGoal(parseInt(chip.textContent,10));render();};
        }
      }
      const scenes=screen.querySelectorAll('.scene');
      scenes.forEach((element,index)=>element.onclick=()=>{
        state.indoor=index===3?'yoga':index===1?'cycle':'gym';
        config.vibe=index===3?'calm':index===0?'energetic':'balanced';
        scenes.forEach((other,i)=>other.classList.toggle('selected',i===index));
      });
    }
    if(plan && (at===2 || at===11)){
      const info=screen.querySelectorAll('.two .info');
      keyboardAction(info[1],()=>askAdjustment(),'调整旅程总时长，保留当前歌曲');
      const subtitle=screen.querySelectorAll('p.sub');
      const last=subtitle[subtitle.length-1];
      if(last){last.textContent=`${currentSong()?.title || ''} · ${sourceLabel()} · 示例音频`;last.title=[plan.message,plan.intent.summary,...plan.warnings].join('\n');}
      if(at===2 && info[1]){
        const value=info[1].querySelector('strong');
        if(value)value.textContent=formatTime(Math.max(0,state.duration-state.elapsed));
        for(const node of info[1].childNodes)if(node.nodeType===3)node.textContent='剩余时间';
      }
    }
    if(plan && at===5){
      const heading=Array.from(screen.querySelectorAll('h3')).find(h=>h.textContent.startsWith('原声带'));
      if(heading)heading.textContent=`原声带 · ${plan.tracks.length} 首`;
      const list=screen.querySelector('.song-list');
      if(list)list.innerHTML=plan.tracks.map(t=>`<div class="song"><i class="song-art"></i><span>${esc(t.title)}<br><small class="muted">${esc(t.stage)} · ${esc(t.genre)}</small></span><button onclick="skipTrack(1)">▶</button></div>`).join('');
    }
    if(plan && at===13){
      const stats=screen.querySelectorAll('.stats .info strong');
      if(stats[2])stats[2].textContent=String(plan.tracks.length);
    }
    if(transient==='generate' && busy){
      const overlay=screen.querySelector('.overlay');
      if(overlay){
        const sub=overlay.querySelector('p');
        if(sub)sub.textContent=health?.deepseekConfigured?'DeepSeek 正在编排，完成后检查歌曲和时长。':'未配置 DeepSeek，正在使用本地规则。';
      }
    }
  }
  render=function(){originalRender();bindControls();};
  go=function(next){
    if(next!==at && state.playing){tick();stopTimer();}
    if(busy){controller?.abort();busy=false;}
    originalGo(next);
    if(next!==2 && next!==11)state.playing=false;
  };
  transientView=function(){
    if(transient==='generate')return `<div class="overlay"><div class="spinner">♫</div><h2>${health?.deepseekConfigured?'AI 正在根据路线、运动目标和音乐偏好生成原声带…':'正在根据运动目标和音乐偏好编排原声带…'}</h2><p class="sub">正在编排并检查歌曲和时长</p></div>`;
    return originalTransientView();
  };
  function requestData(inside){const suffix=inside?'':`\n沿途氛围：${config.scenery}`;return {scene:requestScene(inside),minutes:config.minutes,genres:config.genres,vibe:config.vibe,text:config.text+(config.text.length+suffix.length<=500?suffix:''),surprise:config.surprise,origin:mockRoute.from,destination:mockRoute.to};}
  async function generate(inside){
    if(busy)return;
    if(window.MotionMap?.hasUnfinishedTrack()){announce('当前运动已有轨迹，请先通过“轨迹地图 → 结束运动”完成并保存，再开始新的原声带。');return;}
    stopTimer();busy=true;transient='generate';render();
    const targetPage=inside?11:2, startingPage=at;
    const localController=new AbortController();controller=localController;
    const timeout=setTimeout(()=>localController.abort(),35000);
    try{
      await checkConnection(localController.signal);
      if(localController.signal.aborted || at!==startingPage)return;
      const result=await api('/api/playlist/generate',requestData(inside),localController.signal);
      if(localController.signal.aborted || at!==startingPage)return;
      plan=result;state.tracks=result.tracks;tracks.splice(0,tracks.length,...result.tracks.map(t=>t.title));
      sessionId++;finished=false;replay=false;window.MotionDesign?.onGenerated?.();
      state.duration=result.targetSeconds;state.goal=`${result.request.minutes} 分钟`;
      state.elapsed=0;state.track=0;currentElapsed=0;loadedAudio='';failed.clear();
      mockRoute.duration=`${result.request.minutes} min`;
      at=targetPage;
      if(result.source!=='deepseek')setTimeout(()=>{if(at===targetPage)announce(result.message);},0);
    }catch(error){
      if(at===startingPage){
        const message=error.name==='AbortError'?'生成已取消或超时，请重试。':error.message;
        announce(message);alert(message);
      }
    }finally{
      clearTimeout(timeout);
      if(controller===localController){controller=null;busy=false;transient='';render();}
    }
  }
  generateOutdoor=()=>generate(false);
  startIndoor=()=>generate(true);
  stopTimer=function(){if(timer){clearInterval(timer);timer=null;}sessionAudio.pause();state.playing=false;};
  async function playAudio(){
    const t=currentSong();if(!t)return;
    const id=`${state.track}:${t.id}`;
    if(loadedAudio!==id){loadedAudio=id;sessionAudio.src=t.audioUrl;sessionAudio.loop=t.audioKind==='demo-loop';sessionAudio.load();}
    try{await sessionAudio.play();}catch(error){
      if(error.name==='NotAllowedError'){stopTimer();render();announce('请再点击一次播放，允许浏览器播放音频。');}
      else if(error.name!=='AbortError')audioFailed();
    }
  }
  function audioFailed(){
    if(!state.playing || busy || !plan)return;
    failed.add(currentSong()?.id);
    if(state.track+1>=plan.tracks.length || failed.size>=new Set(plan.tracks.map(t=>t.id)).size){stopTimer();render();announce('音频无法加载，请检查本地音频文件。');return;}
    skipTrack(1);
  }
  sessionAudio.addEventListener('error',audioFailed);
  function finishSession(){
    stopTimer();if(Math.abs(state.elapsed-state.duration)<.01)state.elapsed=state.duration;
    finished=true;window.MotionDesign?.onFinished?.();
    at=sessionIndoor()?13:3;render();
  }
  function tick(){
    if(!state.playing || busy || !plan)return;
    const now=performance.now();let delta=Math.min((now-lastTick)/1000*playbackRate,state.duration-state.elapsed);lastTick=now;
    let switched=false;
    while(delta>0 && currentSong()){
      const left=Math.max(0,currentSong().playDuration-currentElapsed), part=Math.min(delta,left);
      state.elapsed+=part;currentElapsed+=part;delta-=part;
      if(currentElapsed>=currentSong().playDuration-.00001){
        if(state.track+1<plan.tracks.length){state.track++;currentElapsed=0;switched=true;}
        else{finishSession();return;}
      }
    }
    if(state.elapsed>=state.duration-.001){finishSession();return;}
    render();if(switched)playAudio();
  }
  startTimer=function(){
    if(!plan)return;
    if(timer)clearInterval(timer);
    state.playing=true;lastTick=performance.now();timer=setInterval(tick,250);playAudio();
  };
  togglePlay=function(){
    if(busy)return;
    if(!plan)return generate(at===11);
    if((at===11)!==!!sessionIndoor()){announce('当前歌单属于另一个场景，请先从本页对应的设置生成。');return;}
    if(finished || state.elapsed>=state.duration){announce('本次已完成，请从设置重新生成。');return;}
    if(state.playing){tick();stopTimer();}else startTimer();
    render();
  };
  async function adjustTarget(value,quiet=false,resume=null){
    if(busy || !plan || finished)return false;
    const n=Number(value);
    if(!Number.isFinite(n)||n<5||n>180||n*60<=state.elapsed){
      if(resume && (at===2 || at===11)){startTimer();render();}
      alert('新目标须为 5–180 分钟，并大于已进行时间。');return false;
    }
    tick();if(state.elapsed>=state.duration)return;
    if(n*60<=state.elapsed){alert('新目标必须大于已进行时间。');return false;}
    const wasPlaying=resume??state.playing;stopTimer();busy=true;
    const localController=new AbortController();controller=localController;
    const timeout=setTimeout(()=>localController.abort(),10000);
    try{
      const result=await api('/api/playlist/adjust',{request:{...plan.request,minutes:n},tracks:plan.tracks,currentIndex:state.track,elapsed:state.elapsed,trackElapsed:currentElapsed,intent:plan.intent,source:plan.source},localController.signal);
      if(localController.signal.aborted)return false;
      plan=result;state.tracks=result.tracks;tracks.splice(0,tracks.length,...result.tracks.map(t=>t.title));
      state.duration=result.targetSeconds;state.goal=`${Math.round(result.targetSeconds/60)} 分钟`;mockRoute.duration=`${Math.round(result.targetSeconds/60)} min`;
      if(!quiet)alert([result.message,...result.warnings].join('\n'));
      return true;
    }catch(error){
      if(at===2 || at===11)alert(error.name==='AbortError'?'调整超时，请重试。':error.message);
      return false;
    }
    finally{
      clearTimeout(timeout);
      if(controller===localController){controller=null;busy=false;render();if(wasPlaying && (at===2 || at===11))startTimer();}
    }
  }
  function askAdjustment(){
    if(!plan || finished){announce('请先生成并开始一段原声带，再调整剩余时间。');return;}
    const wasPlaying=state.playing;
    tick();if(state.elapsed>=state.duration)return;
    stopTimer();render();
    const value=prompt('调整总目标时长（分钟），只更新后续歌曲。',String(minutes()));
    if(value===null){if(wasPlaying)startTimer();return;}
    adjustTarget(value,false,wasPlaying);
  }
  skipTrack=async function(step){
    if(!plan || busy || finished)return;
    tick();if(state.elapsed>=state.duration)return;
    if(step<0 && state.track===0){sessionAudio.currentTime=0;return;}
    if(step>0 && state.track+1>=plan.tracks.length){announce('已经是最后一首。');return;}
    const backup={plan:JSON.parse(JSON.stringify(plan)),index:state.track,position:currentElapsed,loaded:loadedAudio,playing:state.playing};
    stopTimer();
    const previous=step<0?{...plan.tracks[state.track-1],playDuration:plan.tracks[state.track-1].duration}:null;
    currentSong().playDuration=currentElapsed;
    if(previous)plan.tracks.splice(state.track+1,0,previous);
    state.track++;currentElapsed=0;loadedAudio='';
    const changed=await adjustTarget(minutes(),true,false);
    if(!changed){plan=backup.plan;state.track=backup.index;currentElapsed=backup.position;loadedAudio=backup.loaded;state.tracks=plan.tracks;tracks.splice(0,tracks.length,...plan.tracks.map(t=>t.title));}
    if(backup.playing && (at===2 || at===11))startTimer();
    render();
  };
  // Expose only non-secret state for local automated checks and later integrations.
  window.MotionScoreAI={
    generate,adjustTarget,askRequest,askGoal,askAdjustment,api,
    getSession:()=>({id:sessionId,finished,replay}),
    setPlaybackRate(value){if(value!==1 && value!==40)throw new Error('播放速度无效。');if(state.playing)tick();playbackRate=value;lastTick=performance.now();},
    finish(){if(!plan || busy){announce('请先生成原声带。');return false;}tick();if(!finished)finishSession();return true;},
    loadPlan(saved,index=0){
      if(window.MotionMap?.hasUnfinishedTrack()){announce('当前运动已有轨迹，请先结束并保存，再试听其他记录。');return;}
      if(busy || !saved?.tracks?.length)return false;
      const restored=JSON.parse(JSON.stringify(saved));
      index=Math.max(0,Math.min(Math.floor(index),restored.tracks.length-1));
      const chosen=restored.tracks[index];
      if(chosen.playDuration<=0){announce('这首在原记录中已跳过，请选择其他歌曲。');return false;}
      restored.tracks=restored.tracks.filter(t=>t.playDuration>0);
      index=restored.tracks.indexOf(chosen);stopTimer();plan=restored;
      plan.tracks=[...plan.tracks.slice(index),...plan.tracks.slice(0,index)];
      sessionId++;finished=false;replay=true;state.elapsed=0;state.track=0;currentElapsed=0;loadedAudio='';failed.clear();
      state.duration=plan.targetSeconds;state.goal=`${Math.round(plan.targetSeconds/60)} 分钟`;state.tracks=plan.tracks;
      tracks.splice(0,tracks.length,...plan.tracks.map(t=>t.title));
      at=sessionIndoor()?11:2;startTimer();render();return true;
    },
    shuffle(){
      if(!plan || busy || finished){announce('请先生成原声带。');return;}
      const tail=plan.tracks.slice(state.track+1);
      if(tail.length<2){announce('后续歌曲不足两首，无需打乱。');return;}
      const original=tail.map(t=>t.id).join();let valid=false;
      for(let attempt=0;attempt<30;attempt++){
        for(let i=tail.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tail[i],tail[j]]=[tail[j],tail[i]];}
        const artists=[...plan.tracks.slice(Math.max(0,state.track-1),state.track+1),...tail].map(t=>t.artist);
        if(tail.map(t=>t.id).join()!==original && !artists.some((a,i)=>i>1&&a===artists[i-1]&&a===artists[i-2])){valid=true;break;}
      }
      if(valid){plan.tracks.splice(state.track+1,tail.length,...tail);tracks.splice(0,tracks.length,...plan.tracks.map(t=>t.title));announce('已打乱后续歌曲，当前歌曲和整体进度保留。');}
      else announce('当前曲库较小，保留原顺序。');
    },
    getPlan:()=>plan,getPosition:()=>({index:state.track,elapsed:state.elapsed,trackElapsed:currentElapsed}),
    getUIState:()=>({...config,genres:[...config.genres],prefsTouched,densityTouched,busy,deepseekConfigured:!!health?.deepseekConfigured,connected:!!health,connectionError}),
    checkConnection,
    touchPreferences(){prefsTouched=true;render();},
    setGenre(genre){
      if(!supportedGenres.includes(genre)){alert('示例曲库暂未包含这一风格，请选择其他风格。');return;}
      config.genres=config.genres.includes(genre)?config.genres.filter(g=>g!==genre):[...config.genres,genre];
      prefsTouched=true;savePreferences();render();
    },
    configure(request){
      config.genres=(request.genres||['流行']).filter(g=>supportedGenres.includes(g));
      config.vibe=['calm','balanced','energetic'].includes(request.vibe)?request.vibe:'balanced';
      config.text=String(request.text||'').replace(/\n沿途氛围：[^\n]*$/,'').slice(0,500);
      const scenery=request.text?.match(/\n沿途氛围：([^\n]*)$/)?.[1];if(scenery)config.scenery=scenery;
      config.surprise=request.surprise!==false;setGoal(request.minutes||30);prefsTouched=true;densityTouched=true;
      if(['run','drive'].includes(request.scene))state.mode=request.scene;else if(indoorScenes[request.scene])state.indoor=request.scene;
      mockRoute.from=request.origin||mockRoute.from;mockRoute.to=request.destination||mockRoute.to;savePreferences();render();
    },
    addPreference(text){if(config.text.length+text.length+1>500){announce('音乐需求最多 500 字，请先精简。');return;}config.text+=(config.text?'，':'')+text;savePreferences();announce('已记录音乐需求，下一次生成时生效。');},
    setScenery(value){config.scenery=value;savePreferences();render();},
    setVibe(value){if(['calm','balanced','energetic'].includes(value)){config.vibe=value;densityTouched=true;savePreferences();render();}},
    toggleSurprise(){config.surprise=!config.surprise;savePreferences();render();},
    setGoal(value){try{setGoal(value);mockRoute.duration=`${config.minutes} min`;render();}catch(error){alert(error.message);}}
  };
  checkConnection().catch(()=>{}).finally(()=>render());
  bindControls();
})();
