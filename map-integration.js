/* Real AMap base imagery + route planning + explicit, foreground GPS recording. */
(() => {
  'use strict';
  const ai=window.MotionScoreAI,j=window.MotionJourney,d=window.MotionDesign;
  const $=id=>document.querySelector('#'+id),widget=$('mobile-map-widget');
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fallback=[121.4737,31.2304];
  let configured=null,planned=null,plannedInput='',planning=false,planToken=0,status='',epoch=-1;
  let candidates=[],selected=0,attemptedKey='',pendingKey='',routePromise=null,focused=true;
  let session={route:null,track:null},watch=null,simulation=null,active=false,captureToken=0,segment=0,previousRaw=null,lastAttempt=0;
  let view={center:fallback,zoom:12},displayView=null,mapURL='',mountedPage=-1,mountedExpanded=false,follow=true;
  let conversion=Promise.resolve();
  const ready=ai.api('/api/map/config').then(result=>{configured=result.configured===true;renderMap();return configured;}).catch(error=>{configured=false;status=error.message;renderMap();return false;});
  ai.setPlaybackRate(1);
  function routeKey(){const r=d.getRoute();return JSON.stringify([r.origin,r.destination,state.mode]);}
  function syncSession(){
    const s=ai.getSession();
    if(s.id!==epoch){
      stop(false);epoch=s.id;segment=0;previousRaw=null;lastAttempt=0;
      const req=ai.getPlan()?.request;
      session={route:req && plannedInput===JSON.stringify([req.origin,req.destination,req.scene])?clone(planned):null,track:null};
      status='';follow=true;
    }
  }
  function contextGeo(){
    if(at===8)return {route:plannedInput===routeKey()?planned:null,track:null};
    if(at===5)return j.selection().geo||{route:null,track:null};
    if(at===3){const r=j.selection();return r.geo||(!r.demo && r.epoch===epoch?session:{route:null,track:null});}
    return session;
  }
  function canRecord(){return at===2 && !!ai.getPlan() && ['run','drive'].includes(ai.getPlan().request.scene) && !ai.getSession().finished && !ai.getSession().replay && !ai.getUIState().busy;}
  function unfinished(){return epoch===ai.getSession().id && !ai.getSession().finished && !ai.getSession().replay && (active || !!session.track?.points.length);}
  function meters(a,b){
    const rad=Math.PI/180,lat=(b[1]-a[1])*rad,lon=(b[0]-a[0])*rad;
    const h=Math.sin(lat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(lon/2)**2;
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function world([lng,lat],zoom){const size=256*2**zoom,s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return [(lng+180)/360*size,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*size];}
  function inverse([x,y],zoom){const size=256*2**zoom;return [x/size*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI];}
  function allPoints(geo=contextGeo()){return [...(geo.route?.path||[]),...(geo.track?.points||[]).map(p=>[p.lng,p.lat])];}
  function frame(){
    const canvas=$('geo-canvas'),width=canvas?.clientWidth,height=canvas?.clientHeight;
    // Fetch matching imagery rather than stretching the old landscape image in a tall panel.
    return {width:500,height:width>0 && height>0?Math.max(240,Math.min(800,Math.round(500*height/width))):320};
  }
  function fitView(points){
    if(!points.length)return {center:fallback,zoom:12};
    const p=points.map(x=>world(x,0)),xs=p.map(x=>x[0]),ys=p.map(x=>x[1]);
    const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    const size=frame(),inline=at===8 && window.MotionMobile.getState().panel!=='map';
    const top=inline?100:40,bottom=40;
    const zoom=Math.max(3,Math.min(17,Math.floor(Math.log2(Math.min((size.width-100)/Math.max(bounds[2]-bounds[0],.003),(size.height-top-bottom)/Math.max(bounds[3]-bounds[1],.003))))));
    // Leave room for floating controls and keep the route below the inline heading.
    return {center:inverse([(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2-(top-bottom)/2/2**zoom],0),zoom};
  }
  function focusPoints(){return contextGeo().route?.path||allPoints();}
  function fit(){follow=false;focused=true;view=fitView(focusPoints());paint();}
  function pathMarkup(points,color,extra=''){
    const center=world(displayView.center,displayView.zoom);
    const projected=points.map(p=>world(p,displayView.zoom)).map(([x,y])=>[x-center[0]+displayView.width/2,y-center[1]+displayView.height/2]);
    return `<polyline points="${projected.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" ${extra}/>`;
  }
  function draw(){
    if(!displayView){$('geo-lines').innerHTML='';return;}
    const geo=contextGeo(),points=geo.track?.points||[];
    let html=`<defs><linearGradient id="geo-route-color" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${displayView.width}" y2="${displayView.height}"><stop stop-color="#a4e632"/><stop offset=".5" stop-color="#ffbc5b"/><stop offset="1" stop-color="#f66f86"/></linearGradient></defs>`;
    if(at===8 && geo.route)candidates.forEach((route,i)=>{if(i!==selected)html+=pathMarkup(route.path,'#779bb1','class="geo-route-alternative" opacity=".7"');});
    if(geo.route){
      html+=pathMarkup(geo.route.path,'#183b4c','class="geo-route-halo" style="stroke-width:9"');
      html+=pathMarkup(geo.route.path,'url(#geo-route-color)','class="geo-route-selected"');
    }
    const groups=[];
    for(const p of points){const last=groups.at(-1);if(!last || last.segment!==p.segment)groups.push({segment:p.segment,points:[[p.lng,p.lat]]});else last.points.push([p.lng,p.lat]);}
    for(const group of groups)html+=pathMarkup(group.points,'#b8f536');
    const pins=points.length?[[points[0].lng,points[0].lat],[points.at(-1).lng,points.at(-1).lat]]:geo.route?[geo.route.path[0],geo.route.path.at(-1)]:[];
    const center=world(displayView.center,displayView.zoom);
    pins.forEach((p,i)=>{const [x,y]=world(p,displayView.zoom),cx=x-center[0]+displayView.width/2,cy=y-center[1]+displayView.height/2;html+=`<circle cx="${cx}" cy="${cy}" r="11" fill="${i?'#ff9366':'#b8f536'}" stroke="#183b4c" stroke-width="3"/><text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="12" font-weight="700" fill="#12252d">${i?'终':'起'}</text>`;});
    $('geo-lines').innerHTML=html;
  }
  function loadImage(){
    if(configured!==true){$('geo-map-error').hidden=false;$('geo-map-error').textContent=configured===null?'正在检查高德配置':'地图服务不可用，请检查本地配置';return;}
    const requested={...clone(view),...frame()},url=`/api/map/image?lng=${view.center[0].toFixed(6)}&lat=${view.center[1].toFixed(6)}&zoom=${view.zoom}&height=${requested.height}`;
    if(url===mapURL)return;
    mapURL=url;const image=$('geo-image');
    $('geo-map-error').hidden=false;$('geo-map-error').textContent='地图加载中…';
    image.onload=()=>{if(mapURL!==url)return;displayView=requested;$('geo-lines').setAttribute('viewBox',`0 0 ${requested.width} ${requested.height}`);image.hidden=false;$('geo-map-error').hidden=true;draw();};
    image.onerror=()=>{if(mapURL!==url)return;image.hidden=true;displayView=null;$('geo-lines').innerHTML='';$('geo-map-error').hidden=false;$('geo-map-error').textContent='底图加载失败，可点“重试底图”。';};
    image.src=url;
  }
  function paint(){
    if(!widget)return;
    const geo=contextGeo(),track=geo.track,points=track?.points||[];
    let length=0;for(let i=1;i<points.length;i++)if(points[i].segment===points[i-1].segment)length+=meters([points[i-1].lng,points[i-1].lat],[points[i].lng,points[i].lat]);
    $('geo-title').textContent=at===8?'高德路线规划':track?.mode==='demo'?'模拟运动轨迹 · 非真实运动':'运动轨迹';
    $('geo-plan').hidden=at!==8;$('geo-plan').disabled=planning||configured!==true;
    $('geo-plan').textContent=planning?'正在规划…':'规划路线';
    $('geo-expand').hidden=window.MotionMobile.getState().panel==='map';
    $('geo-stats').textContent=geo.route?`规划 ${(geo.route.distanceMeters/1000).toFixed(2)} km · 预计 ${Math.ceil(geo.route.durationSeconds/60)} 分钟；轨迹 ${(length/1000).toFixed(2)} km`:`轨迹 ${(length/1000).toFixed(2)} km · ${points.length} 个定位点`;
    const changed=at===8 && planned && plannedInput!==routeKey();
    const choices=$('geo-choices');
    choices.hidden=at!==8 || !geo.route;
    choices.innerHTML=at===8 && geo.route?candidates.map((r,i)=>`<button aria-pressed="${i===selected}" onclick="MotionMap.selectRoute(${i})"><strong>${candidates.length===1?'推荐路线':`路线 ${i+1}`}</strong><span>${(r.distanceMeters/1000).toFixed(2)} km · ${Math.ceil(r.durationSeconds/60)} 分钟</span></button>`).join(''):'';
    $('geo-status').textContent=at===8?(planning?'正在查询高德路线…':changed?'地点或场景已修改，请重新规划。':status|| (geo.route?`路线 ${(geo.route.distanceMeters/1000).toFixed(2)} km · 预计 ${Math.ceil(geo.route.durationSeconds/60)} 分钟（音乐时长单独设置）`:'点击“规划路线”，跑步使用步行路线，驾车使用驾车路线。')):track?.mode==='demo'?'模拟轨迹，仅用于调试，不是真实定位。':at===5?'已保存的运动轨迹；没有记录定位时不显示虚构轨迹。':status||'尚未记录轨迹；允许定位后开始记录。';
    if(at===8 && geo.route && !planning && !changed && !status)$('geo-status').textContent=`${candidates.length===1?'高德返回 1 条路线':`已选路线 ${selected+1} / ${candidates.length}`} · ${(geo.route.distanceMeters/1000).toFixed(2)} km · 预计 ${Math.ceil(geo.route.durationSeconds/60)} 分钟`;
    $('geo-track').hidden=!canRecord();$('geo-track').disabled=configured!==true;
    $('geo-track').textContent=track?.mode==='demo'?(active?'暂停模拟轨迹':'继续模拟轨迹'):active?'暂停记录轨迹':track?.points.length?'继续记录轨迹':'开始记录轨迹';
    $('geo-finish').hidden=!unfinished();$('geo-return').hidden=!unfinished() || at===2;
    $('geo-demo').hidden=!canRecord();$('geo-demo').disabled=active || (track?.mode==='gps' && points.length>0);
    $('geo-retry').hidden=false;
    loadImage();draw();
  }
  function renderMap(){
    syncSession();if(!widget)return;
    const expanded=window.MotionMobile.getState().panel==='map';
    const eligible=at===8 || at===2 || at===3 || at===5;
    $('mobile-map-summary').hidden=!eligible || at===8 || expanded;
    $('mobile-map-link').hidden=!eligible && !unfinished();
    const target=expanded?$('mobile-map-expanded'):at===8?$('screen').querySelector('.design-stage'):eligible?$('mobile-map-summary'):$('mobile-map-parking');
    if(target && widget.parentNode!==target)target.appendChild(widget);
    widget.className='geo-widget'+(at===8 && !expanded?' geo-inline':'');
    if(mountedPage!==at || mountedExpanded!==expanded){mountedPage=at;mountedExpanded=expanded;view=fitView(focusPoints());focused=true;follow=at===2;}
    if(eligible || expanded)paint();
    if(at===8 && configured===true && plannedInput!==routeKey() && attemptedKey!==routeKey())planRoute();
  }
  function planRoute(){
    if(at!==8)return Promise.resolve(false);
    const input=d.getRoute(),key=routeKey();
    if(planning && pendingKey===key)return routePromise;
    const token=++planToken;attemptedKey=key;pendingKey=key;
    planning=true;status='';paint();
    routePromise=(async()=>{try{
      const route=await ai.api('/api/map/route',{...input,mode:state.mode});
      if(at!==8 || token!==planToken || routeKey()!==key)return false;
      candidates=(route.alternatives?.length?route.alternatives:[route]).slice(0,3).map(r=>{const {alternatives,...clean}=r;return clean;});
      selected=0;planned=candidates[0];plannedInput=key;view=fitView(planned.path);follow=false;focused=true;return true;
    }catch(error){if(token===planToken && routeKey()===key)status=error.message;}
    finally{if(token===planToken){planning=false;paint();}}
    })();return routePromise;
  }
  function selectRoute(index){
    if(at!==8 || planning || plannedInput!==routeKey() || !Number.isInteger(index) || !candidates[index])return;
    selected=index;planned=candidates[index];status='';fit();
  }
  function stop(withMessage=true){
    captureToken++;active=false;
    if(watch!==null){navigator.geolocation?.clearWatch(watch);watch=null;}
    if(simulation!==null){clearInterval(simulation);simulation=null;}
    segment++;previousRaw=null;lastAttempt=0;
    if(withMessage)status='轨迹记录已暂停。继续记录会开启新一段，暂停期间不会连线。';
  }
  function accept(point){
    const track=session.track;
    if(track.points.length>=2400){stop(false);status='本次已达到 2400 个定位点，请结束并保存。';paint();return;}
    track.points.push(point);
    if(follow){const p=[point.lng,point.lat],a=world(view.center,view.zoom),b=world(p,view.zoom);if(Math.abs(a[0]-b[0])>150 || Math.abs(a[1]-b[1])>100 || track.points.length===1)view={center:p,zoom:16};}
    paint();
  }
  function startTracking(){
    syncSession();if(!canRecord() || active)return;
    if(session.track?.mode==='demo' && session.track.points.length){status='本次是模拟轨迹；真实定位请重新开始一次旅程。';paint();return;}
    if(configured!==true){status='高德服务尚未就绪，无法转换定位坐标。';paint();return;}
    if(!navigator.geolocation || window.isSecureContext===false){status='当前浏览器不支持定位，或网页未使用安全连接。电脑可用“模拟轨迹”调试。';paint();return;}
    session.track=session.track||{mode:'gps',coordinateSystem:'GCJ02',points:[]};
    active=true;follow=true;focused=false;const token=++captureToken;status='正在申请定位；请允许位置权限。';
    const onPosition=position=>{
      if(!active || token!==captureToken)return;
      const {longitude:lng,latitude:lat,accuracy}=position.coords,time=position.timestamp;
      if(![lng,lat,accuracy,time].every(Number.isFinite) || Math.abs(lng)>180 || Math.abs(lat)>85 || accuracy<0 || accuracy>80){status='定位精度不足，等待更准确的位置。';paint();return;}
      if(time-lastAttempt<5000)return;
      if(previousRaw){
        const seconds=(time-previousRaw.time)/1000,step=meters([previousRaw.lng,previousRaw.lat],[lng,lat]);
        if(seconds<=0 || step<Math.max(5,Math.min(25,(accuracy+previousRaw.accuracy)/2)) || step/seconds>(ai.getPlan().request.scene==='drive'?75:12))return;
      }
      lastAttempt=time;
      conversion=conversion.then(async()=>{
        if(!active || token!==captureToken)return;
        try{
          const result=await ai.api('/api/map/convert',{points:[[lng,lat]]});
          if(!active || token!==captureToken)return;
          const last=session.track.points.at(-1);if(last && time<=last.time)return;
          let actualSegment=segment;if(previousRaw && time-previousRaw.time>30000)actualSegment=++segment;
          const [x,y]=result.points[0];
          previousRaw={lng,lat,time,accuracy};status=`正在记录真实轨迹 · 定位精度约 ${Math.round(accuracy)} 米`;
          accept({lng:x,lat:y,time,accuracy,segment:actualSegment});
        }catch(error){if(active && token===captureToken){status=error.message+'；该定位点没有记入轨迹。';segment++;previousRaw=null;paint();}}
      });
    };
    const onError=error=>{if(token!==captureToken)return;stop(false);status=error.code===1?'定位被拒绝。请在浏览器设置中允许位置权限，然后重新开始记录。':error.code===3?'定位超时，请保持页面在前台并重试。':'当前位置暂时无法获取，请到信号较好的位置重试。';paint();};
    try{watch=navigator.geolocation.watchPosition(onPosition,onError,{enableHighAccuracy:true,maximumAge:0,timeout:20000});}
    catch{stop(false);status='当前浏览器没有提供定位权限，请换用支持定位的浏览器。';}
    paint();
  }
  function demo(){
    syncSession();if(!canRecord() || active || (session.track?.points.length && session.track.mode==='gps'))return;
    session.track=session.track?.mode==='demo'?session.track:{mode:'demo',coordinateSystem:'GCJ02',points:[]};active=true;follow=true;focused=false;
    const path=session.route?.path||[[121.4737,31.2304],[121.4742,31.2307],[121.4747,31.231],[121.4752,31.2308],[121.4756,31.2304],[121.4752,31.2301],[121.4745,31.2301],[121.4737,31.2304]];
    const points=path.length>60?Array.from({length:60},(_,i)=>path[Math.round(i*(path.length-1)/59)]):path;
    let index=session.track.points.length,time=Date.now()-index*1000;
    const step=()=>{if(index>=points.length){stop(false);status='模拟轨迹已完成，可结束原声带并保存。';paint();return;}
      const [lng,lat]=points[index];accept({lng,lat,time:time+index*1000,segment,accuracy:0});index++;};
    simulation=setInterval(step,1000);step();paint();
  }
  const onFinished=d.onFinished;
  d.onFinished=function(){stop(false);status='本次运动已结束，轨迹已停止记录。可以保存到本机。';onFinished();};
  window.MotionMap={ready,render:renderMap,
    beforeRender(next){if(mountedPage===8 && next!==8 && widget){$('mobile-map-parking').appendChild(widget);attemptedKey='';planToken++;planning=false;}},
    planRoute,selectRoute,fit,zoom(delta){follow=false;focused=false;view.zoom=Math.max(3,Math.min(17,view.zoom+delta));paint();},
    retryMap(){mapURL='';paint();},
    toggleTracking(){if(active){stop();paint();}else if(session.track?.mode==='demo')demo();else startTracking();},demo,
    finish(){if(unfinished())ai.finish();},returnToPlayer(){if(unfinished()){window.MotionMobile.close();go(2);}},
    snapshot(){syncSession();return ['run','drive'].includes(ai.getPlan()?.request.scene) && !ai.getSession().replay?clone(session):null;},
    isRecording:()=>active,hasUnfinishedTrack:unfinished,settle:()=>conversion,
    getState:()=>({configured,planning,active,selected,candidates:clone(candidates),session:clone(session),view:clone(view),displayView:displayView&&clone(displayView),status}),
    meters,world,fitView
  };
  const startOutdoor=generateOutdoor;
  generateOutdoor=async function(){
    if(at!==8)return startOutdoor();
    const key=routeKey();await ready;
    if(at!==8 || key!==routeKey())return;
    if(configured!==true){d.announce('地图服务尚未连接，请先检查配置并规划路线。');return;}
    if(plannedInput!==key)await planRoute();
    if(at!==8 || key!==routeKey())return;
    if(plannedInput!==key){d.announce(status||'路线未规划成功，请填写具体地点后重试。');return;}
    return startOutdoor();
  };
  function resizeMap(){if(at===8 || at===2 || at===3 || at===5 || window.MotionMobile.getState().panel==='map'){if(focused && !follow)view=fitView(focusPoints());paint();}}
  if(typeof ResizeObserver!=='undefined' && $('geo-canvas'))new ResizeObserver(resizeMap).observe($('geo-canvas'));
  window.addEventListener?.('resize',resizeMap);
  document.addEventListener?.('visibilitychange',()=>{if(active && document.visibilityState==='hidden'){stop(false);status='页面进入后台，轨迹记录已暂停。回到播放页后点击继续记录。';paint();}});
  window.addEventListener?.('pagehide',()=>stop(false));
  render();
})();
