/* Local card persistence and demo discovery, independent of the player session. */
(() => {
  'use strict';
  const ai=window.MotionScoreAI;
  const seeds=[['上海','厦门',30,'drive'],['成都','丽江',45,'drive'],['北京','大理',60,'drive'],['杭州','西安',30,'drive']].map(([origin,destination,minutes,scene],i)=>({
    id:`demo-route-${i}`,title:`${origin} → ${destination}`,origin,destination,minutes,scene,demo:true,visibility:'local',allowReuse:true,
    request:{origin,destination,minutes,scene,genres:['流行'],vibe:'balanced',text:'沿途音乐平稳过渡',surprise:true}
  }));
  let records=[],selected=null,draft=null,pending=null,loaded=false,refreshError='';
  let favorites=[];
  try{favorites=JSON.parse(localStorage.getItem('motion-score-favorites')||'[]');if(!Array.isArray(favorites))favorites=[];}catch{}
  const clone=v=>JSON.parse(JSON.stringify(v));
  async function refresh(){
    try{const result=await ai.api('/api/community');records=result.items||[];loaded=true;refreshError='';return records;}
    catch(error){refreshError=error.message;window.MotionDesign?.announce(error.message);return records;}
  }
  function current(){
    const p=ai.getPlan();if(!p)return null;
    const epoch=ai.getSession().id;
    if(!draft || draft.epoch!==epoch)draft={epoch,title:p.intent.title||'我的移动原声带',visibility:'private',allowReuse:true};
    const geo=window.MotionMap?.snapshot();
    return {...draft,scene:p.request.scene,origin:p.request.origin,destination:p.request.destination,minutes:Math.round(state.elapsed/60*1000)/1000,request:clone(p.request),plan:clone(p),trackIds:p.tracks.map(t=>t.id),...(geo?{geo}: {})};
  }
  function viewCurrent(){selected=current();return selected;}
  function choose(record){selected=record;return record;}
  function selection(){return selected||seeds[0];}
  async function ensurePlan(record){
    if(record.plan)return record.plan;
    const request=record.request||{origin:record.origin,destination:record.destination,scene:record.scene,minutes:Math.max(5,record.minutes||30),genres:['流行'],surprise:true};
    record.plan=await ai.api('/api/playlist/preview',request);return record.plan;
  }
  function items(tab='all',query='',feed=false){
    let list=feed?[...records.filter(r=>r.visibility==='local'),...seeds]:[...records,...seeds];
    if(tab==='shared')list=list.filter(r=>r.visibility==='local');
    if(tab==='private')list=list.filter(r=>r.visibility==='private');
    if(tab==='favorites')list=list.filter(r=>favorites.includes(r.id));
    if(tab==='popular')list.sort((a,b)=>Number(favorites.includes(b.id))-Number(favorites.includes(a.id)));
    if(tab==='long')list=list.filter(r=>(r.plan?.request.minutes||r.request?.minutes||r.minutes)>=45);
    if(tab==='nearby')list=list.filter(r=>r.origin===mockRoute.from);
    if(query.trim())list=list.filter(r=>`${r.title} ${r.origin} ${r.destination}`.toLowerCase().includes(query.trim().toLowerCase()));
    return list;
  }
  async function save(record=selected||current(),visibility){
    if(pending)return pending;
    if(!record || record.demo){throw new Error('请先生成并完成自己的原声带，再保存或发布。');}
    const payload=clone(record);
    if(visibility)payload.visibility=visibility;
    delete payload.epoch;delete payload.request;
    pending=(async()=>{
      const saved=await ai.api('/api/community',payload);
      records=[saved,...records.filter(r=>r.id!==saved.id)];
      if(draft && (record.epoch===draft.epoch || (record.id && record.id===draft.id)))draft={...draft,id:saved.id,title:saved.title,visibility:saved.visibility,allowReuse:saved.allowReuse};
      selected=saved;return saved;
    })();
    try{return await pending;}finally{pending=null;}
  }
  window.MotionJourney={refresh,current,viewCurrent,choose,selection,ensurePlan,items,save,
    reset(){draft=null;selected=null;},getStatus:()=>({loaded,saving:!!pending,refreshError}),
    getSeeds:()=>seeds,
    setDraft(values){const c=selected||current();if(!c)return null;selected={...c,...values};if(draft && (c.epoch===draft.epoch || (c.id && c.id===draft.id)))draft={...draft,...values};return selected;},
    getRecords:()=>records,
    isFavorite:r=>favorites.includes(r.id),toggleFavorite(record){
      favorites=favorites.includes(record.id)?favorites.filter(id=>id!==record.id):[...favorites,record.id];
      try{localStorage.setItem('motion-score-favorites',JSON.stringify(favorites));}catch{window.MotionDesign?.announce('收藏暂存在本次页面中，浏览器不允许保存设置。');}
      return favorites.includes(record.id);
    }
  };
})();
