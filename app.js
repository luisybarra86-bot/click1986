const SUPA_URL='https://ecljqfqzdatbanzvzxai.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbGpxZnF6ZGF0YmFuenZ6eGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTcyMTEsImV4cCI6MjA5MDI5MzIxMX0.PCGLU4YqNmiEw-jfNquDeQwpRh3uxQD0lfmGbDDidVA';
const supa=supabase.createClient(SUPA_URL,SUPA_KEY);
const STORAGE_KEYS={
  theme:'click1986_theme',
  backup:'click1986_local_backup',
  notif:'click1986_last_notif',
  weekly:'click1986_last_weekly',
  telegramWebhook:'click1986_telegram_webhook'
};
const COLORS=['#e53935','#fb8c00','#f9a825','#43a047','#1e88e5','#8e24aa','#00acc1','#6d4c41','#546e7a','#ec407a'];
const TAG_COLORS=['#7c5cbf','#e040b0','#e53935','#fb8c00','#43a047','#1e88e5','#00acc1','#ec407a'];
const PRIORITIES=['urgent','high','normal','low'];
const STATUSES=['pendiente','en progreso','revisiÃ³n','completado','cancelado'];
const STATUS_COLORS={'pendiente':'#666','en progreso':'#1e88e5','revisiÃ³n':'#f9a825','completado':'#43a047','cancelado':'#e53935'};
const STATUS_LABELS={'pendiente':'Pendiente','en progreso':'En Progreso','revisiÃ³n':'RevisiÃ³n','completado':'Completado','cancelado':'Cancelado'};
const PRIORITY_LABELS={urgent:'Urgente',high:'Alta',normal:'Normal',low:'Baja'};
let telegramWebhook=(window.CLICK1986_CONFIG&&window.CLICK1986_CONFIG.telegramWebhook)||localStorage.getItem(STORAGE_KEYS.telegramWebhook)||'';
let state={projects:[],tasks:[],currentView:'dashboard',filterProject:null,calendarDate:new Date(),theme:'dark'};
let dragId=null;
let completedSectionOpen=false;

function persistLocalBackup(){
  localStorage.setItem(STORAGE_KEYS.backup,JSON.stringify({
    version:4,
    savedAt:new Date().toISOString(),
    projects:state.projects,
    tasks:state.tasks
  }));
}

function restoreLocalBackup(){
  try{
    const raw=localStorage.getItem(STORAGE_KEYS.backup);
    if(!raw)return false;
    const backup=JSON.parse(raw);
    state.projects=Array.isArray(backup.projects)?backup.projects:[];
    state.tasks=Array.isArray(backup.tasks)?backup.tasks:[];
    return state.projects.length>0||state.tasks.length>0;
  }catch(err){
    console.error('Backup local invalido',err);
    return false;
  }
}

async function safeCloudCall(action,{errorMessage,rethrow=false}={}){
  try{
    return await action();
  }catch(err){
    console.error(errorMessage||'Error de sincronizacion',err);
    persistLocalBackup();
    if(errorMessage)showToast(errorMessage,'error');
    if(rethrow)throw err;
    return null;
  }
}

async function loadState(){
  state.theme=localStorage.getItem(STORAGE_KEYS.theme)||'dark';
  applyTheme(state.theme);
  showLoading(true);
  try{
    const{data:sp,error:e1}=await supa.from('spaces').select('*').order('created_at');
    if(e1)throw e1;
    state.projects=(sp||[]).map(s=>({id:s.id,name:s.name,color:s.color}));
    const{data:tk,error:e2}=await supa.from('tasks').select('*').order('created_at');
    if(e2)throw e2;
    state.tasks=(tk||[]).map(t=>({id:t.id,title:t.title,description:t.description||'',status:t.status,priority:t.priority,projectId:t.project_id,dueDate:t.due_date||'',dueTime:t.due_time||'',comments:t.comments||[],subtasks:t.subtasks||[],tags:t.tags||[],createdAt:t.created_at}));
    if(!state.projects.length){const def={id:uid(),name:'Personal',color:'#7c5cbf'};await supa.from('spaces').insert({id:def.id,name:def.name,color:def.color});state.projects=[def];}
    persistLocalBackup();
  }catch(err){
    console.error(err);
    const restored=restoreLocalBackup();
    showToast(restored?'Sin conexion: cargado desde el respaldo local':'Error conectando a la nube','error');
  }
  showLoading(false);render();
}
function showLoading(s){let el=document.getElementById('loading-overlay');if(s&&!el){el=document.createElement('div');el.id='loading-overlay';el.style.cssText='position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:9998;font-family:Syne,sans-serif;font-size:15px;font-weight:700;';el.innerHTML='<span style="background:linear-gradient(135deg,#7c5cbf,#e040b0);-webkit-background-clip:text;-webkit-text-fill-color:transparent">click.1986</span>&nbsp;<span style="color:var(--text3);font-size:12px;font-weight:400">cargando...</span>';document.body.appendChild(el);}else if(!s&&el)el.remove();}

async function saveSpace(s){
  persistLocalBackup();
  return safeCloudCall(async()=>{
    const{error}=await supa.from('spaces').upsert({id:s.id,name:s.name,color:s.color});
    if(error)throw error;
  },{errorMessage:'El espacio se guardo solo en este dispositivo'});
}
async function saveTask(t){
  persistLocalBackup();
  return safeCloudCall(async()=>{
    const{error}=await supa.from('tasks').upsert({id:t.id,title:t.title,description:t.description||'',status:t.status,priority:t.priority,project_id:t.projectId,due_date:t.dueDate||'',due_time:t.dueTime||'',comments:t.comments||[],subtasks:t.subtasks||[],tags:t.tags||[]});
    if(error)throw error;
  },{errorMessage:'La tarea se guardo solo en este dispositivo'});
}
async function deleteTaskDB(id){
  persistLocalBackup();
  return safeCloudCall(async()=>{
    const{error}=await supa.from('tasks').delete().eq('id',id);
    if(error)throw error;
  },{errorMessage:'No se pudo borrar en la nube; queda sincronizacion pendiente'});
}
async function deleteSpaceDB(id){
  persistLocalBackup();
  return safeCloudCall(async()=>{
    const{error}=await supa.from('spaces').delete().eq('id',id);
    if(error)throw error;
  },{errorMessage:'No se pudo borrar en la nube; queda sincronizacion pendiente'});
}

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function getProject(id){return state.projects.find(p=>p.id===id);}
function formatDate(str,time){if(!str)return'';const d=new Date(str+'T00:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'});return time?d+' '+time:d;}
function isOverdue(str){if(!str)return false;return new Date(str+'T23:59:59')<new Date();}
function localDateStr(offsetDays=0){
  const d=new Date();
  if(offsetDays)d.setDate(d.getDate()+offsetDays);
  return d.toLocaleDateString('sv',{timeZone:'America/Argentina/Buenos_Aires'});
}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getSearch(){return(document.getElementById('search-input')?.value||'').toLowerCase().trim();}
function getHour(){const n=new Date();const h=n.getHours();return h<12?'Buenos dÃ­as':h<20?'Buenas tardes':'Buenas noches';}
function filterTasks(tasks){
  let t=tasks;
  if(state.filterProject)t=t.filter(x=>x.projectId===state.filterProject);
  const q=getSearch();if(q)t=t.filter(x=>x.title.toLowerCase().includes(q)||(x.description||'').toLowerCase().includes(q));
  const fp=document.getElementById('filter-priority')?.value;
  const fs=document.getElementById('filter-status')?.value;
  const fd=document.getElementById('filter-due')?.value;
  if(fp)t=t.filter(x=>x.priority===fp);
  if(fs)t=t.filter(x=>x.status===fs);
  if(fd){
    const today=localDateStr(0);
    const tomorrow=localDateStr(1);
    const weekEnd=localDateStr(7);
    if(fd==='overdue')t=t.filter(x=>x.dueDate&&x.dueDate<today&&x.status!=='completado');
    else if(fd==='today')t=t.filter(x=>x.dueDate===today);
    else if(fd==='tomorrow')t=t.filter(x=>x.dueDate===tomorrow);
    else if(fd==='week')t=t.filter(x=>x.dueDate&&x.dueDate>=today&&x.dueDate<=weekEnd);
    else if(fd==='nodate')t=t.filter(x=>!x.dueDate);
  }
  return t;
}
function clearFilters(){['filter-priority','filter-status','filter-due'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const si=document.getElementById('search-input');if(si)si.value='';renderContent();}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme',theme);
  ['theme-btn','theme-icon-btn'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=theme==='dark'?'â˜€ï¸':'ðŸŒ™';});
}
function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark';applyTheme(state.theme);localStorage.setItem(STORAGE_KEYS.theme,state.theme);}

function toggleSidebar(){
  const sb=document.getElementById('nav-sidebar');const ov=document.getElementById('sidebar-overlay');
  if(window.innerWidth<=700){sb.classList.toggle('mobile-open');ov.classList.toggle('active');}
  else{sb.classList.toggle('collapsed');}
}
function closeSidebar(){document.getElementById('nav-sidebar').classList.remove('mobile-open');document.getElementById('sidebar-overlay').classList.remove('active');}

function setView(view,navEl,tabEl){
  state.currentView=view;state.filterProject=null;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.view-tab').forEach(el=>el.classList.remove('active'));
  const nv=document.getElementById('nav-'+view);if(nv)nv.classList.add('active');else if(navEl)navEl.classList.add('active');
  const tv=document.getElementById('tab-'+view);if(tv)tv.classList.add('active');else if(tabEl)tabEl.classList.add('active');
  const titles={dashboard:'Dashboard',kanban:'Kanban',list:'Lista de Tareas',calendar:'Calendario',projects:'Espacios'};
  document.getElementById('view-title').textContent=titles[view]||view;
  renderContent();if(window.innerWidth<=700)closeSidebar();
  // Sync mobile nav
  document.querySelectorAll('.mobile-nav-item').forEach(el=>el.classList.remove('active'));
  const mob=document.getElementById('mob-'+view);if(mob)mob.classList.add('active');
}
function render(){renderSidebarSpaces();renderContent();}
function renderContent(){
  renderSidebarSpaces();
  const c=document.getElementById('main-content');
  const fb=document.getElementById('filter-bar');
  if(fb)fb.style.display=['kanban','list'].includes(state.currentView)?'flex':'none';
  if(state.currentView==='dashboard')c.innerHTML=renderDashboard();
  else if(state.currentView==='kanban')c.innerHTML=renderKanban();
  else if(state.currentView==='list')c.innerHTML=renderList();
  else if(state.currentView==='calendar'){c.innerHTML=renderCalendar();bindCalendar();}
  else if(state.currentView==='projects')c.innerHTML=renderProjects();
}
function renderSidebarSpaces(){
  const el=document.getElementById('sidebar-spaces');if(!el)return;
  const counts={};state.tasks.forEach(t=>{if(t.status!=='completado')counts[t.projectId]=(counts[t.projectId]||0)+1;});
  el.innerHTML=state.projects.map(p=>`<div class="space-item ${state.filterProject===p.id?'active':''}" onclick="filterBySpace('${p.id}')"><div class="space-dot" style="background:${p.color}"></div><span class="space-name">${esc(p.name)}</span><span class="space-count">${counts[p.id]||''}</span><div class="space-actions"><button class="space-act-btn" onclick="event.stopPropagation();openEditSpaceModal('${p.id}')">âœï¸</button><button class="space-act-btn del" onclick="event.stopPropagation();confirmDeleteSpace('${p.id}')">âœ•</button></div></div>`).join('');
}
function filterBySpace(id){state.filterProject=state.filterProject===id?null:id;renderContent();}
function renderTags(tags){if(!tags||!tags.length)return'';return tags.map(tg=>`<span class="tag-badge" style="background:${tg.color}22;color:${tg.color}">${esc(tg.name)}</span>`).join('');}

/* DASHBOARD */
function renderDashboard(){
  const today=localDateStr(0);
  const tomorrow=localDateStr(1);
  const weekEnd=localDateStr(7);
  const all=state.tasks,active=all.filter(t=>t.status!=='completado'),done=all.filter(t=>t.status==='completado');
  const overdue=all.filter(t=>t.dueDate&&t.dueDate<today&&t.status!=='completado');
  const todayT=all.filter(t=>t.dueDate===today&&t.status!=='completado');
  const weekT=all.filter(t=>t.dueDate&&t.dueDate>=today&&t.dueDate<=weekEnd&&t.status!=='completado');
  const pct=all.length?Math.round(done.length/all.length*100):0;
  const byP={urgent:active.filter(t=>t.priority==='urgent').length,high:active.filter(t=>t.priority==='high').length,normal:active.filter(t=>t.priority==='normal').length,low:active.filter(t=>t.priority==='low').length};
  const bySpace=state.projects.map(p=>({name:p.name,color:p.color,count:active.filter(t=>t.projectId===p.id).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  const maxSp=bySpace.length?bySpace[0].count:1;
  const upcoming=[...overdue.slice(0,2),...todayT.slice(0,2),...all.filter(t=>t.dueDate===tomorrow&&t.status!=='completado').slice(0,2)].slice(0,5);
  return`<div class="dash-view">
    <div class="dash-welcome">${getHour()}, <span class="grad">Luis</span> ðŸ‘‹</div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-num" style="color:var(--accent)">${active.length}</div><div class="kpi-label">Activas</div></div>
      <div class="kpi"><div class="kpi-num" style="color:var(--green)">${done.length}</div><div class="kpi-label">Completadas</div></div>
      <div class="kpi"><div class="kpi-num" style="color:var(--red)">${overdue.length}</div><div class="kpi-label">Vencidas</div></div>
      <div class="kpi"><div class="kpi-num" style="color:var(--yellow)">${todayT.length}</div><div class="kpi-label">Hoy</div></div>
      <div class="kpi"><div class="kpi-num" style="color:var(--blue)">${weekT.length}</div><div class="kpi-label">Esta semana</div></div>
      <div class="kpi"><div class="kpi-num" style="color:var(--text3)">${pct}%</div><div class="kpi-label">Progreso</div></div>
    </div>
    <div class="dash-row">
      <div class="dash-card">
        <div class="dash-card-title">â° PrÃ³ximas a vencer</div>
        ${upcoming.length?upcoming.map(t=>{const p=getProject(t.projectId);const isOv=t.dueDate<today;return`<div class="dash-task-row"><span style="color:${isOv?'#ef5350':'var(--yellow)'}">â—</span><span class="dash-task-name" onclick="openTaskDetail('${t.id}')">${esc(t.title)}</span><span class="dash-task-date">${formatDate(t.dueDate,t.dueTime)}</span></div>`;}).join(''):`<div style="font-size:12px;color:var(--text3);padding:8px 0">âœ“ Todo al dÃ­a</div>`}
      </div>
      <div class="dash-card">
        <div class="dash-card-title">ðŸ“Š Por prioridad</div>
        ${[['urgent','Urgente','#ef5350'],['high','Alta','#fb8c00'],['normal','Normal','#9b72e8'],['low','Baja','#888']].map(([k,l,c])=>{const cnt=byP[k];const pp=active.length?Math.round(cnt/active.length*100):0;return`<div class="bar-row"><span class="bar-lbl">${l}</span><div class="dash-bar"><div class="dash-bar-fill" style="width:${pp}%;background:${c}"></div></div><span class="bar-val">${cnt}</span></div>`;}).join('')}
      </div>
      <div class="dash-card">
        <div class="dash-card-title">ðŸ“ Por espacio</div>
        ${bySpace.length?bySpace.map(s=>`<div class="bar-row"><span class="bar-lbl">${esc(s.name)}</span><div class="dash-bar"><div class="dash-bar-fill" style="width:${Math.round(s.count/maxSp*100)}%;background:${s.color}"></div></div><span class="bar-val">${s.count}</span></div>`).join(''):`<div style="font-size:12px;color:var(--text3)">Sin tareas activas</div>`}
      </div>
    </div>
    <div class="dash-row">
      <div class="dash-card">
        <div class="dash-card-title">âœ… Completadas recientes</div>
        ${done.length?done.slice(-5).reverse().map(t=>{const p=getProject(t.projectId);return`<div class="dash-task-row"><span style="color:var(--green)">âœ“</span><span class="dash-task-name" onclick="openTaskDetail('${t.id}')">${esc(t.title)}</span>${p?`<span class="tag-badge" style="background:${p.color}20;color:${p.color}">${esc(p.name)}</span>`:''}</div>`;}).join(''):`<div style="font-size:12px;color:var(--text3);padding:8px 0">Sin tareas completadas aÃºn.</div>`}
      </div>
    </div>
  </div>`;
}

/* KANBAN */
function renderKanban(){const tasks=filterTasks(state.tasks);return`<div class="kanban-board">${STATUSES.map(status=>{const col=tasks.filter(t=>t.status===status);const isArchived=status==='completado'||status==='cancelado';return`<div class="kanban-col" data-status="${status}" ondragover="dragOver(event)" ondrop="drop(event,this)" style="${isArchived?'opacity:0.75;':''}"><div class="kanban-col-header" style="${isArchived?'border-bottom:2px solid '+STATUS_COLORS[status]+';':''}"><div class="col-dot" style="background:${STATUS_COLORS[status]}"></div><div class="col-title" style="${isArchived?'color:'+STATUS_COLORS[status]+';':''}">${status==='cancelado'?'ðŸš« ':status==='completado'?'âœ… ':''}${STATUS_LABELS[status]}</div><div class="col-count">${col.length}</div></div><div class="kanban-col-body">${col.map(t=>renderTaskCard(t)).join('')}${col.length===0?'<div class="empty-state"><div style="font-size:22px;opacity:.3">â—‹</div></div>':''}</div><button class="add-task-col-btn" onclick="openTaskModal(\'${status}\')">+ Agregar tarea</button></div>`;}).join('')}</div>`;}

function renderTaskCard(t){const proj=getProject(t.projectId);const overdue=isOverdue(t.dueDate)&&t.status!=='completado';const sub=t.subtasks||[];const doneSub=sub.filter(s=>s.done).length;const pct=sub.length?Math.round(doneSub/sub.length*100):0;const tags=t.tags||[];return`<div class="task-card" draggable="true" data-id="${t.id}" ondragstart="dragStart(event,this)" ondragend="dragEnd(this)" onclick="openTaskDetail('${t.id}')"><div class="task-card-title">${esc(t.title)}</div>${tags.length?`<div class="task-card-tags">${renderTags(tags)}</div>`:''} ${sub.length?`<div class="subtask-bar"><div style="font-size:9.5px;color:var(--text3)">${doneSub}/${sub.length} subtareas</div><div class="subtask-progress"><div class="subtask-progress-fill" style="width:${pct}%"></div></div></div>`:''}<div class="task-card-meta"><span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>${t.dueDate?`<span class="due-badge ${overdue?'overdue':''}">ðŸ“… ${formatDate(t.dueDate,t.dueTime)}</span>`:''}${proj?`<span class="tag-badge" style="background:${proj.color}20;color:${proj.color}">${esc(proj.name)}</span>`:''} ${t.comments.length?`<span class="comment-count" style="margin-left:auto">ðŸ’¬ ${t.comments.length}</span>`:''}</div></div>`;}

function dragStart(e,el){dragId=el.dataset.id;el.classList.add('dragging');e.dataTransfer.effectAllowed='move';}
function dragEnd(el){el.classList.remove('dragging');document.querySelectorAll('.kanban-col').forEach(c=>c.classList.remove('drag-over'));}
function dragOver(e){e.preventDefault();e.currentTarget.closest('.kanban-col')?.classList.add('drag-over');}
async function drop(e,colEl){e.preventDefault();colEl.classList.remove('drag-over');const status=colEl.dataset.status;if(!dragId||!status)return;const task=state.tasks.find(t=>t.id===dragId);if(task&&task.status!==status){task.status=status;await saveTask(task);renderContent();showToast(`Movida a ${STATUS_LABELS[status]}`,'success');}dragId=null;}

/* LIST */
function renderListRow(t){const proj=getProject(t.projectId);const done=t.status==='completado';const cancelled=t.status==='cancelado';const overdue=isOverdue(t.dueDate)&&!done&&!cancelled;return`<div class="list-row" onclick="openTaskDetail('${t.id}')" style="${cancelled?'opacity:0.6;':done?'opacity:0.5;':''}"><div class="list-row-check ${done?'done':''}" onclick="event.stopPropagation();toggleDone('${t.id}')">${done?'âœ“':cancelled?'âœ•':''}</div><div class="list-row-title ${done||cancelled?'done-text':''}">${esc(t.title)}</div><div>${proj?`<span style="background:${proj.color}20;color:${proj.color};padding:2px 7px;border-radius:4px;font-size:10.5px">${esc(proj.name)}</span>`:'-'}</div><div class="list-row-due ${overdue?'overdue':''}">${t.dueDate?formatDate(t.dueDate,t.dueTime):'-'}</div><div><span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span></div><div style="text-align:right"><button class="icon-btn" onclick="event.stopPropagation();deleteTask('${t.id}')">ðŸ—‘</button></div></div>`;}
function toggleCompletedSection(){completedSectionOpen=!completedSectionOpen;renderContent();}
function renderList(){
  const tasks=filterTasks(state.tasks);
  const activeStatuses=['pendiente','en progreso','revisiÃ³n','cancelado'];
  const grouped={};activeStatuses.forEach(s=>grouped[s]=[]);
  const completedTasks=[];
  tasks.forEach(t=>{if(t.status==='completado')completedTasks.push(t);else if(grouped[t.status])grouped[t.status].push(t);});
  const activeGroupsHtml=activeStatuses.map(status=>{const col=grouped[status];return`<div class="list-group"><div class="list-group-header"><div class="col-dot" style="background:${STATUS_COLORS[status]};width:7px;height:7px;border-radius:50%;flex-shrink:0"></div><div class="list-group-title" style="${status==='cancelado'?'color:'+STATUS_COLORS['cancelado']:''}">${status==='cancelado'?'ðŸš« ':''}${STATUS_LABELS[status]}</div><div class="list-group-count">${col.length}</div></div>${col.map(t=>renderListRow(t)).join('')}${col.length===0?`<div style="padding:7px 10px;font-size:12px;color:var(--text3)">Sin tareas</div>`:''}</div>`;}).join('');
  const completedHtml=`<div class="list-group" style="margin-top:8px;border-top:2px dashed var(--border2);padding-top:10px"><div class="list-group-header" onclick="toggleCompletedSection()" style="cursor:pointer;user-select:none;background:var(--surface2);border-radius:7px;padding:8px 10px;margin-bottom:6px"><div class="col-dot" style="background:${STATUS_COLORS['completado']};width:7px;height:7px;border-radius:50%;flex-shrink:0"></div><div class="list-group-title" style="color:var(--green)">ðŸ“¦ Completadas</div><div class="list-group-count">${completedTasks.length}</div><span style="margin-left:auto;color:var(--text3);font-size:11px">${completedSectionOpen?'â–² Ocultar':'â–¼ Ver todas'}</span></div>${completedSectionOpen?completedTasks.map(t=>renderListRow(t)).join('')+(completedTasks.length===0?'<div style="padding:7px 10px;font-size:12px;color:var(--text3)">Sin tareas completadas</div>':''):''}</div>`;
  return`<div class="list-view"><div class="list-header-row"><div></div><div class="list-header-cell">Tarea</div><div class="list-header-cell">Espacio</div><div class="list-header-cell">Fecha</div><div class="list-header-cell">Prioridad</div><div></div></div>${activeGroupsHtml}${completedHtml}</div>`;
}

/* CALENDAR */
function renderCalendar(){const d=state.calendarDate;const year=d.getFullYear(),month=d.getMonth();const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];const DAYS=['Dom','Lun','Mar','MiÃ©','Jue','Vie','SÃ¡b'];const today=new Date();today.setHours(0,0,0,0);const firstDay=new Date(year,month,1).getDay();const daysInMonth=new Date(year,month+1,0).getDate();const daysInPrev=new Date(year,month,0).getDate();const byDate={};filterTasks(state.tasks).forEach(t=>{if(t.dueDate){byDate[t.dueDate]=byDate[t.dueDate]||[];byDate[t.dueDate].push(t);}});let cells='';for(let i=firstDay-1;i>=0;i--)cells+=`<div class="cal-day other-month"><div class="cal-day-num">${daysInPrev-i}</div></div>`;for(let day=1;day<=daysInMonth;day++){const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const isToday=new Date(year,month,day).getTime()===today.getTime();const dt=byDate[ds]||[];cells+=`<div class="cal-day ${isToday?'today':''}" onclick="openTaskModal(null,'${ds}')"><div class="cal-day-num">${day}</div>${dt.slice(0,3).map(t=>`<div class="cal-task-chip priority-${t.priority}" onclick="event.stopPropagation();openTaskDetail('${t.id}')">${esc(t.title)}</div>`).join('')}${dt.length>3?`<div style="font-size:9px;color:var(--text3)">+${dt.length-3}</div>`:''}</div>`;}const total=Math.ceil((firstDay+daysInMonth)/7)*7;for(let i=1;i<=total-firstDay-daysInMonth;i++)cells+=`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;return`<div class="calendar-view"><div class="cal-header"><button class="btn btn-ghost btn-sm" id="cal-prev">â€¹</button><div class="cal-month">${MONTHS[month]} ${year}</div><button class="btn btn-ghost btn-sm" id="cal-next">â€º</button></div><div class="cal-grid">${DAYS.map(n=>`<div class="cal-day-name">${n}</div>`).join('')}${cells}</div></div>`;}
function bindCalendar(){document.getElementById('cal-prev').onclick=()=>{const d=state.calendarDate;state.calendarDate=new Date(d.getFullYear(),d.getMonth()-1,1);renderContent();};document.getElementById('cal-next').onclick=()=>{const d=state.calendarDate;state.calendarDate=new Date(d.getFullYear(),d.getMonth()+1,1);renderContent();};}

/* PROJECTS */
function renderProjects(){return`<div class="projects-view"><div class="projects-top"><div class="projects-heading">Mis Espacios</div><button class="btn btn-primary btn-sm" onclick="openProjectModal()">+ Nuevo espacio</button></div><div class="projects-grid">${state.projects.map(p=>{const tasks=state.tasks.filter(t=>t.projectId===p.id);const done=tasks.filter(t=>t.status==='completado').length;const active=tasks.filter(t=>t.status!=='completado').length;const pct=tasks.length?Math.round(done/tasks.length*100):0;return`<div class="project-card" onclick="setView('kanban');filterBySpace('${p.id}')"><div class="project-card-top"><div class="project-card-left"><div class="project-card-dot" style="background:${p.color}"></div><div class="project-card-name">${esc(p.name)}</div></div><div class="project-card-actions"><button class="proj-act-btn" onclick="event.stopPropagation();openEditSpaceModal('${p.id}')">âœï¸</button><button class="proj-act-btn del" onclick="event.stopPropagation();confirmDeleteSpace('${p.id}')">âœ•</button></div></div><div class="project-card-sub">${tasks.length} tareas Â· ${active} activas</div><div class="project-card-stats"><div class="proj-stat"><div class="proj-stat-num" style="color:${p.color}">${active}</div><div class="proj-stat-label">Activas</div></div><div class="proj-stat"><div class="proj-stat-num" style="color:var(--green)">${done}</div><div class="proj-stat-label">Listas</div></div><div class="proj-stat"><div class="proj-stat-num" style="color:var(--text3)">${pct}%</div><div class="proj-stat-label">Progreso</div></div></div><div><div class="progress-label"><span>Avance</span><span>${pct}%</span></div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${p.color}"></div></div></div></div>`;}).join('')}<div class="new-project-card" onclick="openProjectModal()"><div style="font-size:22px">+</div><div style="font-size:12.5px;font-weight:600">Nuevo espacio</div></div></div></div>`;}

/* EDIT SPACE */
function openEditSpaceModal(id){const proj=getProject(id);if(!proj)return;createModal('Editar Espacio',`<div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="ep-name" value="${esc(proj.name)}" autofocus></div><div class="form-group"><label class="form-label">Color</label><div class="color-picker">${COLORS.map(c=>`<div class="color-dot-pick ${proj.color===c?'selected':''}" style="background:${c}" onclick="selectColor(this)"></div>`).join('')}</div></div>`,async()=>{const name=document.getElementById('ep-name').value.trim();if(!name){showToast('IngresÃ¡ un nombre','error');return;}const sel=document.querySelector('.color-dot-pick.selected');proj.name=name;proj.color=sel?sel.style.background:proj.color;await saveSpace(proj);closeModal();render();showToast('âœ“ Espacio actualizado','success');},'Guardar');}

/* DELETE SPACE */
function confirmDeleteSpace(id){const proj=getProject(id);if(!proj)return;const tc=state.tasks.filter(t=>t.projectId===id).length;document.getElementById('modal-container').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal" style="max-width:380px"><div class="modal-header"><div class="modal-title">Eliminar espacio</div><button class="modal-close" onclick="closeModal()">âœ•</button></div><div class="modal-body"><p style="font-size:13px;line-height:1.6;color:var(--text2)">Â¿Eliminar "${esc(proj.name)}"?${tc>0?` Se eliminarÃ¡n ${tc} tarea${tc!==1?'s':''}.`:''}</p>${tc>0?`<p style="font-size:11px;color:#ef5350;margin-top:4px">Esta acciÃ³n no se puede deshacer.</p>`:''}</div><div class="modal-footer"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button><button class="btn btn-danger btn-sm" onclick="deleteSpace('${id}')">Eliminar</button></div></div></div>`;}
async function deleteSpace(id){if(state.filterProject===id)state.filterProject=null;state.projects=state.projects.filter(p=>p.id!==id);state.tasks=state.tasks.filter(t=>t.projectId!==id);await deleteSpaceDB(id);closeModal();render();showToast('Espacio eliminado');}

/* TASK MODAL */
function openTaskModal(defaultStatus,defaultDate){const dp=state.filterProject||(state.projects[0]?.id||'');createModal('Nueva Tarea',`<div class="form-group"><label class="form-label">TÃ­tulo *</label><input class="form-input" id="t-title" placeholder="Â¿QuÃ© hay que hacer?" autofocus></div><div class="form-group"><label class="form-label">DescripciÃ³n</label><textarea class="form-textarea" id="t-desc" placeholder="Detalles opcionales..."></textarea></div><div class="form-row"><div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="t-status">${STATUSES.map(s=>`<option value="${s}" ${s===(defaultStatus||'pendiente')?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Prioridad</label><select class="form-select" id="t-priority">${PRIORITIES.map(p=>`<option value="${p}">${PRIORITY_LABELS[p]}</option>`).join('')}</select></div></div><div class="form-row"><div class="form-group"><label class="form-label">Espacio</label><select class="form-select" id="t-project">${state.projects.map(p=>`<option value="${p.id}" ${p.id===dp?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Fecha lÃ­mite</label><input class="form-input" type="date" id="t-due" value="${defaultDate||''}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Hora lÃ­mite</label><input class="form-input" type="time" id="t-time"></div><div></div></div>`,async()=>{const title=document.getElementById('t-title').value.trim();if(!title){showToast('IngresÃ¡ un tÃ­tulo','error');return;}const newTask={id:uid(),title,description:document.getElementById('t-desc').value,status:document.getElementById('t-status').value,priority:document.getElementById('t-priority').value,projectId:document.getElementById('t-project').value,dueDate:document.getElementById('t-due').value,dueTime:document.getElementById('t-time')?.value||'',comments:[],subtasks:[],tags:[],createdAt:new Date().toISOString()};state.tasks.push(newTask);await saveTask(newTask);closeModal();render();showToast('âœ“ Tarea creada','success');},'Crear tarea');}

/* TASK DETAIL */
function openTaskDetail(taskId){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;const tags=task.tags||[];const subs=task.subtasks||[];document.getElementById('modal-container').innerHTML=`<div class="modal-overlay" onclick="if(event.target===this){saveTaskDetail('${taskId}');closeModal()}"><div class="modal modal-task"><div class="modal-header"><input class="task-detail-title" id="dt-title" value="${esc(task.title)}" placeholder="TÃ­tulo"><button class="modal-close" onclick="saveTaskDetail('${taskId}');closeModal()">âœ•</button></div><div class="modal-body"><div class="task-meta-row"><div class="task-meta-item"><span class="task-meta-label">Estado</span><select class="form-select" style="padding:5px 8px;font-size:11.5px" id="dt-status">${STATUSES.map(s=>`<option value="${s}" ${task.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}</select></div><div class="task-meta-item"><span class="task-meta-label">Prioridad</span><select class="form-select" style="padding:5px 8px;font-size:11.5px" id="dt-priority">${PRIORITIES.map(p=>`<option value="${p}" ${task.priority===p?'selected':''}>${PRIORITY_LABELS[p]}</option>`).join('')}</select></div><div class="task-meta-item"><span class="task-meta-label">Espacio</span><select class="form-select" style="padding:5px 8px;font-size:11.5px" id="dt-project">${state.projects.map(p=>`<option value="${p.id}" ${task.projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="task-meta-item"><span class="task-meta-label">Fecha</span><input type="date" class="form-input" style="padding:5px 8px;font-size:11.5px;width:auto" id="dt-due" value="${task.dueDate||''}"></div><div class="task-meta-item"><span class="task-meta-label">Hora</span><input type="time" class="form-input" style="padding:5px 8px;font-size:11.5px;width:auto" id="dt-time" value="${task.dueTime||''}"></div></div><div class="form-group"><label class="form-label">Etiquetas</label><div class="tags-editor" id="tags-editor">${tags.map((tg,i)=>`<span class="tag-pill" style="background:${tg.color}22;color:${tg.color}">${esc(tg.name)}<button class="tag-x" onclick="removeTag('${taskId}',${i})">Ã—</button></span>`).join('')}<button class="tag-add-btn" onclick="addTagPrompt('${taskId}')">+ Etiqueta</button></div></div><div class="form-group"><label class="form-label">DescripciÃ³n</label><textarea class="task-description" id="dt-desc">${esc(task.description||'')}</textarea></div><div><div class="form-label" style="margin-bottom:7px">Subtareas</div><div id="subtasks-list">${renderSubtasksList(subs,taskId)}</div><div class="add-subtask-row"><span style="font-size:12px;color:var(--text3)">+</span><input class="add-subtask-input" id="new-subtask" placeholder="Agregar subtarea..."><button class="btn btn-ghost btn-sm" onclick="addSubtask('${taskId}')">Agregar</button></div></div><div><div class="comments-title">ðŸ’¬ Comentarios <span style="color:var(--text3)" id="comment-count">(${task.comments.length})</span></div><div id="comments-list">${renderComments(task.comments)}</div><div class="comment-input-row"><textarea class="comment-input" id="new-comment" placeholder="EscribÃ­ un comentario..." rows="1"></textarea><button class="btn btn-primary btn-sm" onclick="addComment('${taskId}')">Enviar</button></div></div></div><div class="modal-footer"><button class="btn btn-danger btn-sm" onclick="deleteTask('${taskId}');closeModal()">ðŸ—‘ Eliminar</button><button class="btn btn-ghost btn-sm" onclick="saveTaskDetail('${taskId}');closeModal()">Guardar y cerrar</button></div></div></div>`;
setTimeout(()=>{document.getElementById('new-subtask')?.addEventListener('keydown',e=>{if(e.key==='Enter')addSubtask(taskId);});},50);}

function renderSubtasksList(subs,taskId){if(!subs.length)return`<div style="font-size:11.5px;color:var(--text3);padding:4px 0">Sin subtareas aÃºn.</div>`;return subs.map((s,i)=>`<div class="subtask-item"><div class="subtask-check ${s.done?'done':''}" onclick="toggleSubtask('${taskId}',${i})">${s.done?'âœ“':''}</div><span class="subtask-text ${s.done?'done-text':''}">${esc(s.text)}</span><button class="subtask-del" onclick="removeSubtask('${taskId}',${i})">âœ•</button></div>`).join('');}
async function addSubtask(taskId){const input=document.getElementById('new-subtask');const text=input.value.trim();if(!text)return;const task=state.tasks.find(t=>t.id===taskId);if(!task)return;if(!task.subtasks)task.subtasks=[];task.subtasks.push({text,done:false});await saveTask(task);input.value='';document.getElementById('subtasks-list').innerHTML=renderSubtasksList(task.subtasks,taskId);}
async function toggleSubtask(taskId,idx){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;task.subtasks[idx].done=!task.subtasks[idx].done;await saveTask(task);document.getElementById('subtasks-list').innerHTML=renderSubtasksList(task.subtasks,taskId);}
async function removeSubtask(taskId,idx){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;task.subtasks.splice(idx,1);await saveTask(task);document.getElementById('subtasks-list').innerHTML=renderSubtasksList(task.subtasks,taskId);}

function addTagPrompt(taskId){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;if(!task.tags)task.tags=[];const tm=document.createElement('div');tm.id='tag-modal';tm.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px;';tm.innerHTML=`<div style="background:var(--surface);border-radius:10px;padding:16px;width:100%;max-width:280px;border:1px solid var(--border2)"><div style="font-family:Syne,sans-serif;font-weight:700;font-size:13.5px;margin-bottom:11px">Nueva etiqueta</div><div class="form-group" style="margin-bottom:9px"><label class="form-label">Nombre</label><input class="form-input" id="tag-name-input" placeholder="Ej: Urgente, Cliente..." autofocus></div><div class="form-group" style="margin-bottom:12px"><label class="form-label">Color</label><div class="color-picker">${TAG_COLORS.map((c,i)=>`<div class="color-dot-pick ${i===0?'selected':''}" style="background:${c}" onclick="selectColor(this)"></div>`).join('')}</div></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost btn-sm" onclick="document.getElementById('tag-modal').remove()">Cancelar</button><button class="btn btn-primary btn-sm" onclick="confirmAddTag('${taskId}')">Agregar</button></div></div>`;document.body.appendChild(tm);setTimeout(()=>document.getElementById('tag-name-input')?.focus(),50);}
async function confirmAddTag(taskId){const name=document.getElementById('tag-name-input')?.value.trim();if(!name){showToast('IngresÃ¡ un nombre','error');return;}const sel=document.querySelector('#tag-modal .color-dot-pick.selected');const color=sel?sel.style.background:TAG_COLORS[0];const task=state.tasks.find(t=>t.id===taskId);if(!task)return;if(!task.tags)task.tags=[];task.tags.push({name,color});await saveTask(task);document.getElementById('tag-modal')?.remove();refreshTagsEditor(task,taskId);}
async function removeTag(taskId,idx){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;task.tags.splice(idx,1);await saveTask(task);refreshTagsEditor(task,taskId);}
function refreshTagsEditor(task,taskId){const editor=document.getElementById('tags-editor');if(editor)editor.innerHTML=task.tags.map((tg,i)=>`<span class="tag-pill" style="background:${tg.color}22;color:${tg.color}">${esc(tg.name)}<button class="tag-x" onclick="removeTag('${taskId}',${i})">Ã—</button></span>`).join('')+`<button class="tag-add-btn" onclick="addTagPrompt('${taskId}')">+ Etiqueta</button>`;}

function renderComments(comments){if(!comments.length)return`<div style="font-size:11.5px;color:var(--text3);padding:5px 0">Sin comentarios aÃºn.</div>`;return comments.map(c=>`<div class="comment-item"><div class="comment-avatar">L</div><div class="comment-bubble"><div class="comment-meta">${new Date(c.createdAt).toLocaleString('es-AR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div><div class="comment-text">${esc(c.text)}</div></div></div>`).join('');}
async function addComment(taskId){const input=document.getElementById('new-comment');const text=input.value.trim();if(!text)return;const task=state.tasks.find(t=>t.id===taskId);if(!task)return;task.comments.push({id:uid(),text,createdAt:new Date().toISOString()});await saveTask(task);input.value='';document.getElementById('comments-list').innerHTML=renderComments(task.comments);const cc=document.getElementById('comment-count');if(cc)cc.textContent=`(${task.comments.length})`;}
async function saveTaskDetail(taskId){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;const title=document.getElementById('dt-title')?.value?.trim();if(title)task.title=title;task.status=document.getElementById('dt-status')?.value||task.status;task.priority=document.getElementById('dt-priority')?.value||task.priority;task.projectId=document.getElementById('dt-project')?.value||task.projectId;task.dueDate=document.getElementById('dt-due')?.value||'';task.dueTime=document.getElementById('dt-time')?.value||'';task.description=document.getElementById('dt-desc')?.value||'';await saveTask(task);render();}
async function toggleDone(taskId){const task=state.tasks.find(t=>t.id===taskId);if(!task)return;task.status=task.status==='completado'?'pendiente':'completado';await saveTask(task);render();}
async function deleteTask(taskId){state.tasks=state.tasks.filter(t=>t.id!==taskId);await deleteTaskDB(taskId);render();showToast('Tarea eliminada');}

/* PROJECT MODAL */
function openProjectModal(){createModal('Nuevo Espacio',`<div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="p-name" placeholder="Ej: Trabajo, Ideas..." autofocus></div><div class="form-group"><label class="form-label">Color</label><div class="color-picker">${COLORS.map((c,i)=>`<div class="color-dot-pick ${i===0?'selected':''}" style="background:${c}" onclick="selectColor(this)"></div>`).join('')}</div></div>`,async()=>{const name=document.getElementById('p-name').value.trim();if(!name){showToast('IngresÃ¡ un nombre','error');return;}const sel=document.querySelector('.color-dot-pick.selected');const newSpace={id:uid(),name,color:sel?sel.style.background:COLORS[0]};state.projects.push(newSpace);await saveSpace(newSpace);closeModal();render();showToast('âœ“ Espacio creado','success');},'Crear espacio');}
function selectColor(el){document.querySelectorAll('.color-dot-pick').forEach(d=>d.classList.remove('selected'));el.classList.add('selected');}

/* BACKUP */
function exportBackup(){persistLocalBackup();const data={version:4,exportedAt:new Date().toISOString(),projects:state.projects,tasks:state.tasks};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`click1986-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);showToast('âœ“ Backup exportado','success');}
function importBackup(){document.getElementById('import-file').click();}
async function handleImport(e){const file=e.target.files[0];if(!file)return;try{const text=await file.text();const data=JSON.parse(text);if(!data.projects||!data.tasks){showToast('Archivo invÃ¡lido','error');return;}if(!confirm(`Â¿Importar ${data.projects.length} espacios y ${data.tasks.length} tareas?`))return;for(const p of data.projects){if(!state.projects.find(x=>x.id===p.id)){state.projects.push(p);await saveSpace(p);}}for(const t of data.tasks){if(!state.tasks.find(x=>x.id===t.id)){if(!t.subtasks)t.subtasks=[];if(!t.tags)t.tags=[];state.tasks.push(t);await saveTask(t);}}persistLocalBackup();render();showToast(`âœ“ Importados: ${data.tasks.length} tareas`,'success');}catch(err){showToast('Error al importar','error');}e.target.value='';}

/* MODAL HELPERS */
function createModal(title,body,onConfirm,confirmText='Guardar'){const container=document.getElementById('modal-container');container.innerHTML=`<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-header"><div class="modal-title">${title}</div><button class="modal-close" onclick="closeModal()">âœ•</button></div><div class="modal-body">${body}</div><div class="modal-footer"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button><button class="btn btn-primary btn-sm" id="modal-confirm">${confirmText}</button></div></div></div>`;document.getElementById('modal-confirm').onclick=onConfirm;setTimeout(()=>{container.querySelectorAll('input[type="text"],input:not([type])').forEach(inp=>inp.addEventListener('keydown',e=>{if(e.key==='Enter')onConfirm();}));},50);}
function closeModal(){document.getElementById('modal-container').innerHTML='';}
function showToast(msg,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}
window.setTelegramWebhook=function(url){telegramWebhook=(url||'').trim();if(telegramWebhook)localStorage.setItem(STORAGE_KEYS.telegramWebhook,telegramWebhook);else localStorage.removeItem(STORAGE_KEYS.telegramWebhook);showToast(telegramWebhook?'Webhook de Telegram guardado':'Webhook de Telegram eliminado','success');}
window.clearTelegramWebhook=function(){window.setTelegramWebhook('');}
window.configureTelegramWebhook=function(){
  const current=telegramWebhook||'';
  const next=window.prompt('Pegá la URL segura de tu webhook de Telegram',current);
  if(next===null)return false;
  const trimmed=next.trim();
  if(!trimmed){
    if(current&&window.confirm('¿Querés eliminar el webhook de Telegram guardado?')){
      window.clearTelegramWebhook();
      return true;
    }
    return false;
  }
  try{
    new URL(trimmed);
  }catch(err){
    showToast('La URL del webhook no es válida','error');
    return false;
  }
  window.setTelegramWebhook(trimmed);
  return true;
}

/* TELEGRAM */
async function sendTelegram(msg,opts={}){
  if(!telegramWebhook){
    if(!opts.silent)showToast('Telegram no configurado. AgregÃ¡ un webhook seguro en CLICK1986_CONFIG o localStorage.','error');
    return false;
  }
  try{
    const res=await fetch(telegramWebhook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,source:'click1986'})
    });
    if(!res.ok)throw new Error(`Webhook ${res.status}`);
    return true;
  }catch(e){
    console.log('TG:',e);
    if(!opts.silent)showToast('No se pudo enviar a Telegram','error');
    return false;
  }
}
function addMinutes(time,mins){const[h,m]=time.split(':').map(Number);const d=new Date(2000,0,1,h,m+mins);return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');}
function buildHourlySummary(currentTime,today){
  const soon=state.tasks.filter(t=>t.dueDate===today&&t.dueTime&&t.status!=='completado'&&t.dueTime>=currentTime&&t.dueTime<=addMinutes(currentTime,15));
  if(!soon.length)return'';
  let msg=`â° <b>PRÃ“XIMAS A VENCER</b>\n`;
  soon.forEach(t=>{const p=getProject(t.projectId);msg+=`â€¢ ${t.title} â€” ${t.dueTime}${p?' ('+p.name+')':''}\n`;});
  return msg;
}
function buildDailySummary(){
  const today=localDateStr(0),tomorrow=localDateStr(1);
  const todayT=state.tasks.filter(t=>t.dueDate===today&&t.status!=='completado');
  const tomorrowT=state.tasks.filter(t=>t.dueDate===tomorrow&&t.status!=='completado');
  const overdueT=state.tasks.filter(t=>t.dueDate&&t.dueDate<today&&t.status!=='completado');
  let msg='';
  if(overdueT.length){msg+=`ðŸ”´ <b>VENCIDAS (${overdueT.length})</b>\n`;overdueT.forEach(t=>{const p=getProject(t.projectId);msg+=`â€¢ ${t.title}${p?' â€” '+p.name:''}\n`;});msg+='\n';}
  if(todayT.length){msg+=`ðŸŸ¡ <b>VENCEN HOY (${todayT.length})</b>\n`;todayT.forEach(t=>{const p=getProject(t.projectId);msg+=`â€¢ ${t.title}${t.dueTime?' '+t.dueTime:''}${p?' â€” '+p.name:''}\n`;});msg+='\n';}
  if(tomorrowT.length){msg+=`ðŸ”µ <b>VENCEN MAÃ‘ANA (${tomorrowT.length})</b>\n`;tomorrowT.forEach(t=>{const p=getProject(t.projectId);msg+=`â€¢ ${t.title}${t.dueTime?' '+t.dueTime:''}${p?' â€” '+p.name:''}\n`;});}
  return msg?`ðŸ“‹ <b>click.1986 â€” Resumen</b>\n\n${msg}`:'';
}
function buildWeeklySummary(){
  const today=localDateStr(0);const weekEnd=localDateStr(7);const pending=state.tasks.filter(t=>t.status!=='completado');const dueThisWeek=pending.filter(t=>t.dueDate&&t.dueDate>=today&&t.dueDate<=weekEnd);const overdue=pending.filter(t=>t.dueDate&&t.dueDate<today);let msg=`ðŸ“… <b>click.1986 â€” Resumen Semanal</b>\n\nðŸ“Œ Tareas activas: <b>${pending.length}</b>\nâš ï¸ Vencidas: <b>${overdue.length}</b>\nðŸ“† Esta semana: <b>${dueThisWeek.length}</b>\n\n`;if(dueThisWeek.length){msg+=`<b>Esta semana:</b>\n`;dueThisWeek.forEach(t=>{const p=getProject(t.projectId);msg+=`â€¢ ${t.title} â€” ${formatDate(t.dueDate,t.dueTime)}${p?' ('+p.name+')':''}\n`;});}return msg;
}
function checkDueTasks(mode='daily'){
  const now=new Date(),today=localDateStr(0),tomorrow=localDateStr(1);
  const currentTime=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  if(mode==='hourly'){const msg=buildHourlySummary(currentTime,today);if(msg)sendTelegram(msg,{silent:true});return;}
  const msg=buildDailySummary();
  if(msg)sendTelegram(msg,{silent:true});
}
async function sendWeeklySummary(){const msg=buildWeeklySummary();if(msg)sendTelegram(msg,{silent:true});}
function startNotificationScheduler(){
  if(!telegramWebhook)return;
  const today=localDateStr(0);const last=localStorage.getItem(STORAGE_KEYS.notif);
  if(last!==today){setTimeout(()=>{checkDueTasks('daily');localStorage.setItem(STORAGE_KEYS.notif,today);},4000);}
  const dayOfWeek=new Date().getDay();const thisWeek=new Date().toISOString().slice(0,7)+'-W'+Math.ceil(new Date().getDate()/7);const lastWeekly=localStorage.getItem(STORAGE_KEYS.weekly);
  if(dayOfWeek===1&&lastWeekly!==thisWeek){setTimeout(()=>{sendWeeklySummary();localStorage.setItem(STORAGE_KEYS.weekly,thisWeek);},6000);}
  setInterval(()=>{checkDueTasks('hourly');},900000);
  setInterval(()=>{const now=localDateStr(0);const l=localStorage.getItem(STORAGE_KEYS.notif);if(l!==now){checkDueTasks('daily');localStorage.setItem(STORAGE_KEYS.notif,now);}},3600000);
}
window.enviarResumenTelegram=async function(){
  if(!telegramWebhook){
    const configured=window.configureTelegramWebhook();
    if(!configured)return;
  }
  const summary=buildDailySummary();
  if(!summary){
    showToast('No hay tareas para resumir','success');
    return;
  }
  const sent=await sendTelegram(summary,{silent:false});
  if(sent)showToast('ðŸ“¨ Enviado a Telegram','success');
}

/* INIT */
function updateClock(){
  const now=new Date();
  const time=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  const date=now.toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
  const te=document.getElementById('clock-time');const de=document.getElementById('clock-date');
  if(te)te.textContent=time;if(de)de.textContent=date;
}
updateClock();setInterval(updateClock,1000);
loadState().then(()=>startNotificationScheduler());
window.addEventListener('online',()=>loadState());
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(e=>console.log('SW:',e));});}
let deferredPrompt2;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt2=e;const topbar=document.querySelector('.topbar');if(topbar&&!document.getElementById('install-btn')){const btn=document.createElement('button');btn.id='install-btn';btn.className='btn btn-ghost btn-sm';btn.style.cssText='border-color:var(--accent);color:var(--accent)';btn.innerHTML='â¬‡';btn.onclick=()=>{deferredPrompt2.prompt();deferredPrompt2.userChoice.then(()=>{deferredPrompt2=null;btn.remove();});};topbar.insertBefore(btn,topbar.querySelector('.btn-primary'));}});
