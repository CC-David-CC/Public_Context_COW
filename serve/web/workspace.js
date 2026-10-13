// The server owns durable history. Browser messages are a rendering projection.
"use strict";
const ContextWorkspace = {
  enabled:false,current:null,chats:[],branches:[],loading:false,
  icons:{
    fork:'<path d="M7 19V5m0 7c0-5 10-1 10-7"/><path d="m14 7 3-3 3 3"/><circle cx="7" cy="20" r="2"/><circle cx="7" cy="4" r="2"/>',
    rewind:'<path d="M4 10a8 8 0 1 1 1 9M4 4v6h6"/>',
    add:'<path d="M12 5v14M5 12h14"/>',
    export:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
    pencil:'<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',
    name:'<path d="M3 4h9l9 9-8 8-10-10z"/><circle cx="7" cy="8" r="1"/><path d="m12 12 4 4"/>',
    clear:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    archive:'<path d="m7 7 10 10M17 7 7 17"/>',
    unarchive:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    teach:'<path d="M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14"/>'
  },
  iconButton(button,label,icon) {
    button.replaceChildren();button.classList.add('cow-icon');button.setAttribute('aria-label',label);button.removeAttribute('title');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=this.icons[icon];button.append(svg);
    const span=document.createElement('span');span.className='control-label';span.textContent=label;button.append(span);return button;
  },
  appearance() {
    for(const [id,label,icon] of [['new-btn','New chat','add'],['export-btn','Export','export'],['rename-chat-btn','Name chat','pencil'],['rename-branch-btn','Name branch','name'],['clear-branch-btn','Clear branch','clear'],['restore-point-btn','Restore point','rewind'],['teaching-btn','Show control labels','teach']])
      this.iconButton($(id),label,icon);
    const teaching=store.get('workspace.teaching',false);document.documentElement.dataset.teaching=String(teaching);$('teaching-btn').setAttribute('aria-pressed',String(teaching));
    $('teaching-btn').onclick=()=>{const on=document.documentElement.dataset.teaching!=='true';document.documentElement.dataset.teaching=String(on);store.set('workspace.teaching',on);$('teaching-btn').setAttribute('aria-pressed',String(on));};
  },
  async request(path,body) {
    const response=await fetch('workspace/'+path,{method:body===undefined?'GET':'POST',headers:headers(body!==undefined),body:body===undefined?undefined:JSON.stringify(body)});
    let data;try { data=await response.json(); } catch(e) { throw Error('The server did not return a chat response.'); }
    if(!response.ok) { const error=Error(data.error?.message || `HTTP ${response.status}`);error.status=response.status;throw error; }
    return data;
  },
  operation() { return crypto.randomUUID(); },
  async init() {
    if(this.loading || busy)return;
    this.appearance();
    this.loading=true;
    try {
      this.chats=(await this.request('chats')).chats;
      this.enabled=true;
      for(const id of ['workspace-sidebar','workspace-controls','workspace-state'])$(id).hidden=false;
      $('new-btn').onclick=()=>this.create();
      $('branch-select').onchange=()=>this.select($('branch-select').value).catch(e=>this.error(e));
      $('rename-chat-btn').onclick=()=>this.renameChat();
      $('rename-branch-btn').onclick=()=>this.renameBranch();
      $('clear-branch-btn').onclick=()=>this.clear();
      $('restore-point-btn').onclick=()=>this.rewind($('restore-point').value);
      $('show-archived').onchange=()=>this.refreshList().catch(e=>this.error(e));
      if(messages.length && !store.get('workspace.imported',false)) {
        let operation=store.get('workspace.import-operation',null);
        if(!operation){operation=this.operation();store.set('workspace.import-operation',operation);}
        const imported=await this.request('import',{title:'Imported browser chat',messages,operation_id:operation});
        store.set('workspace.imported',true);store.set('workspace.branch',imported.branch.id);
        await this.refreshList();
      }
      const remembered=store.get('workspace.branch',null);
      if(remembered) {
        try { await this.select(remembered);return; } catch(e) { if(e.status!==404)throw e; }
      }
      if(this.chats.length)await this.openChat(this.chats[0].id);
      else await this.makeChat('My first chat');
    } catch(e) {
      if(e.status!==404)this.error(e);
    } finally {this.loading=false;}
  },
  error(error) {toast('error','Chat action failed',error.message,7000);},
  modal(title,help,value,action,button='Save') {
    if(busy){toast('info','Wait for this answer','Stop or finish it before changing branches.');return;}
    const dialog=$('workspace-dialog');$('workspace-dialog-title').textContent=title;$('workspace-dialog-help').textContent=help;
    $('workspace-name').hidden=value===null;$('workspace-name-label').hidden=value===null;
    $('workspace-name').value=value || '';$('workspace-confirm').textContent=button;
    $('workspace-cancel').onclick=()=>dialog.close();
    $('workspace-confirm').onclick=async()=>{
      const name=$('workspace-name').value.trim();
      if(value!==null&&!name){$('workspace-name').focus();return;}
      $('workspace-confirm').disabled=true;
      try {await action(name);dialog.close();}catch(e){this.error(e);}finally{$('workspace-confirm').disabled=false;}
    };
    $('workspace-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('workspace-confirm').click();}};
    dialog.showModal();if(value!==null){$('workspace-name').focus();$('workspace-name').select();}
  },
  async refreshList() {
    this.chats=(await this.request('chats'+($('show-archived').checked?'?archived=true':''))).chats;
    const list=$('chat-list');list.replaceChildren();
    for(const chat of this.chats) {
      const button=document.createElement('button');button.type='button';button.className='workspace-chat';button.setAttribute('aria-current',String(this.current?.chat_id===chat.id));
      const title=document.createElement('strong');title.textContent=chat.title;button.append(title);
      const subtitle=document.createElement('small');subtitle.textContent=chat.archived?'Archived · click to open':new Date(chat.created_at*1000).toLocaleDateString();button.append(subtitle);
      button.onclick=()=>this.openChat(chat.id).catch(e=>this.error(e));
      const row=document.createElement('div');row.className='workspace-chat-row';row.append(button);
      const archive=document.createElement('button');archive.type='button';archive.className='st-btn workspace-chat-archive';archive.dataset.archiveChat=chat.id;
      if(this.current?.chat_id===chat.id)archive.id='archive-chat-btn';
      this.iconButton(archive,chat.archived?'Unarchive chat':'Archive chat',chat.archived?'unarchive':'archive');
      archive.onclick=()=>this.archive(chat).catch(e=>this.error(e));row.append(archive);list.append(row);
    }
  },
  async openChat(chat) {
    if(busy)throw Error('Wait for the answer before switching chats.');
    this.branches=(await this.request('branches?chat='+encodeURIComponent(chat))).branches;
    if(!this.branches.length)throw Error('This chat has no retained branch.');
    await this.select(this.branches[0].id);
  },
  async select(branch) {
    if(busy)throw Error('Wait for the answer before switching branches.');
    const history=await this.request('history?branch='+encodeURIComponent(branch));
    this.current=history;messages=history.messages;attachments=[];renderAttachments();renderChat();
    store.set('workspace.branch',branch);
    this.branches=(await this.request('branches?chat='+encodeURIComponent(history.chat_id))).branches;
    const selector=$('branch-select');selector.replaceChildren();
    for(const b of this.branches){const option=document.createElement('option');option.value=b.id;option.textContent=b.name;selector.append(option);}selector.value=branch;
    // Include archived metadata without forcing the archived list open.
    const catalog=(await this.request('chats?archived=true')).chats;
    const chat=catalog.find(c=>c.id===history.chat_id);$('workspace-title').textContent=chat?.title || 'Chat';
    $('workspace-save-state').textContent=history.pending_request?'Answer in progress in another tab':`${messages.length} saved messages · replay mode`;
    $('workspace-save-state').title='Serving receives the selected history and may reuse its prompt/conversation checkpoints. Native GPU COW handles are not connected to this interface yet.';
    const points=$('restore-point');points.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Choose a saved point';points.append(prompt);
    const added=new Set();
    for(const move of history.moves){if(added.has(move.from_node))continue;added.add(move.from_node);const option=document.createElement('option');option.value=move.from_node;option.textContent='Before change '+move.revision;points.append(option);}
    await this.refreshList();
  },
  async makeChat(title) {
    const chat=await this.request('chats/create',{title,operation_id:this.operation()});await this.select(chat.branch.id);
  },
  create() {this.modal('New chat','Your current chat stays in the list.','New chat',name=>this.makeChat(name),'Create chat');},
  async direct(action) {
    if(busy){toast('info','Wait for this answer','Stop or finish it before changing branches.');return;}
    if(this.moving)return;
    this.moving=true;
    const controls=['branch-select','clear-branch-btn','restore-point','restore-point-btn'].map($);
    controls.forEach(control=>control.disabled=true);
    try {await action();} catch(e){this.error(e);} finally {this.moving=false;controls.forEach(control=>control.disabled=false);}
  },
  fork(node) {
    return this.direct(async()=>{
      const name=`Alternative ${this.branches.length}`;
      const branch=await this.request('branches/fork',{branch_id:this.current.id,node_id:node,name,operation_id:this.operation()});await this.select(branch.id);
      toast('info','Branch created',name);
    });
  },
  rewind(node) {
    if(!node)return;
    return this.direct(async()=>{
      const branch=await this.request('branches/rewind',{branch_id:this.current.id,revision:this.current.revision,node_id:node,operation_id:this.operation()});await this.select(branch.id);
      toast('info','Point restored','The previous tip is in Saved points.');
    });
  },
  clear() {
    return this.direct(async()=>{
      const branch=await this.request('branches/clear',{branch_id:this.current.id,revision:this.current.revision,operation_id:this.operation()});await this.select(branch.id);
      toast('info','Branch cleared','Restore its previous tip from Saved points.');
    });
  },
  renameChat() {this.modal('Name this chat','Use a name you can find in the chat list.',$('workspace-title').textContent,async title=>{await this.request('chats/rename',{chat_id:this.current.chat_id,title});await this.select(this.current.id);});},
  renameBranch() {this.modal('Name this branch','The name does not change its history.',this.current.name,async name=>{await this.request('branches/rename',{branch_id:this.current.id,name});await this.select(this.current.id);});},
  async archive(chat) {
    if(busy)throw Error('Wait for the answer before archiving a chat.');
    await this.request('chats/archive',{chat_id:chat.id,archived:!chat.archived});await this.refreshList();
    toast('info',chat.archived?'Chat restored':'Chat archived','Its saved messages remain in SQLite.');
  },
  messageActions(message) {
    if(!this.enabled||!message.node_id)return null;
    const actions=document.createElement('div');actions.className='workspace-message-actions';
    for(const [text,kind,callback] of [['Fork here','fork',()=>this.fork(message.node_id)],['Rewind here','rewind',()=>this.rewind(message.node_id)]]) {
      const button=document.createElement('button');button.type='button';button.className='st-btn st-btn--secondary';this.iconButton(button,text,kind);button.dataset['workspace'+kind[0].toUpperCase()+kind.slice(1)]=message.node_id;
      button.onclick=callback;actions.append(button);
    }
    return actions;
  },
  generation(body,user) {
    if(!this.enabled)return 'v1/chat/completions';
    if(!this.current)throw Error('Select a chat before sending a message.');
    Object.assign(body,{branch_id:this.current.id,revision:this.current.revision,message:user,operation_id:this.operation()});delete body.messages;
    $('workspace-save-state').textContent='Answer in progress · not saved yet';return 'workspace/generate';
  },
  async afterGeneration() {
    if(!this.enabled)return;
    await this.select(this.current.id);
  }
};
