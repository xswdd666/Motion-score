const boards=[
['dark-revised.png','主流程 · 当前采用','首页 / 场景 / 播放 / 路线卡片','core','已选 B · 修订版'],
['secondary-muted.png','扩展页面 · 当前采用','发现 / 详情 / 收藏 / QQ 偏好 / 路线设置 / 发布','secondary','低饱和地图版'],
['indoor-fitness.png','无路线运动','运动选择 / 跑步机播放 / 健身设置 / 训练卡片','fitness','新增运动分支'],
['warm-contact.png','A · 暖白探索','首页 / 创建 / 播放 / 完成','history','历史方案'],
['dark-main.png','B · 初始探索','修订前的主流程视觉稿','history','历史方案'],
['secondary-original.png','扩展页面 · 初始版','地图降饱和前的六屏视觉稿','history','历史方案']
];
const nodes=[['首页','情境推荐入口',0],['场景选择','户外 / 驾车 / 室内',0],['QQ 音乐偏好','首次使用可进入',1],['行程或训练设置','路线、时长或训练类型',1],['播放陪伴','有路线 / 无路线两分支',0],['完成卡片','地图卡片 / 节奏卡片',0],['编辑并发布','标题、隐私与复用权限',1],['社区发现','浏览其他人的卡片',1],['卡片详情 → 复用','复用后返回设置页',1],['我的收藏','查看并再次播放',1]];
const grid=document.querySelector('#boardGrid'),box=document.querySelector('#lightbox'),pic=document.querySelector('#lightboxImage'),caption=document.querySelector('#lightboxCaption');
grid.innerHTML=boards.map((b,i)=>`<article class="board-card" data-filter="${b[3]}"><button style="all:unset;display:block;cursor:zoom-in;width:100%" data-board="${i}" aria-label="放大${b[1]}"><img src="design-assets/${b[0]}" alt="${b[1]}：${b[2]}" loading="lazy"><div class="board-meta"><h3>${b[1]}</h3><p>${b[2]}</p><span class="board-tag">${b[4]} · 点击放大</span></div></button></article>`).join('');
document.querySelector('#flowTrack').innerHTML=nodes.map((n,i)=>`<button class="flow-node" data-board="${n[2]}"><b>${String(i+1).padStart(2,'0')}</b><h3>${n[0]}</h3><p>${n[1]}</p></button>`).join('');
let previousFocus;
function openBoard(i){previousFocus=document.activeElement;const b=boards[i];pic.src='design-assets/'+b[0];caption.textContent=b[1]+' · '+b[2]+'（点击图片切换原尺寸）';box.classList.add('open');box.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';document.querySelector('#closeLightbox').focus()}
function close(){box.classList.remove('open');pic.classList.remove('zoomed');box.setAttribute('aria-hidden','true');document.body.style.overflow='';previousFocus?.focus()}
document.querySelectorAll('[data-board]').forEach(b=>b.onclick=()=>openBoard(Number(b.dataset.board)));
document.querySelector('#closeLightbox').onclick=close;box.onclick=e=>{if(e.target===box)close()};pic.onclick=()=>pic.classList.toggle('zoomed');document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('.board-card').forEach(c=>c.classList.toggle('hidden',btn.dataset.filter!=='all'&&c.dataset.filter!==btn.dataset.filter))});
document.querySelector('.stats').innerHTML='<span><b>6</b> 全部生成图</span><span><b>10</b> 流程节点</span><span><b>2</b> 运动分支</span>';
document.querySelector('.filters').insertAdjacentHTML('beforeend','<a class="filter" href="#gallery" id="history">历史方案见全部</a>');
box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','设计图预览');
