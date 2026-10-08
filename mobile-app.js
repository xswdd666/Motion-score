/* Crop only the mockup chrome; artwork, live data and click targets share one scale. */
(() => {
  'use strict';
  const ai=window.MotionScoreAI,j=window.MotionJourney,design=window.MotionDesign;
  const originalDesignRender=render;
  const $=id=>document.querySelector('#'+id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // x, y, width, height in source pixels. Page 4 includes the overflowing card artwork.
  const crops=[
    [108,140,725,1300],[122,122,779,1318],[174,135,676,1270],
    [140,116,872,1292],[148,112,734,1280],[56,126,776,1594],
    [162,110,710,1250],[163,118,697,1316],[158,122,708,1318],
    [148,116,728,1332],[170,116,691,1244],[142,116,739,1344],
    [147,106,731,1214],[158,108,708,1206]
  ];
  let previousPage=at,panel='',tab='home',lastMessage='',recordDetail=false;
  function geometry(index,width){
    const [x,y,w,h]=crops[index],page=design.pages[index],scale=width/w;
    return {scale,left:-x*scale,top:-y*scale,width:page.w*scale,height:page.h*scale,contentHeight:h*scale,crop:[x,y,w,h]};
  }
  function layout(){
    const screen=$('screen'),stage=screen.querySelector('.design-stage');
    const width=$('mobile-content')?.clientWidth||screen.clientWidth||390;
    const g=geometry(at,width);
    const screenHeight=g.contentHeight+'px';
    if(screen.style.height!==screenHeight)screen.style.height=screenHeight;
    if(stage){
      const values={width:g.width+'px',height:g.height+'px',left:g.left+'px',top:g.top+'px'};
      for(const [property,value] of Object.entries(values))if(stage.style[property]!==value)stage.style[property]=value;
    }
    return g;
  }
  function panels(){
    if($('mobile-content'))$('mobile-content').inert=!!panel;
    for(const name of ['tools','records','route','map']){const node=$('mobile-'+name);if(node){node.hidden=panel!==name;node.open=panel===name;}}
    for(const button of $('mobile-nav')?.querySelectorAll('button')||[]){
      if(button.dataset.tab===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
  }
  function recordsMarkup(){
    const list=j.getRecords();
    if($('mobile-record-status'))$('mobile-record-status').textContent=j.getStatus().refreshError||'';
    $('mobile-record-list').innerHTML=list.length?list.map((r,i)=>`<button class="record-item" onclick="MotionMobile.openRecord(${i})"><strong>${esc(r.title)}${r.geo?.track?.mode==='demo'?' · 模拟轨迹':''}</strong><span>${esc(r.origin||'室内运动')} → ${esc(r.destination||r.scene)} · ${Number(r.minutes||0).toFixed(1)} 分钟 · ${r.visibility==='local'?'本机发现':'仅自己可见'}</span></button>`).join(''):'<p class="record-empty">还没有保存的记录<br>先开始一次旅程或运动，完成后点击保存。</p>';
  }
  function pause(){if(state.playing)togglePlay();}
  function navigate(next,nextTab){
    if(j.getStatus().saving){design.announce('正在保存，请稍候。');return;}
    panel='';recordDetail=false;tab=nextTab;go(next);panels();
  }
  function show(name){
    if(name!=='map')pause();panel=name;if(name==='records'){tab='records';recordsMarkup();}panels();
  }
  render=function(){
    window.MotionMap?.beforeRender(at);
    originalDesignRender();
    $('acts').innerHTML=$('acts').innerHTML.replace(/<button\b[^>]*><span>(?:下一页|返回上一页)<\/span><b>→<\/b><\/button>/g,'').replace(/\/motion-score-html\.html/g,'/mobile-app.html');
    if(previousPage!==at){
      panel='';if($('mobile-content'))$('mobile-content').scrollTop=0;
      tab=at===0?'home':at===4?'explore':at===6?'mine':[1,2,3,8,10,11,12,13].includes(at)?'home':tab;
      if(previousPage===5 && at===6 && recordDetail){panel='records';tab='records';recordsMarkup();}
      if(at!==5 && at!==9)recordDetail=false;
    }
    previousPage=at;
    layout();
    const busy=ai.getUIState().busy;
    const label=busy?'取消当前操作':at===0?'室内运动':at===2||at===11?'结束本次原声带':at===3||at===13?'保存到本机':at===5?'查看完整歌单':'返回首页';
    if($('mobile-primary'))$('mobile-primary').textContent=label;
    const message=design.getMessage();
    if(message!==lastMessage){lastMessage=message;if($('mobile-notice')){$('mobile-notice').textContent=message;$('mobile-notice').hidden=!message;}}
    if(window.location.protocol==='file:' || ai.getUIState().connectionError)panel='tools';
    panels();
    window.MotionMap?.render();
  };
  window.MotionMobile={
    home:()=>navigate(0,'home'),explore:()=>navigate(4,'explore'),mine:()=>navigate(6,'mine'),
    openMap(){if(window.MotionMap){show('map');window.MotionMap.render();}},
    editRoute(field){
      if(at!==8 || ai.getUIState().busy || j.getStatus().saving)return;
      const route=design.getRoute();
      $('mobile-origin').value=route.origin;$('mobile-destination').value=route.destination;$('mobile-route-error').textContent='';
      show('route');const input=$(field==='to'?'mobile-destination':'mobile-origin');input.focus();input.select();
    },
    saveRoute(event){
      event?.preventDefault();
      if(at!==8 || panel!=='route' || ai.getUIState().busy || j.getStatus().saving)return false;
      try{
        design.setRoute($('mobile-origin').value,$('mobile-destination').value);
        panel='';panels();
      }catch(error){$('mobile-route-error').textContent=error.message;}
      return false;
    },
    records(){if(j.getStatus().saving){design.announce('正在保存，请稍候。');return;}if(ai.getUIState().busy)go(0);show('records');},
    tools(){show('tools');},close(){const wasRecords=panel==='records';panel='';if(wasRecords && at!==5)tab=at===4?'explore':at===6?'mine':'home';panels();window.MotionMap?.render();},
    async refresh(){try{await j.refresh();recordsMarkup();}catch(error){design.announce(error.message);}},
    async openRecord(index){const record=j.getRecords()[index];if(!record)return;panel='';recordDetail=true;await design.openRecord(record,6);if(at===5)tab='records';panels();},
    primary(){
      if(ai.getUIState().busy){navigate(0,'home');return;}
      if(at===0){go(10);return;}
      if(at===2||at===11){ai.finish();return;}
      if(at===3||at===13)return design.persist(false);
      if(at===5)return design.sideAction(0);
      navigate(0,'home');
    },
    activate:id=>design.activate(id),extra:index=>design.sideAction(index),geometry,layout,
    getState:()=>({page:at,panel,tab})
  };
  if(typeof ResizeObserver!=='undefined' && $('mobile-content'))new ResizeObserver(layout).observe($('mobile-content'));
  window.addEventListener?.('resize',layout);
  window.addEventListener?.('keydown',event=>{if(event.key==='Escape' && panel)window.MotionMobile.close();});
  render();
  document.querySelector('.mobile-viewer')?.classList.add('mobile-ready');
})();
