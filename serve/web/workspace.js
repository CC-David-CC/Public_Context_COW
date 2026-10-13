// The server owns durable history. Browser messages are a rendering projection.
"use strict";
const ContextWorkspace = {
  enabled:false,current:null,chats:[],branches:[],loading:false,
  async request(path,body) {
    const response=await fetch('workspace/'+path,{method:body===undefined?'GET':'POST',headers:headers(body!==undefined),body:body===undefined?undefined:JSON.stringify(body)});
    let data;try { data=await response.json(); } catch(e) { throw Error('The server did not return a chat response.'); }
    if(!response.ok) { const error=Error(data.error?.message || `HTTP ${response.status}`);error.status=response.status;throw error; }
    return data;
  },
  operation() { return crypto.randomUUID(); },
  async init() {
    if(this.loading || busy)return;
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
      $('archive-chat-btn').onclick=()=>this.archive();
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
      button.onclick=()=>this.openChat(chat.id).catch(e=>this.error(e));list.append(button);
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
    $('archive-chat-btn').textContent=chat?.archived?'Unarchive chat':'Archive chat';
    $('workspace-save-state').textContent=history.pending_request?'Answer in progress in another tab':`${messages.length} saved messages · replay mode`;
    $('workspace-save-state').title='Ordinary serving uses the selected history. Native GPU COW handles are not connected to this interface yet.';
    const points=$('restore-point');points.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Choose a saved point';points.append(prompt);
    const added=new Set();
    for(const move of history.moves){if(added.has(move.from_node))continue;added.add(move.from_node);const option=document.createElement('option');option.value=move.from_node;option.textContent='Before change '+move.revision;points.append(option);}
    await this.refreshList();
  },
  async makeChat(title) {
    const chat=await this.request('chats/create',{title,operation_id:this.operation()});await this.select(chat.branch.id);
  },
  create() {this.modal('New chat','Your current chat stays in the list.','New chat',name=>this.makeChat(name),'Create chat');},
  fork(node) {
    this.modal('Fork here','Start a new branch at this message. The original branch stays unchanged.',`Alternative ${this.branches.length}`,async name=>{
      const branch=await this.request('branches/fork',{branch_id:this.current.id,node_id:node,name,operation_id:this.operation()});await this.select(branch.id);
    },'Create branch');
  },
  rewind(node) {
    if(!node)return;
    this.modal('Restore this point?','The branch returns here. Later messages remain available in Saved points.',null,async()=>{
      const branch=await this.request('branches/rewind',{branch_id:this.current.id,revision:this.current.revision,node_id:node,operation_id:this.operation()});await this.select(branch.id);
    },'Restore point');
  },
  clear() {
    this.modal('Clear this branch?','This empties only the selected branch. Other branches stay unchanged. You can restore the old tip from Saved points.',null,async()=>{
      const branch=await this.request('branches/clear',{branch_id:this.current.id,revision:this.current.revision,operation_id:this.operation()});await this.select(branch.id);
    },'Clear branch');
  },
  renameChat() {this.modal('Name this chat','Use a name you can find in the chat list.',$('workspace-title').textContent,async title=>{await this.request('chats/rename',{chat_id:this.current.chat_id,title});await this.select(this.current.id);});},
  renameBranch() {this.modal('Name this branch','The name does not change its history.',this.current.name,async name=>{await this.request('branches/rename',{branch_id:this.current.id,name});await this.select(this.current.id);});},
  archive() {
    const archived=$('archive-chat-btn').textContent==='Unarchive chat';
    this.modal(archived?'Unarchive chat?':'Archive this chat?',archived?'Move this chat back to the normal list.':'Hide this chat from the normal list. Show archived lets you reopen it.',null,async()=>{
      await this.request('chats/archive',{chat_id:this.current.chat_id,archived:!archived});await this.refreshList();
    },archived?'Unarchive':'Archive');
  },
  messageActions(message) {
    if(!this.enabled||!message.node_id)return null;
    const actions=document.createElement('div');actions.className='workspace-message-actions';
    for(const [text,kind,callback] of [['Fork here','fork',()=>this.fork(message.node_id)],['Rewind here','rewind',()=>this.rewind(message.node_id)]]) {
      const button=document.createElement('button');button.type='button';button.className='st-btn st-btn--secondary';button.textContent=text;button.dataset['workspace'+kind[0].toUpperCase()+kind.slice(1)]=message.node_id;
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
