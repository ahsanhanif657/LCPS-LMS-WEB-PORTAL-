'use client';
import {useState,type InputHTMLAttributes} from 'react';
import {ArrowRight,BookOpen,Building2,Eye,EyeOff,ShieldCheck,Sparkles} from 'lucide-react';
export async function authRequest(body:Record<string,string>){const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json() as {error?:string};if(!r.ok)throw new Error(j.error||'Request failed.');}
export function PasswordInput(props:InputHTMLAttributes<HTMLInputElement>){
 const [visible,setVisible]=useState(false);
 return <span className="password-input-wrap"><input {...props} type={visible?'text':'password'}/><button type="button" className="password-toggle" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span>;
}
export function LoginForm({error,onLogin}:{error:string;onLogin:()=>Promise<void>}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState<'login'|'signup'>('login');
 const switchMode=(next:'login'|'signup')=>{setMode(next);setErr('');};
 return <main className="login-page auth-page"><section className={'auth-card '+(mode==='signup'?'is-signup':'')} aria-label="LCPS account access">
  <div className="auth-form-side">
   {mode==='login'?<form className="auth-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setErr('');try{await authRequest({action:'login',username,password});await onLogin();}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}}>
    <a className="auth-logo" href="/" aria-label="LCPS home"><img src="/lcps-logo.png" alt="LCPS — Lahore College of Pharmaceutical Sciences"/></a>
    <div className="auth-kicker"><span/> ACADEMIC PORTAL</div>
    <h1>Welcome back</h1><p className="auth-description">Sign in with your college account to continue your learning journey.</p>
    <label className="field"><span>Username</span><input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter your username"/></label>
    <label className="field"><span>Password</span><PasswordInput required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label>
    {(err||error)&&<p role="alert" className="form-error">{err||error}</p>}
    <button className="btn primary full auth-submit" disabled={busy}>{busy?'Signing in…':'Sign in'}{!busy&&<ArrowRight size={17}/>}</button>
    <p className="auth-footnote">Need an account or password reset? Contact your college administrator.</p>
    <a className="auth-setup" href="/setup">First-time administrator setup</a>
   </form>:<div className="auth-form auth-signup">
    <a className="auth-logo" href="/" aria-label="LCPS home"><img src="/lcps-logo.png" alt="LCPS — Lahore College of Pharmaceutical Sciences"/></a>
    <div className="auth-kicker"><span/> JOIN THE LCPS COMMUNITY</div>
    <h1>Get your account</h1><p className="auth-description">Your college account is set up by the people responsible for your department.</p>
    <div className="account-path"><span className="account-icon"><BookOpen size={19}/></span><div><strong>Student account</strong><p>Contact your department’s Head of Department to request an account.</p></div></div>
    <div className="account-path"><span className="account-icon"><Building2 size={19}/></span><div><strong>Teacher or staff account</strong><p>Ask your department HOD or college administrator to create your account.</p></div></div>
    <div className="account-security"><ShieldCheck size={17}/><span>Accounts are created by authorized college staff to keep the learning portal secure.</span></div>
   </div>}
  </div>
  <aside className="auth-promo">
   <div className="auth-decoration auth-decoration-one"/><div className="auth-decoration auth-decoration-two"/>
   <div className="auth-promo-content"><div className="auth-mark"><Sparkles size={19}/></div><span className="auth-promo-kicker">LAHORE COLLEGE OF PHARMACEUTICAL SCIENCES</span>
    {mode==='login'?<><h2>Learning with purpose.<br/>Growing with confidence.</h2><p>One secure space for your classes, coursework and academic progress.</p><div className="auth-promo-bottom"><span>New to the portal?</span><button type="button" className="auth-switch" onClick={()=>switchMode('signup')}>Sign up <ArrowRight size={16}/></button></div></>:<><h2>Your academic journey<br/>starts here.</h2><p>Get connected with your department and take the next step in your learning journey.</p><div className="auth-promo-bottom"><span>Already have an account?</span><button type="button" className="auth-switch" onClick={()=>switchMode('login')}>Log in <ArrowRight size={16}/></button></div></>}
   </div><div className="auth-promo-caption">KNOWLEDGE WITH PURPOSE <span>·</span> LCPS</div>
  </aside>
 </section></main>;
}
export function PasswordForm({onChanged}:{onChanged:()=>void}){const [currentPassword,setCurrent]=useState(''),[newPassword,setNew]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);return <form className="panel settings-form" onSubmit={async e=>{e.preventDefault();setError('');if(newPassword!==confirm){setError('New passwords do not match.');return;}setBusy(true);try{await authRequest({action:'change',currentPassword,newPassword});onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{[['Current password',currentPassword,setCurrent],['New password',newPassword,setNew],['Confirm new password',confirm,setConfirm]].map(([label,value,set],i)=><label className="field" key={String(label)}><span>{String(label)}</span><PasswordInput autoComplete={i?'new-password':'current-password'} minLength={i?10:undefined} maxLength={128} required value={String(value)} onChange={e=>(set as (v:string)=>void)(e.target.value)}/></label>)}{error&&<p role="alert" className="form-error">{error}</p>}<button className="btn primary" disabled={busy}>{busy?'Saving…':'Change password'}</button></form>;}
