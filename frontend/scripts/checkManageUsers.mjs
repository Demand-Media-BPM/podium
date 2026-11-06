import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const base='http://localhost:5190';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','5190','--host','127.0.0.1'],{cwd:process.cwd(),windowsHide:true,stdio:'ignore'});
let browser;
const timeout=setTimeout(()=>{server.kill();console.error('Manage Users browser check timed out');process.exit(1);},120000);
try {
  for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(250);}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:1000}});page.setDefaultTimeout(15000);
  const errors=[],updates=[];page.on('pageerror',err=>errors.push(err.message));
  const accounts=[1,2,3].map(i=>({id:'admin'+i,name:'Admin '+i,email:'admin'+i+'@example.com',role:'admin',isActive:true}));
  accounts.push({id:'regular',name:'Regular User',email:'regular@example.com',role:'employee',isActive:true});
  let current=accounts[0],userGets=0;
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    let status=200,data={success:true};
    if(path.endsWith('/auth/me'))data.user=current;
    else if(path.endsWith('/users') && req.method()==='GET'){
      userGets++;const pageNumber=Number(url.searchParams.get('page')||1),limit=10;
      data={success:true,users:accounts.slice((pageNumber-1)*limit,pageNumber*limit),pagination:{page:pageNumber,limit,total:accounts.length,totalPages:1}};
    }else if(path.endsWith('/users') && req.method()==='POST'){
      const values=req.postDataJSON();
      if(accounts.some(a=>a.email.toLowerCase()===values.email.toLowerCase())){status=409;data={message:'An account with this email already exists',details:{email:'An account with this email already exists'}};}
      else {assert.equal(values.role,'employee');assert.ok(values.password.length>=12);const {password,...safe}=values;data.user={...safe,id:'new-user',isActive:true};accounts.push(data.user);status=201;}
    }else if(path.includes('/users/') && req.method()==='PATCH'){
      const id=path.split('/').pop(),values=req.postDataJSON();assert.ok(!('password' in values));updates.push(values);
      const account=accounts.find(a=>a.id===id);Object.assign(account,values);data.user=account;
    }else if(path.endsWith('/requests/summary'))data.summary={totalRequests:0,totalResponses:0,activeRequests:0};
    else if(path.endsWith('/requests'))Object.assign(data,{requests:[],pagination:{page:1,limit:10,total:0,totalPages:1}});
    else if(path.endsWith('/health'))data.message='healthy';
    else throw new Error('Unexpected route '+path);
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/users');await page.getByRole('heading',{name:'Manage Users',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Manage Users',exact:true}).count(),1);
  await page.getByRole('button',{name:'Add user',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Full name',{exact:false}).fill('New Person');await dialog.getByLabel('Email address',{exact:false}).fill('new@example.com');await dialog.getByLabel('Password',{exact:false}).fill('temporary-password-123');
  await dialog.getByRole('button',{name:'Create user',exact:true}).click();
  await page.getByRole('button',{name:'Edit New Person',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit New Person',exact:true}).click();dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Password',{exact:false}).count(),0);
  await dialog.getByLabel('Full name',{exact:false}).fill('Updated Person');
  await dialog.getByLabel('Account type',{exact:false}).click();await page.getByRole('option',{name:'Admin',exact:true}).click();
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Deactivate Updated Person',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Deactivate',exact:true}).click();
  await page.getByRole('button',{name:'Activate Updated Person',exact:true}).waitFor();
  assert.equal(accounts.find(a=>a.id==='new-user').isActive,false);
  await page.getByRole('button',{name:'Activate Updated Person',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Activate',exact:true}).click();
  await page.getByRole('button',{name:'Deactivate Updated Person',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Deactivate Admin 1',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Edit Admin 1',exact:true}).click();dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Account type',{exact:false}).isDisabled(),true);assert.equal(await dialog.getByRole('switch').isDisabled(),true);
  await dialog.getByLabel('Full name',{exact:false}).fill('Updated Admin');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Edit Updated Admin',exact:true}).waitFor();assert.equal(current.name,'Updated Admin');
  await page.getByRole('button',{name:'Add user',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByLabel('Full name',{exact:false}).fill('Duplicate');await dialog.getByLabel('Email address',{exact:false}).fill('new@example.com');await dialog.getByLabel('Password',{exact:false}).fill('temporary-password-123');await dialog.getByRole('button',{name:'Create user',exact:true}).click();
  await dialog.getByText('An account with this email already exists',{exact:true}).first().waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:'test-artifacts/manage-users-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-artifacts/manage-users-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const original of accounts.slice(0,3)){assert.equal(original.role,'admin');assert.equal(original.isActive,true);}
  current=accounts.find(a=>a.id==='regular');const before=userGets;
  await page.goto(base+'/users');await page.waitForURL('**/dashboard');await page.getByRole('heading',{name:/Welcome back/}).waitFor();assert.equal(await page.getByRole('link',{name:'Manage Users',exact:true}).count(),0);assert.equal(userGets,before,'regular user must not load the user directory');
  assert.deepEqual(errors,[]);console.log('Manage Users browser checks passed: add/edit, roles, status confirmation, self protection, duplicate email, mobile and regular-user guard.');
} finally {clearTimeout(timeout);await browser?.close();server.kill();}
