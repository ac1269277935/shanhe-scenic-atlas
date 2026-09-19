(() => {
  const root=document.getElementById('china-five-a-map');
  const $=id=>root.querySelector('#'+id);
  const data=JSON.parse(document.getElementById('c5a-data').textContent);
  const geo=JSON.parse(document.getElementById('c5a-geo').textContent);
  const types=['山岳地貌','水域生态','历史文化','古城乡村','红色纪念','主题休闲'];
  const shapes=[d3.symbolTriangle,d3.symbolCircle,d3.symbolSquare,d3.symbolDiamond,d3.symbolStar,d3.symbolCross];
  const color=i=>`var(--viz-series-${i+1})`;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectProvince=$('c5a-province'),selectBatch=$('c5a-batch'),selectType=$('c5a-type'),search=$('c5a-search'),selectPlace=$('c5a-place'),markSegments=$('c5a-mark-filter'),quickMark=$('c5a-quick-mark');
  let markScope='',motionOverride=null;
  const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
  try{const value=JSON.parse(localStorage.getItem('china-5a-map:prefs:v1'));if(typeof value?.motion==='boolean')motionOverride=value.motion;}catch(e){}
  let motion=motionOverride??!motionMedia.matches;
  function animateNode(el,keyframes,duration=260){if(motion&&el){el.getAnimations().forEach(a=>a.cancel());return el.animate(keyframes,{duration,easing:'cubic-bezier(.22,1,.36,1)'});}}
  function syncMotion(){root.dataset.motion=motion?'on':'off';$('c5a-motion').setAttribute('aria-pressed',String(motion));$('c5a-motion').textContent=motion?'动效已开启':'动效已关闭';}
  syncMotion();
  const storageKey='china-5a-map:marks:v1',knownIds=new Set(data.map(d=>d.id));
  let marked=new Set(),storageAvailable=true;
  const feedback=$('c5a-mark-feedback');
  function decodeStored(raw){
    if(raw===null)return new Set();
    const value=JSON.parse(raw);
    if(value.version!==1||!Array.isArray(value.ids))throw new Error('不兼容的标记数据');
    return new Set(value.ids.filter(id=>knownIds.has(id)));
  }
  try{marked=decodeStored(localStorage.getItem(storageKey));}
  catch(e){storageAvailable=false;}
  function storageStatus(){
    $('c5a-storage-status').textContent=storageAvailable?'标记自动保存在当前浏览器中，关闭后重新打开仍可使用。':'当前环境无法读写浏览器存储，标记暂存于本次页面；请导出备份以便下次导入。';
  }
  function readLatestMarks(){
    if(!storageAvailable)return;
    try{marked=decodeStored(localStorage.getItem(storageKey));}catch(e){storageAvailable=false;storageStatus();}
  }
  function saveMarks(){
    if(storageAvailable){
      try{localStorage.setItem(storageKey,JSON.stringify({version:1,ids:[...marked],updatedAt:new Date().toISOString()}));}
      catch(e){storageAvailable=false;}
    }
    storageStatus();
  }
  storageStatus();
  const svg=d3.select($('c5a-svg'));
  const simpleName=n=>(n||'').replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市/g,'');
  const provinces=[...new Set(data.flatMap(d=>d.provinces))];
  provinces.forEach(p=>selectProvince.add(new Option(p,p)));
  const batches=[...new Set(data.map(d=>d.batch))].sort().reverse();
  batches.forEach(b=>selectBatch.add(new Option(b+(b==='2007-05-08'?' · 首批':''),b)));
  types.forEach((t,i)=>selectType.add(new Option(t,String(i))));
  types.forEach((t,i)=>{
    const span=document.createElement('button');span.type='button';span.className='legend-item';span.dataset.type=String(i);span.setAttribute('aria-pressed','false');span.setAttribute('aria-label','筛选'+t);
    span.innerHTML=`<svg class="dot-key" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${d3.symbol().type(shapes[i]).size(62)()}" fill="${color(i)}"></path></svg><span>${t}</span>`;
    $('c5a-legend').appendChild(span);
    span.addEventListener('click',()=>{selectType.value=selectType.value===String(i)?'':String(i);applyFilters(true);});
  });
  const markLegend=document.createElement('button');markLegend.type='button';markLegend.className='legend-item';markLegend.setAttribute('aria-pressed','false');markLegend.setAttribute('aria-label','只看已手动标记的景区');
  markLegend.innerHTML='<svg class="dot-key" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="6" fill="none" stroke="var(--atlas-mark)" stroke-width="1.7"></circle></svg><span>已手动标记</span>';
  $('c5a-legend').appendChild(markLegend);
  markLegend.addEventListener('click',()=>{markScope=markScope==='marked'?'':'marked';applyFilters(true);});
  const allMain={type:'FeatureCollection',features:geo.features.map(f=>{
    const p=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];
    return {...f,geometry:{type:'MultiPolygon',coordinates:p.filter(q=>d3.mean(q[0],p=>p[1])>=17.5)}};
  }).filter(f=>f.geometry.coordinates.length)};
  const south={type:'FeatureCollection',features:geo.features.map(f=>{
    const p=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];
    return {...f,geometry:{type:'MultiPolygon',coordinates:p.filter(q=>d3.mean(q[0],p=>p[1])<22&&d3.mean(q[0],p=>p[0])>105)}};
  }).filter(f=>f.geometry.coordinates.length)};
  let current=data.find(d=>d.id==='009'),filtered=data,projection,w,h,points=[],zoomState=d3.zoomIdentity;
  let mapGroup,markGroup,bookmarkGroup,labelGroup,selectedGroup,inset,zoom,depthLayer,shadowLayer,shownProvince='',detailId=null;
  let undoAction=null,toastTimer,suggestions=[],suggestionIndex=-1,cameraSequence=0;
  const note=$('c5a-hover');
  function details(d){
    const position=d?filtered.findIndex(item=>item.id===d.id):-1;
    $('c5a-place-position').textContent=(position+1)+' / '+filtered.length;
    $('c5a-prev').disabled=position<=0;$('c5a-next').disabled=position<0||position>=filtered.length-1;$('c5a-locate').disabled=!d;
    $('c5a-mobile-detail').disabled=!d;$('c5a-mobile-detail').textContent=d?'查看 '+d.short+' 的景区档案 ↓':'暂无符合条件的景区';
    if(!d){detailId=null;$('c5a-detail').innerHTML='<div class="empty">没有符合条件的景区。<br>试试移除部分条件，或重新探索全国。<br><button class="atlas-button" type="button" id="c5a-empty-clear">清空筛选，重新探索</button></div>';$('c5a-empty-clear').addEventListener('click',clearFilters);return;}
    const typ=types[d.type],parts=d.parts?`<p class="detail-note">组成记录：${esc(d.parts)}</p>`:'';
    $('c5a-detail').innerHTML=`<div class="destination-kicker"><span class="type-label"><svg class="dot-key" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${d3.symbol().type(shapes[d.type]).size(62)()}" fill="${color(d.type)}"></path></svg>${typ}</span><span class="destination-number">NO. ${esc(d.id)}</span></div><div class="detail-heading"><h3>${esc(d.name)}</h3></div><div class="destination-location">${esc(d.provinces.join(' / '))} · 中国</div><dl class="metadata"><div><dt>入选批次</dt><dd>${esc(d.batch)} ${d.batch==='2007-05-08'?'<span class="first-batch">首批</span>':''}</dd></div><div><dt>官方评定年度</dt><dd>${esc(d.year)} <small>年</small></dd></div></dl><div class="intro-heading">一景一故事 / ABOUT</div><p class="detail-intro">${esc(d.intro)}</p>${d.note?`<p class="detail-note">${esc(d.note)}</p>`:''}${parts}<button type="button" class="atlas-button bookmark-button" id="c5a-toggle-mark" aria-pressed="${marked.has(d.id)}">${marked.has(d.id)?'✓ 已标记 · 点击取消':'＋ 标记此景区'}</button><div class="detail-source-links"><a target="_blank" rel="noopener noreferrer" href="${esc(d.introSource)}">官方景区介绍 ↗</a><a target="_blank" rel="noopener noreferrer" href="${esc(d.batchSource)}" aria-label="批次来源：${esc(d.batchStatus)}">批次来源 ↗</a><a target="_blank" rel="noopener noreferrer" href="${esc(d.coordinateSource)}" data-tooltip="${esc(d.coordinateNote)}">点位来源 ↗</a></div>`;
    $('c5a-toggle-mark').addEventListener('click',()=>{toggleMark(d);($('c5a-toggle-mark')||markSegments.querySelector('[aria-pressed=true]')).focus({preventScroll:true});});
    if(detailId&&detailId!==d.id)animateNode($('c5a-detail'),[{opacity:.35,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],320);
    detailId=d.id;
  }
  function toggleMark(d){
    readLatestMarks();
    const wasMarked=marked.has(d.id);
    if(wasMarked)marked.delete(d.id);else marked.add(d.id);
    saveMarks();applyFilters(true);
    feedback.textContent=(wasMarked?'已取消标记：':'已标记：')+d.name+(storageAvailable?' · 已自动保存':' · 请导出备份保存');
    undoAction={id:d.id,wasMarked};showToast((wasMarked?'已取消标记 · ':'已标记 · ')+d.short,true);
    pulseSelection();animateNode($('c5a-toggle-mark'),[{transform:'scale(.97)'},{transform:'scale(1.025)'},{transform:'scale(1)'}],360);
  }
  function showSelection(d){current=d;selectPlace.value=d?d.id:'';details(d);drawSelected();pulseSelection();}
  function pulseSelection(){
    if(!motion||!current||!selectedGroup)return;
    const [x,y]=coords(current);if(!visible(x,y))return;
    const ring=selectedGroup.append('circle').attr('cx',x).attr('cy',y).attr('r',12).attr('fill','none').attr('stroke','var(--atlas-mark)').attr('stroke-width',2).attr('opacity',.65);
    ring.transition('pulse').duration(650).ease(d3.easeCubicOut).attr('r',30).attr('opacity',0).remove();
  }
  function showToast(message,canUndo=false){
    clearTimeout(toastTimer);const toast=$('c5a-toast');toast.hidden=false;$('c5a-toast-message').textContent=message;$('c5a-undo').hidden=!canUndo;
    toastTimer=setTimeout(()=>{if(!toast.contains(document.activeElement))toast.hidden=true;},6500);
  }
  function undoMark(){
    if(!undoAction)return;readLatestMarks();const d=data.find(v=>v.id===undoAction.id);
    if(undoAction.wasMarked)marked.add(undoAction.id);else marked.delete(undoAction.id);
    saveMarks();current=d;undoAction=null;applyFilters(true);feedback.textContent='已撤销刚才的标记操作。';showToast('已撤销 · '+d.short);pulseSelection();
  }
  function clearFilters(){selectProvince.value='';selectBatch.value='';selectType.value='';markScope='';search.value='';hideSuggestions();applyFilters();}
  function updateFilterUI(){
    const scopes=['','marked','unmarked'],counts=[data.length,marked.size,data.length-marked.size];
    markSegments.querySelector('.segment-indicator').style.transform=`translateX(${scopes.indexOf(markScope)*100}%)`;
    markSegments.querySelectorAll('button').forEach((b,i)=>{b.setAttribute('aria-pressed',String(b.dataset.markScope===markScope));b.querySelector('span').textContent=counts[i];});
    $('c5a-filter-count').textContent=filtered.length+' 处风景'+(filtered.length?'待探索':'符合当前筛选');
    $('c5a-search-clear').hidden=!search.value;
    const chips=$('c5a-filter-chips');chips.replaceChildren();
    const entries=[[selectProvince,'省区'],[selectBatch,'批次'],[selectType,'类型'],[search,'搜索']];
    for(const [field,label] of entries){if(field.value!==''){const b=document.createElement('button');b.type='button';b.className='filter-chip';const value=field===selectType?types[+field.value]:field.value;b.textContent=label+'：'+value+' ×';b.setAttribute('aria-label','移除'+label+'筛选：'+value);b.addEventListener('click',()=>{field.value='';hideSuggestions();applyFilters(field!==selectProvince);});chips.appendChild(b);}}
    if(markScope){const b=document.createElement('button');b.type='button';b.className='filter-chip';b.textContent=(markScope==='marked'?'已标记':'未标记')+' ×';b.setAttribute('aria-label','移除标记筛选');b.addEventListener('click',()=>{markScope='';applyFilters(true);});chips.appendChild(b);}
    chips.hidden=!chips.childElementCount;
    $('c5a-legend').classList.toggle('is-filtered',selectType.value!=='');
    $('c5a-legend').querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===selectType.value)));
    markLegend.setAttribute('aria-pressed',String(markScope==='marked'));
  }
  function hideSuggestions(){$('c5a-search-results').hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');suggestionIndex=-1;}
  function highlightName(name){const query=search.value.trim(),start=name.toLowerCase().indexOf(query.toLowerCase());return start<0?esc(name):esc(name.slice(0,start))+'<mark>'+esc(name.slice(start,start+query.length))+'</mark>'+esc(name.slice(start+query.length));}
  function suggest(){
    const box=$('c5a-search-results');if(!search.value.trim()||document.activeElement!==search){hideSuggestions();return;}
    suggestions=filtered.slice(0,6);suggestionIndex=-1;box.innerHTML=suggestions.map((d,i)=>`<div class="search-result" role="option" id="c5a-result-${i}" data-result-index="${i}" aria-selected="false"><svg class="dot-key" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${d3.symbol().type(shapes[d.type]).size(62)()}" fill="${color(d.type)}"></path></svg><div>${highlightName(d.name)}<small>${esc(d.provinces.join(' / '))} · ${types[d.type]} · ${esc(d.batch)}</small></div></div>`).join('')+`<div class="search-tip">${suggestions.length?'↑ ↓ 选择 · Enter 定位'+(filtered.length>6?' · 共 '+filtered.length+' 个匹配':''):'没有找到匹配项，试试更短的名称或减少筛选条件。'}</div>`;
    box.hidden=false;search.setAttribute('aria-expanded','true');search.removeAttribute('aria-activedescendant');
  }
  function chooseSuggestion(index){const d=suggestions[index];if(!d)return;hideSuggestions();search.blur();showSelection(d);focusCurrent();}
  function coords(d){const xy=projection([d.lon,d.lat]);return zoomState.apply(xy);}
  function visible(x,y){return x>5&&x<w-5&&y>5&&y<h-5;}
  function renderMarks(animate=false){
    if(!projection)return;
    points=filtered.map(d=>{const [x,y]=coords(d);return {...d,x,y};}).filter(d=>visible(d.x,d.y));
    const dots=markGroup.selectAll('path').data(points,d=>d.id);
    dots.exit().remove();
    const entered=dots.enter().append('path');
    entered.merge(dots).attr('class','mark').attr('d',d=>d3.symbol().type(shapes[d.type]).size(w<450?32:46)()).attr('transform',d=>`translate(${d.x},${d.y})`).attr('fill',d=>color(d.type)).attr('data-id',d=>d.id).attr('data-marked',d=>String(marked.has(d.id))).attr('aria-label',d=>`${d.name} · ${d.batch} · ${types[d.type]} · ${marked.has(d.id)?'已标记':'未标记'}`);
    if(animate&&motion)entered.attr('opacity',0).attr('transform',d=>`translate(${d.x},${d.y}) scale(.3)`).transition('appear').duration(300).delay((d,i)=>Math.min(i*4,80)).ease(d3.easeCubicOut).attr('opacity',1).attr('transform',d=>`translate(${d.x},${d.y}) scale(1)`);
    else markGroup.selectAll('path').interrupt('appear').attr('opacity',1);
    bookmarkGroup.selectAll('circle').data(points.filter(d=>marked.has(d.id)),d=>d.id).join('circle').attr('class','bookmark-ring').attr('data-id',d=>d.id).attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',7).attr('fill','none').attr('stroke','var(--foreground)').attr('stroke-width',1.7);
    labelGroup.selectAll('*').remove();
    if((selectProvince.value||zoomState.k>2.1)&&root.dataset.camera!=='moving'){
      const boxes=[];
      for(const d of points){
        if(d.id===current?.id)continue;
        const label=d.short.length>14?d.short.slice(0,13)+'…':d.short;
        const tw=label.length*12,bx=d.x+7,by=d.y+4;
        const box=[bx,by-12,bx+tw,by+2];
        if(box[2]>w-8||box[1]<20||boxes.some(b=>!(box[2]+4<b[0]||box[0]>b[2]+4||box[3]+3<b[1]||box[1]>b[3]+3)))continue;
        boxes.push(box);labelGroup.append('text').attr('x',bx).attr('y',by).text(label).attr('paint-order','stroke').attr('stroke','var(--background)').attr('stroke-width',3).attr('stroke-linejoin','round');
      }
    }
    drawSelected();
  }
  function drawSelected(){
    if(!selectedGroup)return;selectedGroup.selectAll('*').remove();
    if(!current)return;
    const [x,y]=coords(current);if(!visible(x,y))return;
    selectedGroup.append('circle').attr('cx',x).attr('cy',y).attr('r',14).attr('fill','none').attr('stroke','var(--atlas-brand)').attr('stroke-width',5).attr('opacity',.12);
    selectedGroup.append('circle').attr('cx',x).attr('cy',y).attr('r',11).attr('fill','none').attr('stroke','var(--atlas-brand)').attr('stroke-width',1.3);
    const name=current.short.length>18?current.short.slice(0,17)+'…':current.short;
    const label=(marked.has(current.id)?'✓ ':'')+name+' · '+(current.batch.includes('年')?current.year:current.batch);
    const tx=selectedGroup.append('text').text(label);
    while(tx.node().getComputedTextLength()>w-52&&tx.text().length>4)tx.text(tx.text().slice(0,-2)+'…');
    const width=tx.node().getComputedTextLength()+24,lx=Math.max(10,Math.min(w-width-10,x-width/2)),ly=y>58?y-48:y+22;
    selectedGroup.insert('rect','text').attr('x',lx).attr('y',ly).attr('width',width).attr('height',31).attr('rx',7).attr('fill','var(--popover)').attr('stroke','var(--atlas-line)');
    tx.attr('x',lx+12).attr('y',ly+20);
  }
  function render(){
    svg.interrupt('camera');
    w=Math.max(280,$('c5a-svg').parentElement.clientWidth);h=Math.max(300,Math.min(610,w*.75));svg.attr('viewBox',`0 0 ${w} ${h}`).attr('height',h);
    svg.selectAll('*').remove();
    const defs=svg.append('defs');
    defs.append('clipPath').attr('id','c5a-map-clip').append('rect').attr('x',1).attr('y',1).attr('width',w-2).attr('height',h-2);
    const gradient=defs.append('linearGradient').attr('id','c5a-land-gradient').attr('x1','15%').attr('y1','0%').attr('x2','85%').attr('y2','100%');
    gradient.append('stop').attr('offset','0%').attr('stop-color','var(--atlas-land-top)');gradient.append('stop').attr('offset','100%').attr('stop-color','var(--atlas-land-bottom)');
    const content=svg.append('g').attr('clip-path','url(#c5a-map-clip)');mapGroup=content.append('g');markGroup=content.append('g');bookmarkGroup=content.append('g').attr('pointer-events','none');labelGroup=content.append('g').attr('pointer-events','none');selectedGroup=content.append('g').attr('pointer-events','none');
    const prov=selectProvince.value==='兵团'?'新疆':selectProvince.value;
    projection=d3.geoConicConformal().parallels([25,47]).rotate([-105,0]).center([0,35]).fitExtent([[w<450?14:36,28],[w-(w<450?14:36),h-32]],allMain);
    const path=d3.geoPath(projection);
    mapGroup.append('path').datum(d3.geoGraticule().extent([[72,15],[138,56]]).step([10,10])()).attr('class','graticule').attr('d',path);
    shadowLayer=mapGroup.append('path').datum(allMain).attr('class','land-shadow').attr('d',path);
    depthLayer=mapGroup.append('path').datum(allMain).attr('class','land-depth').attr('d',path);
    mapGroup.selectAll('path.province').data(allMain.features).join('path').attr('class',f=>'province'+(prov&&simpleName(f.properties.name)===prov?' active':'')).attr('d',path);
    if(w>=500){
      mapGroup.selectAll('text').data(allMain.features.filter(f=>f.properties.center&&!['北京','天津','上海','香港','澳门'].includes(simpleName(f.properties.name)))).join('text').attr('transform',f=>`translate(${projection(f.properties.centroid||f.properties.center)})`).attr('text-anchor','middle').attr('opacity',.55).text(f=>simpleName(f.properties.name));
    }
    inset=svg.append('g').attr('pointer-events','none');
    {
      const iw=w<450?62:88,ih=w<450?91:125,ix=w-iw-12,iy=h-ih-12;
      inset.append('rect').attr('x',ix).attr('y',iy).attr('width',iw).attr('height',ih).attr('rx',8).attr('fill','var(--background)').attr('stroke','var(--atlas-line)');
      const sp=d3.geoMercator().fitExtent([[ix+7,iy+7],[ix+iw-7,iy+ih-23]],south);
      inset.selectAll('path').data(south.features).join('path').attr('d',d3.geoPath(sp)).attr('fill','var(--muted)').attr('stroke','var(--border)').attr('stroke-width',.8);
      inset.append('text').attr('x',ix+iw/2).attr('y',iy+ih-8).attr('text-anchor','middle').text('南海诸岛');
    }
    zoomState=d3.zoomIdentity;
    zoom=d3.zoom().scaleExtent([1,120]).extent([[0,0],[w,h]]).filter(e=>(!e.button)&&(e.type!=='wheel'||e.ctrlKey)).on('start',e=>{if(e.sourceEvent){svg.interrupt('camera');note.style.display='none';}}).on('zoom',e=>{
      zoomState=e.transform;mapGroup.attr('transform',zoomState);depthLayer.attr('transform',`translate(0,${4/zoomState.k})`);shadowLayer.attr('transform',`translate(${2/zoomState.k},${8/zoomState.k})`);
      mapGroup.selectAll('text').attr('font-size',12/zoomState.k).attr('opacity',zoomState.k>1.8?0:.55);renderMarks();inset.attr('display',zoomState.k>1.01?'none':null);
      $('c5a-zoom-level').textContent=zoomState.k.toFixed(1)+'×';$('c5a-minus').disabled=zoomState.k<=1.001;$('c5a-plus').disabled=zoomState.k>=119.99;
    });
    svg.call(zoom).call(zoom.transform,d3.zoomIdentity).on('dblclick.zoom',null);
    svg.on('pointermove',e=>{
      if(e.buttons)return;
      const [mx,my]=d3.pointer(e),d=nearest(mx,my);
      if(d){note.innerHTML='<strong>'+esc(d.name)+'</strong><span>'+esc(d.batch)+' · '+types[d.type]+' · '+(marked.has(d.id)?'✓ 已标记':'未标记')+'</span>';note.style.display='block';svg.style('cursor',quickMark.checked?'crosshair':'pointer');}else{note.style.display='none';svg.style('cursor','grab');}
    }).on('pointerleave',()=>note.style.display='none').on('click',e=>{if(e.defaultPrevented)return;const p=d3.pointer(e),hit=e.target.closest('path.mark'),d=hit?points.find(v=>v.id===hit.dataset.id):nearest(...p);if(d){showSelection(data.find(v=>v.id===d.id));if(quickMark.checked)toggleMark(current);}});
    shownProvince=selectProvince.value;focusProvince(false);
  }
  function moveCamera(target,animated=true){
    svg.interrupt('camera');const sequence=++cameraSequence;
    const finish=()=>{if(sequence===cameraSequence){root.dataset.camera='idle';renderMarks();pulseSelection();}};
    if(motion&&animated){root.dataset.camera='moving';svg.transition('camera').duration(540).ease(d3.easeCubicInOut).call(zoom.transform,target).on('end.atlas',finish).on('interrupt.atlas',()=>{if(sequence===cameraSequence)root.dataset.camera='idle';});}
    else{svg.call(zoom.transform,target);finish();}
  }
  function provinceTransform(){
    const p=selectProvince.value==='兵团'?'新疆':selectProvince.value;if(!p)return d3.zoomIdentity;
    const focus={type:'FeatureCollection',features:allMain.features.filter(f=>simpleName(f.properties.name)===p)};if(!focus.features.length)return d3.zoomIdentity;
    const [[x0,y0],[x1,y1]]=d3.geoPath(projection).bounds(focus),scale=Math.min(120,.85/Math.max((x1-x0)/w,(y1-y0)/h));
    return d3.zoomIdentity.translate(w/2,h/2).scale(Math.max(1,scale)).translate(-(x0+x1)/2,-(y0+y1)/2);
  }
  function focusProvince(animated=true){
    const p=selectProvince.value==='兵团'?'新疆':selectProvince.value;
    mapGroup.selectAll('path.province').classed('active',f=>Boolean(p&&simpleName(f.properties.name)===p));
    moveCamera(provinceTransform(),animated);
  }
  function focusCurrent(){if(!current)return;const [x,y]=projection([current.lon,current.lat]),scale=Math.min(120,Math.max(zoomState.k,5));moveCamera(d3.zoomIdentity.translate(w/2,h/2).scale(scale).translate(-x,-y));}
  function zoomBy(factor){const scale=Math.max(1,Math.min(120,zoomState.k*factor)),[x,y]=zoomState.invert([w/2,h/2]);moveCamera(d3.zoomIdentity.translate(w/2,h/2).scale(scale).translate(-x,-y));}
  function nearest(x,y){let answer=null,best=24*24;for(const d of points){const n=(d.x-x)**2+(d.y-y)**2;if(n<best){answer=d;best=n;}}return answer;}
  function applyFilters(preserveView=false){
    const q=search.value.trim().toLowerCase(),p=selectProvince.value,b=selectBatch.value,t=selectType.value,m=markScope;
    filtered=data.filter(d=>(!p||d.provinces.includes(p)||p==='新疆'&&d.provinces.includes('兵团'))&&(!b||d.batch===b)&&(t===''||d.type===+t)&&(!q||(d.name+d.short+d.provinces.join('')).toLowerCase().includes(q))&&(m===''||(m==='marked'?marked.has(d.id):!marked.has(d.id))));
    selectPlace.replaceChildren();filtered.forEach(d=>selectPlace.add(new Option((marked.has(d.id)?'✓ ':'')+d.name+' · '+d.batch+' · '+types[d.type],d.id)));
    if(!filtered.some(d=>d.id===current?.id))current=filtered[0]||null;
    if(current)selectPlace.value=current.id;selectPlace.disabled=!current;
    $('c5a-count').textContent=`显示 ${filtered.length} / 358 家 · 已标记 ${marked.size} 家`;
    if($('c5a-region-label'))$('c5a-region-label').textContent=(p||'全国')+' · 景区分布';
    updateFilterUI();details(current);note.style.display='none';
    if(!projection)render();else if(shownProvince!==p){shownProvince=p;renderMarks();focusProvince();}else{renderMarks(true);if(!preserveView)focusProvince();}
  }
  [selectProvince,selectBatch,selectType].forEach(el=>el.addEventListener('change',()=>{hideSuggestions();applyFilters(true);}));
  search.addEventListener('input',()=>{applyFilters(true);suggest();});search.addEventListener('focus',suggest);
  markSegments.addEventListener('click',e=>{const button=e.target.closest('button[data-mark-scope]');if(button){markScope=button.dataset.markScope;hideSuggestions();applyFilters(true);}});
  quickMark.addEventListener('change',()=>{feedback.textContent=quickMark.checked?'点选即标记已开启：点击景区图标即可添加或取消标记。':'点击地图查看详情，在详情中可添加或取消标记。';});
  selectPlace.addEventListener('change',()=>{showSelection(data.find(d=>d.id===selectPlace.value));if(current&&!visible(...coords(current)))focusCurrent();});
  $('c5a-plus').addEventListener('click',()=>zoomBy(1.55));$('c5a-minus').addEventListener('click',()=>zoomBy(1/1.55));
  $('c5a-reset').addEventListener('click',()=>focusProvince());$('c5a-clear-filters').addEventListener('click',clearFilters);
  $('c5a-locate').addEventListener('click',()=>{focusCurrent();if(matchMedia('(max-width:930px)').matches)root.querySelector('.map-column').scrollIntoView({behavior:motion?'smooth':'instant',block:'start'});});
  for(const [id,direction] of [['c5a-prev',-1],['c5a-next',1]])$(id).addEventListener('click',()=>{const index=filtered.findIndex(d=>d.id===current?.id),next=filtered[index+direction];if(next){showSelection(next);if(!visible(...coords(next)))focusCurrent();}});
  $('c5a-mobile-detail').addEventListener('click',()=>root.querySelector('.detail-area').scrollIntoView({behavior:motion?'smooth':'instant',block:'start'}));
  $('c5a-back-map').addEventListener('click',()=>root.querySelector('.map-column').scrollIntoView({behavior:motion?'smooth':'instant',block:'start'}));
  $('c5a-motion').addEventListener('click',()=>{motion=!motion;motionOverride=motion;syncMotion();try{localStorage.setItem('china-5a-map:prefs:v1',JSON.stringify({motion}));}catch(e){}if(!motion){root.getAnimations({subtree:true}).forEach(a=>a.cancel());svg.interrupt('camera');root.dataset.camera='idle';svg.selectAll('*').interrupt('appear').interrupt('pulse');renderMarks();}});
  motionMedia.addEventListener('change',()=>{if(motionOverride===null){motion=!motionMedia.matches;syncMotion();if(!motion){root.getAnimations({subtree:true}).forEach(a=>a.cancel());svg.interrupt('camera');root.dataset.camera='idle';renderMarks();}}});
  $('c5a-undo').addEventListener('click',undoMark);$('c5a-dismiss-toast').addEventListener('click',()=>$('c5a-toast').hidden=true);
  $('c5a-search-clear').addEventListener('click',()=>{search.value='';hideSuggestions();applyFilters(true);search.focus();});
  $('c5a-search-results').addEventListener('pointerdown',e=>e.preventDefault());
  $('c5a-search-results').addEventListener('click',e=>{const option=e.target.closest('[data-result-index]');if(option)chooseSuggestion(+option.dataset.resultIndex);});
  search.addEventListener('blur',hideSuggestions);
  search.addEventListener('keydown',e=>{if(e.key==='Escape'){hideSuggestions();e.preventDefault();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){if($('c5a-search-results').hidden)suggest();if(!suggestions.length)return;e.preventDefault();suggestionIndex=(suggestionIndex+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;$('c5a-search-results').querySelectorAll('[role=option]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===suggestionIndex)));search.setAttribute('aria-activedescendant','c5a-result-'+suggestionIndex);}else if(e.key==='Enter'&&!$('c5a-search-results').hidden){e.preventDefault();chooseSuggestion(suggestionIndex<0?0:suggestionIndex);}});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.closest('input,select,textarea,[contenteditable=true]')){e.preventDefault();search.focus();}});
  $('c5a-export-marks').addEventListener('click',()=>{
    const payload={app:'china-5a-map-marks',version:1,snapshot:'2025-03-11',exportedAt:new Date().toISOString(),marked:data.filter(d=>marked.has(d.id)).map(d=>({id:d.id,name:d.name}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='中国5A景区-我的标记-'+new Date().toISOString().slice(0,10)+'.json';root.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    feedback.textContent=`已导出 ${marked.size} 家景区的标记备份。`;
  });
  $('c5a-import-marks').addEventListener('click',()=>$('c5a-import-file').click());
  $('c5a-import-file').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>1024*1024)throw new Error('备份文件过大');
      const payload=JSON.parse(await file.text());
      if(payload.app!=='china-5a-map-marks'||payload.version!==1||!Array.isArray(payload.marked))throw new Error('请选择本地图导出的标记备份');
      const valid=[];let skipped=0;
      for(const entry of payload.marked){
        const d=entry&&typeof entry==='object'?data.find(d=>d.name===entry.name||d.id===entry.id&&!entry.name):null;
        if(d)valid.push(d.id);else skipped++;
      }
      readLatestMarks();const before=marked.size;valid.forEach(id=>marked.add(id));saveMarks();applyFilters(true);
      feedback.textContent=`导入完成，新增 ${marked.size-before} 个标记，现共 ${marked.size} 个。`+(skipped?` ${skipped} 条无法匹配，已跳过。`:'')+(storageAvailable?'':' 请保留备份文件。');
    }catch(error){feedback.textContent='导入失败：'+error.message+'；已有标记未更改。';}
    finally{e.target.value='';}
  });
  window.addEventListener('storage',e=>{if(e.key===storageKey){try{marked=decodeStored(e.newValue);applyFilters(true);feedback.textContent='标记已同步。';}catch(error){feedback.textContent='另一页面的标记数据无法读取，当前标记保持不变。';}}});
  applyFilters();const mapStage=$('c5a-svg').parentElement;let lastWidth=mapStage.clientWidth;
  new ResizeObserver(()=>{if(Math.abs(mapStage.clientWidth-lastWidth)>1){lastWidth=mapStage.clientWidth;render();}}).observe(mapStage);
  root.dataset.intro='true';root.dataset.ready='true';setTimeout(()=>root.dataset.intro='false',1000);
})();
