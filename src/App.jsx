import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle, Bot, Check, ChevronDown, Code2, FileText, History, LogOut,
  Menu, MessageSquarePlus, Paperclip, Send, Settings2, ShieldCheck, Sparkles,
  Trash2, UserRound, X, PanelLeftClose, Copy
} from "lucide-react";
import { supabase, configReady } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;
const PROVIDERS = {
  Anthropic: [
    { label: "Claude Sonnet 5.5", id: "claude-sonnet-5-5" },
    { label: "Claude Opus 5.5", id: "claude-opus-5-5" },
    { label: "Claude Haiku 5.5", id: "claude-haiku-5-5" }
  ],
  OpenAI: [
    { label: "GPT-4.1", id: "gpt-4.1" },
    { label: "GPT-4.1 mini", id: "gpt-4.1-mini" }
  ]
};
const starter = () => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content: "Hello! I'm your AI workspace. Choose a provider, ask a question, or switch to Code mode to work on a programming task."
});

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === "signup" && !result.data.session) setError("Check your email to confirm your account, then sign in.");
  }
  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="brand-mark"><Sparkles size={22}/></div>
      <p className="eyebrow">YOUR PRIVATE AI WORKSPACE</p>
      <h1>Think clearly.<br/><em>Build anything.</em></h1>
      <p className="muted">One workspace for Claude and OpenAI models.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input type="password" required minLength="8" autoComplete={mode==="signup"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
        {error && <p className="error"><AlertCircle size={16}/>{error}</p>}
        <button className="primary full" disabled={busy}>{busy?"Please wait…":mode==="signup"?"Create account":"Sign in"}</button>
      </form>
      <p className="switch-auth">{mode==="signup"?"Already have an account?":"New here?"} <button className="text-button" onClick={()=>{setMode(mode==="signup"?"signin":"signup");setError("");}}>{mode==="signup"?"Sign in":"Create an account"}</button></p>
      <p className="tiny muted">Your account and saved chats are managed by Supabase.</p>
    </section>
  </main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([starter()]);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("Anthropic");
  const [model, setModel] = useState(PROVIDERS.Anthropic[0].id);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful, accurate AI assistant. Be clear and practical.");
  const [showSettings, setShowSettings] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [files, setFiles] = useState([]);
  const [configError, setConfigError] = useState("");
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!configReady) { setAuthLoading(false); setConfigError("Add the Supabase URL and publishable/anon key to your GitHub Actions variables, then redeploy."); return; }
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthLoading(false);});
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadConversations(); }, [session?.user?.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, busy]);

  async function loadConversations() {
    const {data,error} = await supabase.from("conversations").select("id,title,messages,updated_at").order("updated_at",{ascending:false});
    if (error) { setError(error.message); return; }
    setConversations(data || []);
    if (!activeId && data?.length) openConversation(data[0]);
  }
  function newChat() {
    setActiveId(null); setMessages([starter()]); setInput(""); setFiles([]); setError(""); setMobileSidebar(false);
  }
  function openConversation(c) {
    setActiveId(c.id); setMessages(Array.isArray(c.messages)&&c.messages.length?c.messages:[starter()]);
    setError(""); setMobileSidebar(false);
  }
  async function saveConversation(nextMessages) {
    const firstUser = nextMessages.find(m=>m.role==="user");
    const title = (firstUser?.content || "New conversation").replace(/\s+/g," ").slice(0, sixty());
    const row = { id: activeId || crypto.randomUUID(), user_id: session.user.id, title, messages: nextMessages, updated_at: new Date().toISOString() };
    const {error} = await supabase.from("conversations").upsert(row);
    if (error) setError("Chat could not be saved: "+error.message);
    else { setActiveId(row.id); await loadConversations(); }
  }
  function sixty(){return 60;}
  async function deleteConversation(id,e) {
    e.stopPropagation();
    const {error} = await supabase.from("conversations").delete().eq("id",id);
    if (error) setError(error.message);
    else { if(activeId===id)newChat(); await loadConversations(); }
  }
  async function handleFiles(fileList) {
    const chosen = Array.from(fileList || []).slice(0,5);
    const loaded = [];
    for (const file of chosen) {
      if (file.size > 250000) { setError(`${file.name} is over 250 KB. Please use a smaller text file.`); continue; }
      const text = await file.text();
      loaded.push({name:file.name, text:text.slice(0,50000)});
    }
    setFiles(old=>[...old,...loaded].slice(0,5));
    if (fileRef.current) fileRef.current.value="";
  }
  async function sendMessage(e) {
    e?.preventDefault();
    if (busy || (!input.trim() && !files.length)) return;
    if (!API_URL) { setError("VITE_API_URL is not configured in GitHub Actions variables."); return; }
    const userText = input.trim() + (files.length ? "\n\nAttached files:\n"+files.map(f=>`--- ${f.name} ---\n${f.text}`).join("\n\n") : "");
    const userMsg = {id:crypto.randomUUID(),role:"user",content:userText};
    const prior = messages.filter(m=>m.role==="user"||m.role==="assistant").map(({role,content})=>({role,content}));
    const next = [...messages.filter(m=>m.id!==messages[0]?.id || messages.length>1),userMsg];
    setMessages(next); setInput(""); setFiles([]); setBusy(true); setError("");
    try {
      const {data:{session:current}} = await supabase.auth.getSession();
      const response = await fetch(`${API_URL.replace(/\/$/,"")}/chat`, {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${current.access_token}`},
        body:JSON.stringify({
          provider, model,
          system: systemPrompt + (codeMode ? "\nYou are in Code Assistant mode. Provide correct, secure, maintainable code. Explain important decisions and include complete files when requested." : ""),
          messages:[...prior,userMsg].map(({role,content})=>({role,content}))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
      const assistantMsg = {id:crypto.randomUUID(),role:"assistant",content:payload.content || "No text response was returned."};
      const completed = [...next,assistantMsg];
      setMessages(completed);
      await saveConversation(completed);
    } catch(err) {
      setError(err.message || "Something went wrong.");
      setMessages(next);
    } finally { setBusy(false); }
  }
  async function signOut(){await supabase.auth.signOut();setConversations([]);newChat();}
  function changeProvider(value){setProvider(value);setModel(PROVIDERS[value][0].id);}
  const modelLabel = useMemo(()=>Object.values(PROVIDERS).flat().find(m=>m.id===model)?.label||model,[model]);

  if (authLoading) return <div className="loading-screen"><Sparkles/> Loading workspace…</div>;
  if (!configReady) return <main className="auth-wrap"><section className="auth-card"><div className="brand-mark"><AlertCircle/></div><h1>Configuration needed</h1><p>{configError}</p><p className="muted tiny">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in GitHub repository Settings → Secrets and variables → Actions → Variables.</p></section></main>;
  if (!session) return <AuthScreen/>;

  return <div className="app-shell">
    {mobileSidebar && <button className="scrim" onClick={()=>setMobileSidebar(false)} aria-label="Close menu"/>}
    <aside className={`sidebar ${mobileSidebar?"sidebar-open":""}`}>
      <div className="side-top"><a className="brand" href="#"><span className="brand-mark small"><Sparkles size={17}/></span> <span>atelier<span className="brand-dot">.</span></span></a><button className="icon-button mobile-only" onClick={()=>setMobileSidebar(false)}><X/></button></div>
      <button className="new-chat" onClick={newChat}><MessageSquarePlus size={17}/> New chat</button>
      <div className="side-label"><History size={14}/> RECENTS</div>
      <div className="history-list">{conversations.map(c=><div className={`history-row ${activeId===c.id?"selected":""}`} key={c.id}><button className="history-open" onClick={()=>openConversation(c)}>{c.title}</button><button className="delete-chat" title="Delete chat" onClick={e=>deleteConversation(c.id,e)}><Trash2 size={14}/></button></div>)}</div>
      <div className="side-bottom"><div className="account"><div className="avatar"><UserRound size={16}/></div><div className="account-text"><strong>{session.user.email}</strong><span>Personal workspace</span></div><button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <div className="top-left"><button className="icon-button mobile-only" onClick={()=>setMobileSidebar(true)}><Menu/></button><span className="workspace-name">AI workspace</span><span className="subtle-separator">/</span><span className="current-model">{modelLabel}</span></div>
        <div className="top-actions"><button className={`mode-toggle ${codeMode?"active":""}`} onClick={()=>setCodeMode(!codeMode)}><Code2 size={15}/>{codeMode?"Code mode":"Code assistant"}</button><button className="icon-button" onClick={()=>setShowSettings(true)} title="Settings"><Settings2 size={18}/></button></div>
      </header>

      <section className="chat-scroll">
        <div className="chat-content">
          {messages.length===1 && messages[0].role==="assistant" ? <div className="welcome">
            <div className="welcome-icon"><Sparkles size={22}/></div>
            <p className="eyebrow">A CLEARER WAY TO THINK</p>
            <h1>What can I help<br/><em>you explore?</em></h1>
            <p className="muted">Ask a question, work through an idea, or build something new.</p>
            <div className="suggestions">
              {["Explain a complex topic simply","Help me debug a piece of code","Draft a plan for my next project"].map(s=><button key={s} onClick={()=>setInput(s)}>{s}<span>↗</span></button>)}
            </div>
          </div> : <div className="messages">{messages.map(m=><article className={`message ${m.role}`} key={m.id}><div className="message-avatar">{m.role==="assistant"?<Sparkles size={16}/>:<UserRound size={16}/>}</div><div className="message-body"><div className="message-author">{m.role==="assistant"?"Assistant":"You"}</div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>{m.role==="assistant"&&<button className="copy-button" onClick={()=>navigator.clipboard.writeText(m.content)}><Copy size={13}/> Copy</button>}</div></article>)}</div>}
          {busy&&<div className="thinking"><span/><span/><span/> Thinking</div>}
          {error&&<div className="inline-error"><AlertCircle size={16}/>{error}<button onClick={()=>setError("")}><X size={14}/></button></div>}
          <div ref={bottomRef}/>
        </div>
      </section>

      <footer className="composer-area">
        {files.length>0&&<div className="file-chips">{files.map((f,i)=><span key={i}><FileText size={13}/>{f.name}<button onClick={()=>setFiles(files.filter((_,n)=>n!==i))}><X size={12}/></button></span>)}</div>}
        <form className="composer" onSubmit={sendMessage}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder={codeMode?"Describe the code you want to write or debug…":"Message your assistant…"} rows={2}/>
          <div className="composer-tools"><div className="composer-left"><button type="button" className="tool-button" onClick={()=>fileRef.current?.click()}><Paperclip size={16}/> Attach files</button><input ref={fileRef} type="file" hidden multiple accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.sql,.xml,.yaml,.yml,.log" onChange={e=>handleFiles(e.target.files)}/><span className="privacy-note"><ShieldCheck size={13}/> Private workspace</span></div><button className="send-button" disabled={busy||(!input.trim()&&!files.length)}><Send size={16}/></button></div>
        </form>
        <p className="disclaimer">AI can make mistakes. Verify important information. Provider usage and charges may apply.</p>
      </footer>
    </main>

    {showSettings&&<div className="modal-backdrop" onClick={()=>setShowSettings(false)}><section className="settings-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><p className="eyebrow">PREFERENCES</p><h2>Workspace settings</h2></div><button className="icon-button" onClick={()=>setShowSettings(false)}><X/></button></div>
      <label>AI provider<select value={provider} onChange={e=>changeProvider(e.target.value)}><option>Anthropic</option><option>OpenAI</option></select></label>
      <label>Model<select value={model} onChange={e=>setModel(e.target.value)}>{PROVIDERS[provider].map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label>
      <label>Custom model ID<input value={model} onChange={e=>setModel(e.target.value)} placeholder="Enter provider model ID"/></label>
      <p className="tiny muted">Custom IDs must be supported by the selected provider and your API account.</p>
      <label>System instructions<textarea className="system-prompt" value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={5}/></label>
      <div className="settings-note"><ShieldCheck size={17}/><span>Provider API keys stay on the Cloudflare Worker. They are never stored in this website.</span></div>
      <button className="primary full" onClick={()=>setShowSettings(false)}><Check size={16}/> Save preferences</button>
    </section></div>}
  </div>;
}

export default App;
