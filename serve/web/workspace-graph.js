"use strict";
// A transient view of canonical history. No messages or branch heads are stored here.
const ContextGraph = {
  data:null,epoch:0,stale:false,timer:null,initialized:false,
  init() {
    if(this.initialized)return;this.initialized=true;
    const viewer=$('branch-viewer');viewer.hidden=false;viewer.open=store.get('workspace.graph-open',true);
    viewer.ontoggle=()=>store.set('workspace.graph-open',viewer.open);
    $('graph-previous').checked=store.get('workspace.graph-previous',false);
    $('graph-previous').onchange=()=>{store.set('workspace.graph-previous',$('graph-previous').checked);this.refresh();};
    $('graph-refresh').onclick=()=>ContextWorkspace.select(ContextWorkspace.current.id).catch(e=>this.failed(e));
  },
  failed(error) {
    this.stale=true;$('graph-status').textContent='Paths need refreshing: '+error.message;$('graph-refresh').hidden=false;
    this.disableActions();
  },
  disableActions() {
    for(const button of $('graph-inspector').querySelectorAll('.workspace-message-actions button'))button.disabled=this.stale || !!busy || !!ContextWorkspace.moving;
    for(const button of $('graph-canvas').querySelectorAll('[data-graph-branch]'))button.disabled=this.stale || !!busy || !!ContextWorkspace.moving;
  },
  async refresh() {
    const current=ContextWorkspace.current;if(!current)return;
    const epoch=++this.epoch;const branch=current.id;const chat=current.chat_id;
    if(this.data?.chat_id!==chat){this.data=null;$('graph-canvas').replaceChildren();$('graph-inspector').hidden=true;}
    try {
      const data=await ContextWorkspace.request('graph?chat='+encodeURIComponent(chat)+($('graph-previous').checked?'&previous=true':''));
      if(epoch!==this.epoch || ContextWorkspace.current?.id!==branch)return;
      this.data=data;
      const head=data.branches.find(b=>b.id===branch);
      this.stale=!busy && (!head || head.revision!==ContextWorkspace.current.revision);
      $('graph-status').textContent=this.stale?'This branch changed. Refresh paths before editing.':'';
      $('graph-refresh').hidden=!this.stale;
      $('graph-inspector').hidden=true;this.render();
    } catch(e) {if(epoch===this.epoch && ContextWorkspace.current?.id===branch)this.failed(e);}
  },
  setBusy(on) {
    if(!ContextWorkspace.enabled)return;
    if(this.timer){clearInterval(this.timer);this.timer=null;}
    if(on)this.timer=setInterval(()=>this.refresh(),2000);
    if(this.data)this.render();
    this.disableActions();
  },
  model(data) {
    const nodes=new Map(data.nodes.map(n=>[n.id,n]));const children=new Map(data.nodes.map(n=>[n.id,[]]));
    for(const node of data.nodes)if(node.parent_id)children.get(node.parent_id).push(node.id);
    const tips=new Set(data.branches.map(b=>b.tip));for(const p of data.previous_tips)tips.add(p.node_id);
    const critical=new Set(data.nodes.filter(n=>n.parent_id===null || children.get(n.id).length!==1 || tips.has(n.id)).map(n=>n.id));
    const lane=new Map();data.branches.forEach((b,i)=>lane.set(b.tip,Math.min(lane.get(b.tip)??Infinity,i)));
    data.previous_tips.forEach((p,i)=>lane.set(p.node_id,Math.min(lane.get(p.node_id)??Infinity,data.branches.length+i)));
    for(let i=data.nodes.length-1;i>=0;i--){const n=data.nodes[i];for(const child of children.get(n.id))lane.set(n.id,Math.min(lane.get(n.id)??Infinity,lane.get(child)??Infinity));}
    const anchors=[data.root_id],edges=[],column=new Map([[data.root_id,0]]);
    for(const id of anchors){
      for(const first of children.get(id)){
        const chain=[first];let end=first;
        while(!critical.has(end)){end=children.get(end)[0];chain.push(end);}
        anchors.push(end);column.set(end,column.get(id)+1);edges.push({from:id,to:end,chain});
      }
    }
    const selected=new Set();let tip=data.branches.find(b=>b.id===ContextWorkspace.current?.id)?.tip;
    while(tip && nodes.has(tip)){selected.add(tip);tip=nodes.get(tip).parent_id;}
    const position=new Map(anchors.map(id=>[id,{x:36+column.get(id)*250,y:42+(lane.get(id)||0)*88}]));
    let width=0;for(const id of anchors)width=Math.max(width,position.get(id).x);
    return {nodes,children,anchors,edges,position,selected,width:width+270,height:Math.max(1,data.branches.length+data.previous_tips.length)*88+36};
  },
  render() {
    if(!this.data)return;
    const data=this.data,model=this.model(data),canvas=$('graph-canvas');canvas.replaceChildren();
    $('graph-summary').textContent=data.branches.length===1?'No fork yet':data.shared_prefix_messages?`Shared core: ${data.shared_prefix_messages} messages`:'No shared messages';
    canvas.style.width=model.width+'px';canvas.style.height=model.height+'px';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',model.width);svg.setAttribute('height',model.height);svg.setAttribute('aria-hidden','true');canvas.append(svg);
    const path=(from,to,classes)=>{
      const line=document.createElementNS(svg.namespaceURI,'path');
      const curve=to.x-from.x>90?`M ${from.x} ${from.y} C ${from.x+50} ${from.y}, ${from.x+50} ${to.y}, ${from.x+90} ${to.y} L ${to.x} ${to.y}`:`M ${from.x} ${from.y} C ${from.x+20} ${from.y}, ${to.x-20} ${to.y}, ${to.x} ${to.y}`;
      line.setAttribute('d',curve);line.setAttribute('class',classes);svg.append(line);
    };
    const button=(label,x,y,classes,callback)=>{
      const b=document.createElement('button');b.type='button';b.className=classes;b.textContent=label;b.style.left=x+'px';b.style.top=y+'px';b.onclick=callback;canvas.append(b);return b;
    };
    for(const edge of model.edges){
      const from=model.position.get(edge.from),to=model.position.get(edge.to),node=model.nodes.get(edge.to);
      const faded=!node.current_branch_count;const selected=model.selected.has(edge.to);
      path(from,to,'graph-line'+(faded?' graph-old':selected?' graph-selected':''));
      const owners=node.current_branch_count;const count=edge.chain.length;
      const text=owners>1?`${count} shared · ${owners} branches`:`${count} ${count===1?'message':'messages'}`;
      const b=button(text,(from.x+to.x)/2-70,to.y-16,'graph-segment'+(faded?' graph-old':''),()=>this.inspect(edge.chain,model));
      b.setAttribute('aria-label',`Inspect ${count} saved ${count===1?'message':'messages'}${owners>1?', shared by '+owners+' branches':''}`);b.dataset.graphSegment=edge.to;
    }
    for(const id of model.anchors){
      const node=model.nodes.get(id),point=model.position.get(id);
      const b=button(node.depth?'':'Start',point.x-8,point.y-8,'graph-dot'+(model.selected.has(id)?' graph-selected':'')+(!node.current_branch_count?' graph-old':''),()=>this.inspect(node.depth?[id]:[],model));
      b.setAttribute('aria-label',node.depth?`Inspect message ${node.depth}: ${node.role}`:'Inspect chat start');b.dataset.graphNode=id;
    }
    data.branches.forEach((branch,i)=>{
      const point=model.position.get(branch.tip),y=42+i*88;
      if(point.y!==y)path(point,{x:point.x+26,y},'graph-line');
      const answering=!!branch.pending_request || (!!busy && ContextWorkspace.current.id===branch.id);
      const b=button(branch.name,point.x+24,y-25,'graph-tip'+(branch.id===ContextWorkspace.current.id?' graph-selected':''),()=>ContextWorkspace.select(branch.id).catch(e=>ContextWorkspace.error(e)));
      const small=document.createElement('small');small.textContent=`${branch.saved_messages} saved messages${answering?' · answering…':''}`;b.append(small);
      b.setAttribute('aria-label',`Open ${branch.name}, ${branch.saved_messages} saved messages`);b.setAttribute('aria-current',String(branch.id===ContextWorkspace.current.id));b.dataset.graphBranch=branch.id;
    });
    data.previous_tips.forEach((tip,i)=>{
      const point=model.position.get(tip.node_id),y=42+(data.branches.length+i)*88;const branch=data.branches.find(b=>b.id===tip.branch_id);
      if(point.y!==y)path(point,{x:point.x+26,y},'graph-line graph-old');
      const label=`Previous ${branch?.name || 'path'} · ${model.nodes.get(tip.node_id).depth} messages`;
      const b=button(label,point.x+24,y-18,'graph-tip graph-old',()=>this.inspect([tip.node_id],model));b.dataset.graphPrevious=tip.node_id;
    });
    this.disableActions();
  },
  inspect(ids,model,page=0) {
    const panel=$('graph-inspector');panel.replaceChildren();panel.hidden=false;
    const header=document.createElement('div');header.className='graph-inspector-head';
    const title=document.createElement('strong');title.textContent=ids.length?`Saved messages ${model.nodes.get(ids[0]).depth}–${model.nodes.get(ids.at(-1)).depth}`:'Chat start';header.append(title);
    const close=document.createElement('button');close.type='button';close.className='st-btn';close.textContent='×';close.setAttribute('aria-label','Close preview');close.onclick=()=>{panel.hidden=true;$('branch-viewer').scrollTop=0;};header.append(close);panel.append(header);
    if(!ids.length){const note=document.createElement('p');note.textContent='No messages before this point.';panel.append(note);panel.scrollIntoView({block:'nearest',inline:'nearest'});return;}
    for(const id of ids.slice(page*10,page*10+10)){
      const node=model.nodes.get(id),row=document.createElement('div');row.className='graph-preview';
      const label=document.createElement('strong');label.textContent=`${node.depth}. ${node.role==='user'?'You':'Answer'}${node.current_branch_count>1?' · shared by '+node.current_branch_count+' branches':''}`;row.append(label);
      const preview=document.createElement('p');preview.textContent=node.preview || '(No text)';row.append(preview);
      const actions=ContextWorkspace.messageActions({node_id:id});row.append(actions);panel.append(row);
    }
    if(ids.length>10){
      const controls=document.createElement('div');controls.className='graph-pages';
      for(const [text,offset,disabled] of [['Previous',-1,page===0],['Next',1,(page+1)*10>=ids.length]]){
        const b=document.createElement('button');b.type='button';b.className='st-btn st-btn--secondary';b.textContent=text;b.disabled=disabled;b.onclick=()=>this.inspect(ids,model,page+offset);controls.append(b);
      }
      const count=document.createElement('span');count.textContent=`${page*10+1}–${Math.min((page+1)*10,ids.length)} of ${ids.length}`;controls.append(count);panel.append(controls);
    }
    this.disableActions();
    panel.scrollIntoView({block:'nearest',inline:'nearest'});
  }
};
