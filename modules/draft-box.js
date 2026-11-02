/**
 * 临时草稿箱：最多 5 份，最后保存后 24 小时过期；使用当前标签页 sessionStorage。
 * 与原有模板数据隔离，恢复通过已存在的 yuqing 模块快照渲染完成。
 */
(function(window,document){
'use strict';
const KEY='cctv_temp_drafts_v1',MAX=5,TTL=24*60*60*1000;
const $=selector=>document.querySelector(selector);
const copy=value=>JSON.parse(JSON.stringify(value));
const validMode=mode=>mode==='richang'||mode==='quantao';
const validCategory=c=>c==='zhengmian'?'zhengmian':'yuqing';
const store=window.sessionStorage;
let drafts=[], activeId=null, working=false, unboundDirty=false;
const panel=$('#uiDraftPanel'),list=$('#uiDraftList'),counter=$('#uiDraftCount'),status=$('#uiDraftStatus');
function feedback(message,error=false){
    if(!status)return;
    status.textContent=message;
    status.classList.toggle('is-error',error);
}
function notifyError(message){feedback(message,true);}
function persist(next){
    try{store.setItem(KEY,JSON.stringify(next));return true;}
    catch(e){notifyError('草稿暂存失败：浏览器存储空间不足或已禁用。操作已取消。');return false;}
}
function prune(){
    const now=Date.now(),next=drafts.filter(d=>d && d.id &&
        validMode(d.mode) && Array.isArray(d.content) &&
        Number.isFinite(d.updatedAt) && d.updatedAt<=now && now-d.updatedAt<TTL);
    if(next.length!==drafts.length){
        if(persist(next)){
            drafts=next;
            if(activeId&&!drafts.some(d=>d.id===activeId))activeId=null;
        }
    }
}
function load(){
    try{
        const value=JSON.parse(store.getItem(KEY)||'[]');
        drafts=Array.isArray(value)?value.slice(0,MAX):[];
    }catch(e){drafts=[];notifyError('无法读取旧草稿，已有内容暂时不会被覆盖。');}
    prune();render();
}
function label(d){
    const section=d.category==='zhengmian'?'正面':'舆情';
    return (d.mode==='quantao'?'全套':'日常')+' · '+section;
}
function makeName(content,fallback){
    for(const row of content){
        if(!Array.isArray(row)||!row.length)continue;
        if(row[0]?.text==='标题：'){
            const value=row.slice(1).map(x=>x.text||'').join('').trim();
            if(value)return value.slice(0,30);
        }
    }
    for(const row of content){
        if(!Array.isArray(row)||row[0]?.text!=='内容：')continue;
        const value=row.filter(x=>x.type==='textarea').map(x=>x.text||'').join(' ').trim();
        if(value)return value.slice(0,28);
    }
    return fallback;
}
function capture(){
    const App=window.App;
    if(!App||!validMode(App.state.currM))return null;
    const mod=window.__modules?.richang;
    if(!mod||!mod.container?.querySelector('.module-row')||typeof mod.syncUIData!=='function')
        return null;
    mod.syncUIData();
    return {mode:App.state.currM,category:validCategory(App.state.currS),content:copy(mod.nowTemp)};
}
function saveSnapshot(snapshot,assignedId,announce){
    prune();
    if(!snapshot){notifyError('请先进入日常或全套监测，再保存草稿');return false;}
    const existing=assignedId?drafts.find(d=>d.id===assignedId):null;
    if(!existing&&drafts.length>=MAX){
        notifyError('草稿箱已满（5/5），请先删除一份。当前内容未改变。');
        return false;
    }
    const now=Date.now();
    const id=existing?.id || ('draft-'+now+'-'+Math.random().toString(36).slice(2,8));
    const fallback=existing?.name || ('临时草稿 '+(drafts.length+1));
    const value={id,name:makeName(snapshot.content,fallback),mode:snapshot.mode,
        category:snapshot.category,content:snapshot.content,
        createdAt:existing?.createdAt||now,updatedAt:now};
    const next=existing?drafts.map(d=>d.id===id?value:d):[...drafts,value];
    if(!persist(next))return false;
    drafts=next;activeId=id;unboundDirty=false;render();
    if(announce)feedback(existing?'已更新当前草稿':'已保存一份新草稿');
    return true;
}
function saveCurrent(){
    if(working)return false;
    return saveSnapshot(capture(),activeId,true);
}
async function applySnapshot(snapshot){
    const App=window.App;
    App.state.currM=snapshot.mode;
    App.state.activeTemplateData=null;
    App.state.currS=validCategory(snapshot.category);
    App.renderMainTabs();
    App.EventBus.emit('tabChange',snapshot.mode);
    await App.renderModule();
    // 仍经由原有子标签入口更新舆情/正面标识与标题。
    const sub=document.querySelector('#yuqingTab span[data-s="'+App.state.currS+'"]');
    if(sub)sub.click();
    const mod=window.__modules?.richang;
    if(!mod||typeof mod.render!=='function'||typeof mod.updatePreview!=='function')
        throw new Error('主模块尚未准备好');
    mod.nowTemp=copy(snapshot.content);
    mod.updateTitleKeywords();
    mod.render();
    mod.updatePreview();
}
async function restore(id){
    if(working)return;
    prune();
    const initialTarget=drafts.find(d=>d.id===id);
    if(!initialTarget){notifyError('草稿已过期或已删除');render();return;}

    const prior=capture(),priorId=activeId;
    // 已绑定的草稿先更新。未绑定的表单只有被编辑过才占用新草稿位，
    // 避免刚清空的空白表单、页面初始模板在“打开”时误创建草稿。
    if(prior && (activeId || unboundDirty)){
        if(!saveSnapshot(prior,activeId,false))return;
    }
    // 先保存、再重新取得目标对象：恢复“当前”ID 时也必须真正渲染到表单。
    const target=drafts.find(d=>d.id===id);
    if(!target){notifyError('目标草稿不存在');return;}

    working=true;
    try{
        await applySnapshot(target);
        activeId=id;
        unboundDirty=false;
        render();
        feedback('已打开「'+target.name+'」，内容已恢复到表单');
        window.TempDraftUI?.open(false);
    }catch(error){
        console.error('[临时草稿箱] 恢复失败',error);
        if(prior){
            try{
                await applySnapshot(prior);
                activeId=priorId;
            }catch(rollbackError){console.error('[临时草稿箱] 回退失败',rollbackError);}
        }
        render();
        notifyError('恢复失败，已尽力保留此前表单内容');
    }finally{working=false;}
}
function remove(id){
    if(working)return;
    const item=drafts.find(d=>d.id===id);
    if(!item)return;
    if(!window.confirm('删除临时草稿「'+item.name+'」？'))return;
    const next=drafts.filter(d=>d.id!==id);
    if(!persist(next))return;
    drafts=next;
    if(activeId===id)activeId=null; // 删除索引不清空屏幕上的表单
    render();feedback('草稿已删除，当前表单不受影响');
}
function syncCleared(detail){
    // clearAll 原事件已完成用户确认与表单清空。
    // 清空前读取旧 ID，用来解除当前绑定；绝不把空白内容写回已存草稿。
    const previousId=detail?.draftId||null;
    if(previousId && previousId!==activeId)return;
    activeId=null;
    unboundDirty=false;
    render();
    feedback(previousId?'当前表单已清空，原草稿保留；下次保存会新建':'当前表单已清空，可以保存为新草稿');
}
function render(){
    if(!list)return;
    list.replaceChildren();
    counter.textContent=drafts.length+'/'+MAX;
    if(!drafts.length){
        const div=document.createElement('p');
        div.className='ui-draft-empty';div.textContent='暂无草稿。在主页面点击「保存为草稿」即可添加。';
        list.append(div);return;
    }
    const now=Date.now();
    const sorted=[...drafts].sort((a,b)=>b.updatedAt-a.updatedAt);
    for(const d of sorted){
        const card=document.createElement('div');
        card.className='ui-draft-card'+(d.id===activeId?' is-current':'');
        const info=document.createElement('div');info.className='ui-draft-info';
        const name=document.createElement('div');name.className='ui-draft-title';
        name.textContent=d.name;name.title=d.name;
        const meta=document.createElement('div');meta.className='ui-draft-meta';
        const remain=Math.max(1,Math.ceil((TTL-(now-d.updatedAt))/(60*60*1000)));
        meta.textContent=label(d)+' · 剩余约 '+remain+' 小时'+(d.id===activeId?' · 当前':'');
        info.append(name,meta);
        const actions=document.createElement('div');actions.className='ui-draft-controls';
        const open=document.createElement('button');open.type='button';
        open.textContent='打开';
        open.addEventListener('click',()=>restore(d.id));
        const del=document.createElement('button');del.type='button';del.className='ui-draft-delete';
        del.textContent='删除';del.addEventListener('click',()=>remove(d.id));
        actions.append(open,del);card.append(info,actions);list.append(card);
    }
}
function init(){
    if(!$('#uiDraftPanel')||!window.App)return;
    load();
    // 仅在新内容确实发生变化时，切换前才需要另存一份临时草稿。
    document.getElementById('moduleContainer')?.addEventListener('input',()=>{
        if(!activeId&&!working)unboundDirty=true;
    });
    document.getElementById('moduleContainer')?.addEventListener('change',()=>{
        if(!activeId&&!working)unboundDirty=true;
    });
    document.getElementById('moduleContainer')?.addEventListener('click',event=>{
        if(!activeId&&!working&&event.target.closest('#smartParseBtn'))unboundDirty=true;
    },true);
    window.App.EventBus.on('contentCleared',syncCleared);
    window.TempDraftBox={saveCurrent,getActiveId:()=>activeId,restore,prune};
    window.setInterval(()=>{prune();render();},60*1000);
}
function boot(){
    if(window.App&&$('#uiDraftPanel'))init();
    else{
        let n=0;
        const timer=setInterval(()=>{
            if(window.App&&$('#uiDraftPanel')){clearInterval(timer);init();}
            else if(++n>=60)clearInterval(timer);
        },100);
    }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})(window,document);
