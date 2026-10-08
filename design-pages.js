/* Use the repository's 14 original artworks, without re-drawing them. */
(() => {
  'use strict';
  const ai=window.MotionScoreAI;
  const journey=window.MotionJourney;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const box=([x,y,w,h])=>`left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
  const hit=(id,label,rect,action)=>({id,label,rect,action});
  let training=0,sceneryTouched=false,sceneTouched=false,indoorTouched=false,message='';
  let prefsReturn=6,detailReturn=4,publishReturn=3,feedTab='all',profileTab='all',query='',tabsTouched=false,profileTouched=false,routeTouched=false;
  let cardTouched=false;
  const cardRecord=()=>journey.selection();
  function selectCard(index){const choices=[journey.current()||journey.getSeeds()[0],...journey.getSeeds().slice(1)];journey.choose(choices[index]);cardTouched=true;render();}
  function searchSport(gym=false){
    const options=gym?['力量训练','有氧','热身','拉伸']:['跑步机','健身房','室内单车','拉伸 / 瑜伽'];
    const text=prompt('选择运动：\n'+options.map((s,i)=>`${i+1}. ${s}`).join('\n'),'1');if(text===null)return;
    const index=Number(text)-1;if(!Number.isInteger(index)||index<0||index>3){announce('请输入 1–4 之间的序号。');return;}
    if(gym)train(index);else inside(['treadmill','gym','cycle','yoga'][index]);
  }
  const navigation=[];const playerGo=go;
  go=function(next){
    next=Math.max(0,Math.min(13,Number(next)||0));if(next!==at)navigation.push(at);
    const p=ai.getPlan(),indoor=p&&!['run','drive'].includes(p.request.scene);
    if(p && !ai.getUIState().busy && !ai.getSession().finished && ((next===3 && !indoor) || (next===13 && indoor))){ai.finish();return;}
    playerGo(next);
  };
  function backTo(fallback){const previous=navigation.pop();playerGo(previous??fallback);}
  function returnTo(target){const index=navigation.lastIndexOf(target);if(index>=0)navigation.splice(index);playerGo(target);}
  function preferences(){prefsReturn=at;ai.touchPreferences();go(7);}
  function visibleRecords(){return journey.items(at===4?feedTab:profileTab,at===4?query:'',at===4);}
  async function openRecord(record,returnPage=at){
    if(!record){announce('这里还没有原声带。完成旅程后可以保存到本机。');return;}
    detailReturn=returnPage;journey.choose(record);go(5);
    try{await journey.ensurePlan(record);if(at===5 && journey.selection().id===record.id)render();}catch(error){announce(error.message);}
  }
  function announce(text){message=text;render();}
  function reuse(record=journey.selection()){
    if(!record){announce('请先打开或生成一张原声带。');return;}
    if(!record.allowReuse && (at===4 || (at===5 && detailReturn===4))){announce('这张卡片关闭了他人复用，可收藏或查看详情。');return;}
    ai.configure(record.plan?.request||record.request||{scene:record.scene,minutes:Math.max(5,record.minutes),origin:record.origin,destination:record.destination});
    routeTouched=true;sceneTouched=true;indoorTouched=true;journey.choose(null);
    if(record.scene==='gym')training=0;
    go(['run','drive'].includes(record.scene)?8:record.scene==='gym'?12:10);
    announce('已带回这张卡片的场景、时长和偏好。点击开始，将重新编排。');
  }
  function publishEditor(){
    const record=journey.selection();if(record.demo){announce('请先生成并完成自己的原声带，再发布。');return;}
    publishReturn=at;go(9);
  }
  async function persist(publication=false){
    const startPage=at;
    try{
      const record=at===13?journey.viewCurrent():journey.selection();
      if((at===3 || at===13) && (!record || !ai.getSession().finished || (at===13)===['run','drive'].includes(record.scene))){throw new Error('请先生成并完成对应场景的原声带，再保存。');}
      const saved=await journey.save(record);
      if(at!==startPage)return;
      if(publication){go(saved.visibility==='local'?4:6);announce(saved.visibility==='local'?'已保存到本机发现页。':'已保存，仅自己可见。');}
      else{announce('已保存到本机，刷新后仍可在“我的”中打开。');}
    }catch(error){announce(error.message);alert(error.message);}
  }
  function editTitle(){
    const record=journey.selection();if(record.demo){announce('请先生成自己的原声带。');return;}
    const text=prompt('卡片标题（1–80 字）',record.title);if(text===null)return;
    if(!text.trim() || text.trim().length>80){announce('标题请填写 1–80 字。');return;}
    journey.setDraft({title:text.trim()});render();
  }
  function toggleSetting(key){const record=journey.selection();if(record.demo){announce('请先生成自己的原声带。');return;}journey.setDraft({[key]:key==='visibility'?(record.visibility==='local'?'private':'local'):!record[key]});render();}
  function search(){const text=prompt('搜索路线或卡片标题，留空显示全部',query);if(text!==null){query=text.trim();tabsTouched=true;render();}}
  function allRecords(){const list=visibleRecords();if(!list.length){announce('当前分类还没有原声带。');return;}
    const n=prompt('输入序号打开：\n'+list.map((r,i)=>`${i+1}. ${r.title} · ${r.origin} → ${r.destination}`).join('\n'),'1');
    if(n===null)return;const i=Number(n)-1;if(!Number.isInteger(i)||i<0||i>=list.length){announce('请选择列表中的序号。');return;}return openRecord(list[i]);}
  function toggleLike(index){const record=visibleRecords()[index];if(!record){announce('这里还没有原声带。');return;}const liked=journey.toggleFavorite(record);announce(liked?'已收藏，可在“我的 → 已收藏”查看。':'已取消收藏。');}
  function setRoute(origin,destination){
    const from=typeof origin==='string'?origin.trim():'',to=typeof destination==='string'?destination.trim():'';
    if(!from || !to || [...from].length>60 || [...to].length>60)throw new Error('出发地和目的地都请填写 1–60 字。');
    mockRoute.from=from;mockRoute.to=to;routeTouched=true;message='';render();
  }
  function editRoute(field){
    if(window.MotionMobile?.editRoute)return window.MotionMobile.editRoute(field);
    const previous=mockRoute[field],text=prompt(field==='from'?'出发地点（路线图仍是示意图）':'目的地点（路线图仍是示意图）',previous);if(text===null)return;
    try{setRoute(field==='from'?text:mockRoute.from,field==='to'?text:mockRoute.to);}catch(error){announce(error.message);}
  }
  async function playRecord(index=0){
    const record=journey.selection();try{const p=await journey.ensurePlan(record);ai.loadPlan(p,index);}catch(error){announce(error.message);}
  }
  async function downloadCard(){
    const record=at===13?journey.current():journey.selection();
    if(!record || record.demo){announce('请先生成并完成自己的原声带。');return;}
    try{
      const image=document.querySelector('#design-art');
      if(!image?.complete){announce('图片还在加载，请稍后再保存。');return;}
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);
      for(const node of document.querySelector('#screen').querySelectorAll('.design-value')){
        const x=parseFloat(node.style.left)/100*canvas.width,y=parseFloat(node.style.top)/100*canvas.height,w=parseFloat(node.style.width)/100*canvas.width,h=parseFloat(node.style.height)/100*canvas.height;
        context.fillStyle='#04131c';context.fillRect(x,y,w,h);context.fillStyle='#f4f7f8';context.font=`${Math.round(canvas.width*.032)}px Microsoft YaHei`;context.fillText(node.childNodes[0]?.textContent||node.textContent,x+5,y+h*.55,w-10);
        const sub=node.querySelector('small');if(sub){context.fillStyle='#bac9d5';context.font=`${Math.round(canvas.width*.02)}px Microsoft YaHei`;context.fillText(sub.textContent,x+5,y+h*.9,w-10);}
      }
      canvas.toBlob(blob=>{if(!blob){announce('图片保存失败，请重试。');return;}const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='移动原声带.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},'image/png');
    }catch{announce('当前浏览器未能导出图片，可先保存到本机收藏。');}
  }
  const sceneNames={treadmill:'跑步机',gym:'力量训练',cycle:'室内单车',yoga:'拉伸 / 瑜伽'};
  const source=p=>p.source==='deepseek'?'DeepSeek 编排':'本地规则编排';
  function playlist(){
    const p=ai.getPlan();
    if(!p){alert('请先从路线或运动设置生成原声带。');return;}
    alert(`${source(p)} · 示例音频\n${p.intent.summary}\n${p.message}\n${p.warnings.join('\n')}\n\n`+
      p.tracks.map((t,i)=>`${i+1}. ${t.title} · ${t.genre} · ${formatTime(t.playDuration)} · ${t.stage}`).join('\n'));
  }
  function outdoor(mode){state.mode=mode;sceneTouched=true;render();}
  function inside(scene){state.indoor=scene;indoorTouched=true;if(scene==='gym'){training=0;go(12);}else render();}
  function train(index){training=index;state.indoor=index===3?'yoga':index===1?'treadmill':'gym';ai.setVibe(index===3?'calm':index===0?'energetic':'balanced');}
  function scenery(value){sceneryTouched=true;ai.setScenery(value);}
  function finish(){ai.finish();}
  function showRequest(){
    const ui=ai.getUIState();
    alert(`目标：${ui.minutes} 分钟\n音乐需求：${ui.text||'尚未填写'}\n风格：${ui.genres.join('、')||'由系统推荐'}\n氛围：${{calm:'舒缓',balanced:'平衡',energetic:'提神'}[ui.vibe]}\n惊喜歌曲：${ui.surprise?'允许':'关闭'}\n\n地图和账号信息是原设计稿的演示内容。`);
  }
  function nav(y=89,w=14,start=17,step=17){
    return [['首页',0],['运动',10],['音乐偏好',7],['我的',6]].map(([label,target],i)=>hit(`nav-${target}`,label,[start+i*step,y,w,6],()=>target===7?preferences():go(target)));
  }
  const back=target=>hit('back','返回',[16,8.8,7,5],()=>backTo(target));
  const pages=[
    {file:'01-home.png',w:941,h:1672,hits:[
      hit('start','开始一段移动原声带',[15.5,77.8,69,6.5],()=>go(1)),
      hit('location','位置与路线说明',[15,44,24,8.6],showRequest),
      hit('weather','查看天气说明',[15,63.8,23,10.6],()=>announce('天气是设计稿中的演示信息，尚未接入实时天气。')),
      hit('wind','查看环境说明',[39,63.8,23,10.6],()=>announce('环境数据目前为演示信息。')),
      hit('music','设置音乐偏好',[63,63.8,23,10.6],preferences),
      ...[['首页',0],['探索',4],['记录',6],['我的',6]].map(([l,n],i)=>hit(`nav-${i}`,l,[15.5+i*19,88.5,14,6],()=>go(n))) ]},
    {file:'02-scene.png',w:1024,h:1536,hits:[back(0),
      hit('prefs','设置音乐偏好',[78,9,8,5],preferences),
      hit('scene-run','选择跑步',[14.8,26.4,34,32],()=>outdoor('run')),
      hit('scene-drive','选择驾车',[51.2,26.4,34,32],()=>outdoor('drive')),
      hit('density','查看音乐需求',[16,67,68,15],showRequest),
      hit('start','开始这段旅程',[16.3,84.8,67.6,7.2],()=>{routeTouched=true;go(8);})]},
    {file:'03-outdoor-play.png',w:1024,h:1536,hits:[
      hit('shuffle','打乱后续歌曲',[20,74,7,6],()=>ai.shuffle()),
      hit('previous','上一首',[32,74,7,6],()=>skipTrack(-1)),
      hit('play','播放或暂停',[43,72,17,12],()=>togglePlay()),
      hit('next-track','下一首',[62,74,7,6],()=>skipTrack(1)),
      hit('playlist','查看 AI 歌单',[73,74,8,6],playlist),
      hit('adjust','调整总时长',[65,63.8,16,5.5],()=>ai.askAdjustment()),
      hit('song-info','查看编排结果',[20,84.5,60,5.4],playlist)]},
    {file:'04-route-card.png',w:1024,h:1536,hits:[
      hit('top-more','查看卡片详情',[77,8,7,5],()=>openRecord(cardRecord(),3)),
      ...[0,1,2].map(i=>hit(`card-${i}`,'切换路线卡片',[41.5+i*5,64.5,4.5,4],()=>selectCard(i))),
      hit('reuse','复用这段原声带',[17,69,66,7.1],()=>reuse(cardRecord())),
      hit('save','保存图片',[18.5,78.5,11.8,10],downloadCard),
      hit('share','编辑并发布',[35.5,78.5,11.8,10],publishEditor),
      hit('video','视频说明',[53,78.5,11.8,10],()=>alert('当前尚未接入视频生成功能。')),
      hit('more','路线详情',[70,78.5,11.8,10],()=>openRecord(cardRecord(),3))]},
    {file:'05-discover.png',w:1024,h:1536,hits:[
      hit('search','搜索原声带',[77,8,7,5],search),
      ...[['发现','all'],['附近','nearby'],['热门','popular'],['长途','long']].map(([label,tab],i)=>hit(`filter-${i}`,label,[18+i*18,15.5,14,5],()=>{feedTab=tab;tabsTouched=true;render();if(tab==='popular')announce('本机收藏的卡片优先显示，尚未接入联网热度。');})),
      ...[20.8,44.2,68.8].flatMap((y,i)=>[hit(`route-${i}`,'查看路线详情',[16.2,y,47,21],()=>openRecord(visibleRecords()[i])),hit(`reuse-${i}`,'复用路线',[65.2,[37.2,61.8,84.8][i],16.5,4.5],()=>{const r=visibleRecords()[i];if(r)reuse(r);else announce('这里没有可复用的原声带。');}),hit(`like-${i}`,'收藏或取消收藏',[77.5,[22,45.5,70][i],5.5,3],()=>toggleLike(i))]),
      ...[['首页',0],['发现',4],['记录',6],['我的',6]].map(([l,n],i)=>hit(`nav-${i}`,l,[16+i*18,91.5,14,5.5],()=>go(n))) ]},
    {file:'06-route-detail.png',w:887,h:1774,hits:[
      hit('back','返回来源页',[9,8,7,4],()=>returnTo(detailReturn)),hit('share','编辑并发布',[81,8,8,4],publishEditor),
      ...[70.4,77,83.4].flatMap((y,i)=>[hit(`song-${i}`,'播放所选歌曲',[69,y,10,5],()=>playRecord(i)),hit(`song-info-${i}`,'查看歌曲信息',[81,y,7,5],()=>{const p=journey.selection().plan,t=p?.tracks[i];announce(t?`${t.title} · ${t.genre} · ${t.reason}`:'先打开一张卡片，读取示例歌单。');})]),
      hit('reuse','复用这段原声带',[9,90.8,82,6],()=>reuse())]},
    {file:'07-profile.png',w:1024,h:1536,hits:[
      hit('prefs','设置音乐偏好',[75,8,8,5],preferences),
      hit('account','查看账号说明',[18,14,64,10],()=>announce('头像和昵称为原设计稿示例，尚未接入真实账号。')),
      ...['all','favorites','shared','favorites'].map((tab,i)=>hit(`stat-${i}`,'查看对应本机记录',[18+i*16.5,26,14,7],()=>{profileTab=tab;profileTouched=true;render();})),
      ...[['我的路线','all'],['已收藏','favorites'],['分享','shared']].map(([label,tab],i)=>hit(`profile-tab-${i}`,label,[19+i*23,34.5,20,4],()=>{profileTab=tab;profileTouched=true;render();})),
      ...[0,1,2,3].map(i=>hit(i===0?'collection':`collection-${i}`,'打开收藏原声带',[17.8+(i%2)*33.2,39.5+Math.floor(i/2)*22.1,31.5,21],()=>openRecord(visibleRecords()[i]))),
      ...[['首页',0],['发现',4],['记录',6],['我的',6]].map(([l,n],i)=>hit(`nav-${i}`,l,[18+i*16.5,89,14,6],()=>go(n))) ]},
    {file:'08-preferences.png',w:1024,h:1536,hits:[hit('back','返回偏好设置入口',[16,8.8,7,5],()=>returnTo(prefsReturn)),
      hit('qq','QQ 连接说明',[19,13,63,20],()=>alert('这是原设计稿中的账号示意，尚未接入真实 QQ 音乐；当前使用示例曲库。')),
      ...['流行','独立','摇滚','电子','民谣','R&B','说唱','轻音乐'].map((g,i)=>hit(`genre-${i}`,`选择${g}`,[19.2+(i%4)*15.8,38.1+Math.floor(i/4)*4.8,14.5,4],()=>ai.setGenre(g))),
      ...['陈粒','万能青年旅店','告五人','落日飞车'].map((name,i)=>hit(`artist-${i}`,`偏好${name}的风格`,[19+i*16,52,14,11],()=>ai.addPreference(`偏好${name}的音乐风格`))),
      ...['夜晚放松','公路向前','治愈舒缓'].map((text,i)=>hit(`mood-${i}`,text,[19+i*21,68.8,19.5,12],()=>ai.addPreference(text))),
      hit('request','重新设置音乐需求',[19,82.5,62,6.5],()=>ai.askRequest())]},
    {file:'09-route-setup.png',w:1024,h:1536,hits:[back(1),
      hit('origin','编辑出发地点',[18,17,28,7],()=>editRoute('from')),
      hit('destination','编辑目的地点',[55,17,27,7],()=>editRoute('to')),
      hit('swap','交换出发与目的地点',[46.5,18.5,7,4.5],()=>{[mockRoute.from,mockRoute.to]=[mockRoute.to,mockRoute.from];routeTouched=true;render();}),
      hit('goal','调整目标时长',[18,25,64,26.5],()=>ai.askGoal()),
      hit('map-view','地图说明',[66,26.7,6.5,3.8],()=>announce('当前地图为原设计稿示意图，尚未接入真实路线规划。')),
      hit('satellite-view','卫星图说明',[73,26.7,7,3.8],()=>announce('卫星图服务尚未接入；当前路线仍使用原设计图。')),
      ...['山路','公路','山野','海岸'].map((s,i)=>hit(`scenery-${i}`,`选择${s}`,[18.3+i*12.2,57.2,11.9,4.2],()=>scenery(s))),
      hit('request','自定义 AI 音乐需求',[68.2,57.2,13.5,4.2],()=>ai.askRequest()),
      ...['calm','balanced','energetic'].map((v,i)=>hit(`vibe-${i}`,`音乐密度：${['舒缓','平衡','提神'][i]}`,[18+i*21,65.8,21,7.5],()=>ai.setVibe(v))),
      hit('surprise','允许或关闭惊喜歌曲',[70,76.7,12,4.4],()=>ai.toggleSurprise()),
      hit('start','开始这段旅程',[18,84.5,64.2,7],()=>generateOutdoor())]},
    {file:'10-publish.png',w:1024,h:1536,hits:[hit('back','返回卡片来源',[16,8.8,7,5],()=>returnTo(publishReturn)),
      hit('preview','预览卡片',[78,8,7,5],()=>openRecord(journey.selection(),9)),
      hit('title','编辑标题',[17,64.4,66,4.5],editTitle),
      hit('privacy','切换公开范围',[63,69.8,20,3.8],()=>toggleSetting('visibility')),
      hit('visibility','公开到本机发现或仅自己可见',[71,74.7,12,3.9],()=>toggleSetting('visibility')),
      hit('allow-reuse','允许或关闭他人复用',[71,80.6,12,3.9],()=>toggleSetting('allowReuse')),
      hit('publish','保存或发布本机卡片',[49.4,87.3,34.1,6.2],()=>persist(true)),
      hit('save','保存图片',[16.5,87.3,31.5,6.2],downloadCard)]},
    {file:'11-indoor-select.png',w:1024,h:1536,hits:[
      hit('search','选择运动项目',[77,8,7,5],()=>searchSport()),
      ...['treadmill','gym','cycle','yoga'].map((s,i)=>hit(`indoor-${s}`,`选择${sceneNames[s]}`,[18.5+(i%2)*33,26.7+Math.floor(i/2)*23.7,31,22.5],()=>inside(s))),
      ...[10,20,30,45,60].map((n,i)=>hit(`minutes-${n}`,`${n}分钟`,[18.8+i*12.6,76.8,11.8,4.2],()=>ai.setGoal(n))),
      hit('start','开始室内运动',[18.8,82.4,62,5.5],()=>startIndoor()),...nav()]},
    {file:'12-treadmill.png',w:1024,h:1536,hits:[back(10),
      hit('playlist','查看 AI 歌单',[78,8,7,5],playlist),
      hit('adjust','调整总时长',[72,64.3,12,5.3],()=>ai.askAdjustment()),
      hit('song-info','查看编排结果',[27,49.5,47,3.8],playlist),
      hit('shuffle','打乱后续歌曲',[18,85.6,7,5],()=>ai.shuffle()),
      hit('previous','上一首',[29,85.6,8,5],()=>skipTrack(-1)),
      hit('play','播放或暂停',[42,82.5,17,11.8],()=>togglePlay()),
      hit('next-track','下一首',[62,85.6,8,5],()=>skipTrack(1)),
      hit('finish','完成训练',[75,85,9,6],finish)]},
    {file:'13-gym-setup.png',w:1024,h:1536,hits:[
      hit('search','选择训练项目',[77,8,7,5],()=>searchSport(true)),
      ...['力量训练','有氧','热身','拉伸'].map((s,i)=>hit(`training-${i}`,`选择${s}`,[16.3+(i%2)*34.6,21.7+Math.floor(i/2)*16.4,33,14.7],()=>train(i))),
      ...[15,30,45,60].map((n,i)=>hit(`minutes-${n}`,`${n}分钟`,[16.5+i*17,56.8,16,4.7],()=>ai.setGoal(n))),
      ...['calm','balanced','energetic'].map((v,i)=>hit(`vibe-${i}`,`音乐密度：${['舒缓','平衡','提神'][i]}`,[17+i*22,65.2,22,6],()=>ai.setVibe(v))),
      hit('surprise','允许或关闭惊喜歌曲',[72,72.5,11,4.3],()=>ai.toggleSurprise()),
      hit('start','生成训练原声带',[17,78.8,66,6.2],()=>{state.indoor=training===3?'yoga':training===1?'treadmill':'gym';return startIndoor();}),...nav(86.4,14,16.5,17.5)]},
    {file:'14-workout-card.png',w:1024,h:1536,hits:[
      hit('share','编辑并发布训练卡片',[77,8,7,5],publishEditor),
      hit('save','保存训练原声带',[18,68,64,6.7],()=>persist(false)),
      hit('collection','查看训练收藏',[18,76,64,6.7],()=>go(6)),...nav(87,14,17,17.5)]}
  ];
  function value(rect,text,sub='',classes=''){
    return `<div class="design-value ${classes}" style="${box(rect)}">${esc(text)}${sub?`<small>${esc(sub)}</small>`:''}</div>`;
  }
  function chip(rect,label,on){return value(rect,label,'',`center chip${on?' active':''}`);}
  function choice(rect,on){return `<div class="design-choice${on?' on':''}" style="${box(rect)}"></div>`;}
  function switchView(rect,on){return `<div class="design-switch${on?' on':''}" style="${box(rect)}"><i></i></div>`;}
  function live(){
    const ui=ai.getUIState(),p=ai.getPlan();let html='';
    if(at===1 && sceneTouched && state.mode==='drive'){
      html+=choice([14.8,26.4,34,32],false)+choice([51.2,26.4,34,32],true);
      html+=`<div class="design-radio" style="${box([42.5,28.2,3.7,2.5])}"></div><div class="design-radio on" style="${box([79.1,28.2,3.7,2.5])}">●</div>`;
    }
    if(at===7 && ui.prefsTouched){
      ['流行','独立','摇滚','电子','民谣','R&B','说唱','轻音乐'].forEach((g,i)=>html+=chip([19.2+(i%4)*15.8,38.1+Math.floor(i/4)*4.8,14.5,4],g,ui.genres.includes(g)));
    }
    if(at===8){
      if(routeTouched){html+=value([26.5,18.5,19,3],mockRoute.from,'','title')+value([62,18.5,19,3],mockRoute.to,'','title');}
      if(routeTouched || ui.minutes!==30)html+=value([18,47.1,48,4.4],`目标 ${ui.minutes} 分钟`,'路线图为示意，按目标时长编排','song');
      if(sceneryTouched)['山路','公路','山野','海岸'].forEach((s,i)=>html+=chip([18.3+i*12.2,57.2,11.9,4.2],s,s===ui.scenery));
      if(ui.densityTouched)html+=value([43,70.8,14,2],{calm:'舒缓',balanced:'适中',energetic:'提神'}[ui.vibe],'','center song');
      if(!ui.surprise)html+=switchView([70.8,77,10.5,3.8],false);
    }
    if(at===10){
      if(ui.minutes!==30)[10,20,30,45,60].forEach((n,i)=>html+=chip([18.8+i*12.6,76.8,11.8,4.2],`${n}分钟`,n===ui.minutes));
      if(indoorTouched && state.indoor!=='treadmill')['treadmill','gym','cycle','yoga'].forEach((s,i)=>{html+=choice([18.5+(i%2)*33,26.7+Math.floor(i/2)*23.7,31,22.5],state.indoor===s);html+=`<div class="design-radio${state.indoor===s?' on':''}" style="${box([45+(i%2)*33,28+Math.floor(i/2)*23.7,3.7,2.5])}">${state.indoor===s?'✓':''}</div>`;});
    }
    if(at===12){
      if(ui.minutes!==30)[15,30,45,60].forEach((n,i)=>html+=chip([16.5+i*17,56.8,16,4.7],`${n}分钟`,n===ui.minutes));
      if(training!==0)for(let i=0;i<4;i++){html+=choice([16.3+(i%2)*34.6,21.7+Math.floor(i/2)*16.4,33,14.7],training===i);html+=`<div class="design-radio${training===i?' on':''}" style="${box([44.5+(i%2)*34.6,23+Math.floor(i/2)*16.4,3.7,2.5])}">${training===i?'✓':''}</div>`;}
      if(ui.densityTouched)html+=value([44,69,12,2],{calm:'舒缓',balanced:'适中',energetic:'提神'}[ui.vibe],'','center song');
      if(!ui.surprise)html+=switchView([72.6,72.7,10,3.8],false);
    }
    const indoorPlan=p&&!['run','drive'].includes(p.request.scene);
    if(p && ((at===2 && !indoorPlan) || (at===11 && indoorPlan))){
      const indoor=at===11,done=Math.round(state.elapsed/state.duration*100),song=p.tracks[state.track];
      html+=value(indoor?[17,64.4,21,5]:[20,64,24,5],formatTime(state.elapsed),indoor?'已用时间':`已用时间 ${done}%`);
      html+=value(indoor?[70.6,64.4,13.5,5]:[66,64,14,5],formatTime(Math.max(0,state.duration-state.elapsed)),'剩余时间');
      html+=value(indoor?[27,49.5,47,3.8]:[20.5,85.2,59,4],song?.title||'',`${source(p)} · 示例音频`,'center song');
      if(indoor){
        html+=value([30,8.7,40,3.3],`${sceneNames[p.request.scene]} · ${state.goal}`,'','center title');
        html+=`<div class="design-progress" style="${box([16.5,70.3,67,1.1])}"><i style="width:${done}%"></i></div>`;
      }else html+=value([30,48.2,40,4.5],song?.stage||'稳定节奏','','center headline');
      const icon=state.playing?'<rect x="5" y="3" width="4" height="18" rx="1.5"/><rect x="15" y="3" width="4" height="18" rx="1.5"/>':'<path d="M6 3L21 12L6 21Z"/>';
      html+=`<div class="design-play-icon${indoor?' indoor':''}" style="${box(indoor?[46.5,86,7,4.5]:[47,75,6,4])}"><svg viewBox="0 0 24 24">${icon}</svg></div>`;
    }
    const selected=journey.selection(),selectedPlan=selected.plan;
    if(at===5 && selectedPlan){
      html+=value([10,41.5,70,4.3],`${selected.origin} → ${selected.destination}`,'','headline');
      html+=value([10,46.4,60,5],`${selectedPlan.request.minutes} 分钟 · ${source(selectedPlan)}`,selected.demo?'示例路线与示例音频':`实际进行 ${formatTime(selected.minutes*60)}，保存在本机`);
      html+=value([11.5,66.6,46,3],`原声带 · ${selectedPlan.tracks.length} 首`,'','title');
      selectedPlan.tracks.slice(0,3).forEach((t,i)=>html+=value([26.5,70.9+i*6.6,40,4.4],t.title,`${t.genre} · ${t.stage}`));
    }
    if(at===4 && (tabsTouched || journey.getRecords().length)){
      const list=visibleRecords();
      [['发现','all'],['附近','nearby'],['热门','popular'],['长途','long']].forEach(([label,tab],i)=>html+=value([18+i*18,15.5,14,4],label,'',`center tab${feedTab===tab?' active':''}`));
      [20.8,44.2,68.8].forEach((y,i)=>{const r=list[i];html+=value([28.5,y+1.2,40,5.7],r?`${r.origin} → ${r.destination}`:'暂无原声带',r?r.title:'切换分类或清空搜索');if(r)html+=value([18.5,y+16,42,3.8],`${r.plan?.request.minutes||r.request?.minutes||r.minutes} 分钟`,r.demo?'示例路线':'本机原声带');});
    }
    if(at===6 && (profileTouched || journey.getRecords().length)){
      const list=visibleRecords();
      const own=journey.getRecords(),favorites=journey.items('favorites');
      [own.length,favorites.length,own.filter(r=>r.visibility==='local').length,'—'].forEach((n,i)=>html+=value([18+i*16.5,26,14,7],n,['本机记录','已收藏','本机发布','联网喜欢'][i],'center'));
      [['我的路线','all'],['已收藏','favorites'],['分享','shared']].forEach(([label,tab],i)=>html+=value([19+i*23,34.5,20,4],label,'',`center tab${profileTab===tab?' active':''}`));
      for(let i=0;i<4;i++){const r=list[i];html+=value([20+(i%2)*33.2,40.7+Math.floor(i/2)*22.1,27,3.4],r?`${r.origin} → ${r.destination}`:'暂无原声带','','title');html+=value([20+(i%2)*33.2,55.2+Math.floor(i/2)*22.1,22,4.3],r?`${Math.round(r.minutes*10)/10} 分钟`:'—',r?.demo?'示例路线':r?'本机保存':'完成后可以保存');}
    }
    if(at===3 && (cardTouched || (!selected.demo && selected.plan))){
      html+=value([19.5,45.3,38,3.8],`${selected.origin} → ${selected.destination}`,'','title');
      html+=value([20,49,34,5],formatTime(selected.minutes*60),selected.demo?'示例路线时间':'本次实际进行时间');
    }
    if(at===9 && !selected.demo){
      html+=value([19,64.5,61,4.1],selected.title,'','song');
      html+=value([65,70,13,3.5],selected.visibility==='local'?'本机发现':'仅自己','','center song');
      html+=switchView([71.5,75,10.8,3.7],selected.visibility==='local');
      html+=switchView([71.5,80.9,10.8,3.7],selected.allowReuse);
    }
    if(p && at===13 && indoorPlan){
      html+=value([30,17.7,40,3.5],`${sceneNames[p.request.scene]||'运动'} · ${state.goal}`,'','center title');
      html+=value([27,42,7,3],'-','千卡','center');
      html+=value([45.5,42,12,3.5],formatTime(state.elapsed),'运动时长','center');
      const heard=p.tracks.slice(0,state.track).filter(t=>t.playDuration>0).length+(ai.getPosition().trackElapsed>0?1:0);
      html+=value([67,42,5,3.5],String(heard),'歌曲数','center');
    }
    if(transient){
      const title=transient==='generate'?(ui.deepseekConfigured?'DeepSeek 正在编排原声带':'正在编排原声带'):transient==='reuse'?'正在复用这段原声带':transient==='published'?'演示卡片已发布':'训练已保存';
      html+=`<div class="overlay" role="status"><div class="spinner">♫</div><h2>${title}</h2><p class="sub">${transient==='generate'?'根据场景、时长与音乐需求选择歌曲':'原设计稿演示流程'}</p></div>`;
    }
    return html;
  }
  function actionsForPage(){
    const common=[['下一页',()=>go(Math.min(13,at+1))],['返回上一页',()=>go(Math.max(0,at-1))]];
    if(at===0)return [['开始户外旅程',()=>go(1)],['开始室内运动',()=>go(10)],...common];
    if(at===2 || at===11)return [['查看 AI 歌单',playlist],['结束本次原声带',finish],...common];
    if(at===8 || at===12)return [['填写 AI 音乐需求',()=>ai.askRequest()],['调整目标时长',()=>ai.askGoal()],['查看当前设置',showRequest],...common];
    if(at===7)return [['填写 AI 音乐需求',()=>ai.askRequest()],['返回设置入口',()=>returnTo(prefsReturn)],...common];
    if(at===4 || at===6)return [['查看全部原声带',allRecords],['刷新本机记录',async()=>{await journey.refresh();render();}],['开始室内运动',()=>go(10)],...common];
    if(at===3 || at===13)return [['保存到本机',()=>persist(false)],['设置音乐偏好',preferences],...common];
    if(at===5)return [['查看完整歌单',async()=>{const r=journey.selection();try{const p=await journey.ensurePlan(r);alert(p.tracks.map((t,i)=>`${i+1}. ${t.title} · ${formatTime(t.playDuration)}`).join('\n'));}catch(error){announce(error.message);}}],['收藏或取消收藏',()=>{journey.toggleFavorite(journey.selection());announce('已更新收藏。');}],...common];
    return common;
  }
  let sideActions=[];
  function serviceUrl(){
    const configured=window.MotionScoreLocal?.url;
    return /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(configured||'')?configured+'/motion-score-html.html':'http://127.0.0.1:43821/motion-score-html.html';
  }
  render=function(){
    const page=pages[at],screen=document.querySelector('#screen');
    const art=`design-assets/hd-pages/${page.file}`;
    const controls=page.hits.map(h=>`<button class="design-hit" data-id="${h.id}" style="${box(h.rect)}" aria-label="${esc(h.label)}" title="${esc(h.label)}" onclick="MotionDesign.activate('${h.id}')"></button>`).join('');
    // Keep the image node mounted while progress changes, avoiding reload/flicker.
    const image=screen.querySelector('#design-art');
    if(!image || image.getAttribute('src')!==art){
      screen.innerHTML=`<div class="design-stage" data-page="${at+1}" style="aspect-ratio:${page.w}/${page.h}"><img class="design-art" id="design-art" src="${art}" width="${page.w}" height="${page.h}" alt="${esc(PAGES[at][0])}原始设计稿" draggable="false"><div class="design-live" id="design-live">${live()}</div><div id="design-controls">${controls}</div></div>`;
    }else{
      const slot=screen.querySelector('#design-live'),content=live();
      if(slot.innerHTML!==content)slot.innerHTML=content;
    }
    screen.classList?.add('design-ready');
    document.querySelector('#bar').style.width=((at+1)/14*100)+'%';
    document.querySelector('#steps').innerHTML=PAGES.map((x,i)=>`<button class="step ${i===at?'on':''}" onclick="go(${i})"><b>${String(i+1).padStart(2,'0')}</b>${esc(x[0])}</button>`).join('');
    sideActions=actionsForPage();
    const recovery=window.location?.protocol==='file:' || ai.getUIState().connectionError?`<a class="act" href="${esc(serviceUrl())}"><span>打开本地 AI 页面</span><b>↗</b></a>`:'';
    document.querySelector('#acts').innerHTML=recovery+sideActions.map(([label],i)=>`<button class="act" onclick="MotionDesign.sideAction(${i})"><span>${esc(label)}</span><b>→</b></button>`).join('');
    const description=document.querySelector('#actionDesc');
    if(description){
      const ui=ai.getUIState();
      description.textContent=message || ui.connectionError || (window.location?.protocol==='file:'?'这是直接打开的网页文件。AI 功能需要本地服务，请点击下方“打开本地 AI 页面”；如果打不开，先双击“启动本地版.cmd”。':(at===2 || at===11) && ai.getPlan()?`${source(ai.getPlan())} · 示例音频。点击歌单按钮查看结果。`:at===8 || at===12?(ui.connected?(ui.deepseekConfigured?'本地服务已连接，DeepSeek 已配置。点击原图中的开始按钮生成。':'本地服务已连接，未配置 DeepSeek，将使用本地规则。'):'正在检查 AI 服务连接…'):'点击设计图中原有按钮即可操作。');
    }
  };
  window.MotionDesign={
    pages,activate(id){const h=pages[at].hits.find(h=>h.id===id);if(h && !ai.getUIState().busy && !journey.getStatus().saving){message='';return h.action();}},
    sideAction(i){if(!ai.getUIState().busy && !journey.getStatus().saving){message='';return sideActions[i]?.[1]();}},
    announce(text){message=text;render();},getLive:live,getMessage:()=>message,
    onGenerated(){journey.reset();cardTouched=false;},onFinished(){journey.viewCurrent();cardTouched=false;},
    openRecord,reuse,persist,preferences,getVisibleRecords:visibleRecords,
    getRoute:()=>({origin:mockRoute.from,destination:mockRoute.to}),setRoute
  };
  // These locations belong to the original artwork; the map remains a demo.
  mockRoute.from='上海';mockRoute.to='厦门';
  render();
  journey.refresh().then(()=>render());
})();
