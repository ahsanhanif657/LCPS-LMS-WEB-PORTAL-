'use client';
import {useEffect,useState} from 'react';
import {PasswordInput} from '../security';
export default function Setup(){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/api/setup').then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setState(j);}).catch(e=>setError(e.message));},[]);
 return <main className="login-page"><form className="login-card" onSubmit={async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);setError('');
  try{const r=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),j=await r.json();if(!r.ok)throw new Error(j.error);window.location.href='/';}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}>
  <img src="/lcps-logo.png" alt="Lahore College of Pharmaceutical Sciences"/>
  <h1>First administrator setup</h1>
  {state?.ready?<><p>This portal is already initialized. Existing accounts are preserved.</p><a className="btn primary" href="/">Go to sign in</a></>:<>
   <p>Create the only initial account. Teachers and students are added later by the administrator.</p>
   {state&&!state.setupKeyConfigured&&<p className="form-error">Add ADMIN_SETUP_KEY in Vercel environment variables and redeploy. Use a random secret of at least 24 characters.</p>}
   {state&&!state.storageConnected&&<p className="form-error">Private file storage is not configured. In Vercel, set FILE_STORAGE_MODE=blob and connect a private Blob store. Local mode is only for development.</p>}
   <label className="field"><span>Setup key from Vercel settings</span><PasswordInput name="setupKey" autoComplete="off" required minLength={24}/></label>
   <label className="field"><span>Administrator name</span><input name="name" defaultValue="Ahsan Hanif" required/></label>
   <label className="field"><span>Username</span><input name="username" defaultValue="ahsanhanif" autoComplete="username" required/></label>
   <label className="field"><span>Password (10–128 characters)</span><PasswordInput name="password" autoComplete="new-password" minLength={10} maxLength={128} required/></label>
   <button className="btn primary" disabled={busy||!state?.setupKeyConfigured}>{busy?'Creating administrator…':'Create administrator'}</button>
  </>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </form></main>;
}
