const base = 'http://127.0.0.1:9222';
const target = await fetch(base + '/json').then((response) => response.json()).then((items) => items.find((item) => item.type === 'page'));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000);
  const listener = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== id) return;
    clearTimeout(timeout);
    ws.removeEventListener('message', listener);
    message.error ? reject(message.error) : resolve(message.result);
  };
  ws.addEventListener('message', listener);
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression, awaitPromise = false) => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
};
const widths = [320, 375, 390, 430];
const accounts = [
  ['student', 'student'],
  ['teacher', 'teacher'],
  ['HOD', 'hod_cs'],
  ['PRINCIPAL', 'principal'],
  ['DIRECTOR', 'director'],
  ['ADMIN', 'admin'],
  ['SUPER_ADMIN', 'super_admin'],
  ['TREASURER', 'treasurer'],
  ['EXAMINATION_CONTROLLER', 'examination_controller'],
  ['REGISTRAR', 'registrar'],
];
const report = { roles: [], pageWidthIssues: [], routeErrors: [], navBehavior: [], responsiveShortcutIssues: [] };
await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: 'http://127.0.0.1:3100/' });
await sleep(500);

for (const [role, username] of accounts) {
  const auth = await evaluate(`fetch('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',username:${JSON.stringify(username)},password:'MobileAuditPass!23'})}).then(async r=>({status:r.status,body:await r.text()}))`, true);
  if (auth.status !== 200) { report.routeErrors.push({ role, error: 'login ' + auth.status + ': ' + auth.body }); continue; }
  await call('Page.reload');
  await sleep(500);
  await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue to portal');b?.click();return !!b})()");
  await sleep(150);
  let roleResult = await evaluate("({heading:document.querySelector('.greeting h1')?.textContent||document.querySelector('h1')?.textContent||'',nav:[...document.querySelector('#portal-navigation nav[aria-label=\\\"Main navigation\\\"]')?.querySelectorAll('.nav-item')||[]].map(b=>({label:b.getAttribute('aria-label'),title:b.title,current:b.getAttribute('aria-current')}))})");
  const labels = roleResult.nav.map((item) => item.label).filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  const pages = [];
  const pageEntry = (label) => {
    if (!pages.includes(label)) pages.push(label);
  };
  pageEntry('Dashboard');
  for (const label of uniqueLabels) if (!/sign out/i.test(label)) pageEntry(label.split(',')[0]);
  pageEntry('My profile');
  pageEntry('Change password');
  const roleSummary = { role, username, heading: roleResult.heading, pages: pages.length, testedWidths: widths.length };
  report.roles.push(roleSummary);

  // Check the mobile drawer can open and every route button closes it after navigation.
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const drawer = await evaluate("(()=>{const b=document.querySelector('.mobile-menu');b?.click();return {button:!!b,open:document.querySelector('#portal-navigation')?.classList.contains('open'),backdrop:!!document.querySelector('.sidebar-backdrop')}})()");
  await sleep(100);
  drawer.open = await evaluate("document.querySelector('#portal-navigation')?.classList.contains('open')");
  drawer.backdrop = await evaluate("!!document.querySelector('.sidebar-backdrop')");
  report.navBehavior.push({ role, open: drawer.open, backdrop: drawer.backdrop });

  const routeLabels = [...uniqueLabels.filter((label) => !/sign out/i.test(label)), 'My profile', 'Change password'];
  for (const label of routeLabels) {
    await evaluate("(()=>{const nav=document.querySelector('#portal-navigation');if(!nav?.classList.contains('open'))document.querySelector('.mobile-menu')?.click();return true})()");
    await sleep(80);
    const click = await evaluate(`(()=>{const root=document.querySelector('#portal-navigation');const buttons=[...root.querySelectorAll('nav[aria-label="Main navigation"] .nav-item, .sidebar-bottom .nav-item')];const b=buttons.find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)}||x.getAttribute('aria-label')?.startsWith(${JSON.stringify(label + ',')})||x.title===${JSON.stringify(label)}||x.title?.startsWith(${JSON.stringify(label + ' (')}));if(!b)return {found:false};b.click();return {found:true,label:b.getAttribute('aria-label')}})()`);
    if (!click.found) { report.routeErrors.push({ role, page: label, error: 'navigation item not found' }); continue; }
    await sleep(300);
    const currentPage = await evaluate("({breadcrumb:document.querySelector('.breadcrumb strong')?.textContent||'',active:document.querySelector('#portal-navigation .nav-item[aria-current=page]')?.getAttribute('aria-label')||'',drawerOpen:document.querySelector('#portal-navigation')?.classList.contains('open'),shortcut:!!document.querySelector('.role-mobile-nav')})");
    if (currentPage.drawerOpen) report.navBehavior.push({ role, page: label, drawerStayedOpen: true });
    if ((currentPage.breadcrumb === 'Dashboard') !== currentPage.shortcut && label === 'Dashboard') report.responsiveShortcutIssues.push({role,page:label,shortcut:currentPage.shortcut});
    if (label !== 'Dashboard' && currentPage.shortcut) report.responsiveShortcutIssues.push({role,page:label,shortcut:true});
    for (const width of widths) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: width <= 768 ? 900 : 1000, deviceScaleFactor: 1, mobile: width <= 768 });
      const check = await evaluate("(()=>{const w=innerWidth,doc=document.documentElement,b=document.body,content=document.querySelector('main.content');const contentRight=content?Math.round(content.getBoundingClientRect().right):0;const offenders=[...document.querySelectorAll('main.content *')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&(r.right>w+2||r.left< -2)&&!el.closest('.table-scroll,.table-wrap,.attendance-register')&&s.position!=='fixed'&&s.visibility!=='hidden'}).slice(0,8).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,60),right:Math.round(el.getBoundingClientRect().right),left:Math.round(el.getBoundingClientRect().left)}));return {width:w,doc:doc.scrollWidth,body:b.scrollWidth,contentRight,offenders}})()");
      if (check.doc > width + 1 || check.body > width + 1 || check.contentRight > width + 1 || check.offenders.length) report.pageWidthIssues.push({ role, page: label, ...check });
    }
    // Capture representative layouts for visual review.
    const captures = (role === 'teacher' && label === 'Attendance') || (role === 'SUPER_ADMIN' && label === 'Reports') || (role === 'student' && label === 'Assignments');
    if (captures) {
      await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(300);
      const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const filename = role.toLowerCase() + '-' + label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') + '-390.png';
      const fs = await import('node:fs/promises');
      await fs.writeFile(new URL('./' + filename, import.meta.url), Buffer.from(image.data, 'base64'));
      report.roles.at(-1).capture = filename;
    }
  }
}
await call('Emulation.clearDeviceMetricsOverride');
const groupedWidths = new Map();
for (const issue of report.pageWidthIssues) {
  const key = `${issue.role} · ${issue.page}`;
  const item = groupedWidths.get(key) || { role: issue.role, page: issue.page, widths: [], samples: [] };
  if (!item.widths.includes(issue.width)) item.widths.push(issue.width);
  if (item.samples.length < 2) item.samples.push({ width: issue.width, doc: issue.doc, body: issue.body, offenders: issue.offenders });
  groupedWidths.set(key, item);
}
report.pageWidthSummary = [...groupedWidths.values()];
delete report.pageWidthIssues;
console.log(JSON.stringify(report, null, 2));
ws.close();

