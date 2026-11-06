import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const base = 'http://localhost:5189';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5189', '--host', '127.0.0.1'], {cwd:process.cwd(),windowsHide:true,stdio:'ignore'});
let browser;
const deadline = setTimeout(() => {server.kill(); console.error('Response browser check timed out');process.exit(1);},120000);
try {
  for (let i=0;i<40;i++) {try {if ((await fetch(base)).ok) break;} catch {} await sleep(250);}
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(15000);
  const errors = [], played = [];
  page.on('pageerror', error=>errors.push(error.message));
  const requestId = '64b7f0c2a1b2c3d4e5f60718';
  const groups = Array.from({length:7},(_,i) => {
    const number=i+1,batchId='batch-'+number;
    const responses=[1,2].map(q=>({id:'video-'+number+'-'+q,batchId,questionId:'q'+q,questionText:'Question '+q+' for submission '+number,clientName:'Saurabh',clientEmail:'client@example.com',status:'submitted',effectiveStatus:'submitted',storageProvider:'s3',playable:true,durationSeconds:8,fileSize:10000,submittedAt:'2026-11-03T12:00:00Z',createdAt:'2026-11-03T12:00:00Z',deleteAt:'2027-05-02T12:00:00Z'}));
    return {id:'submission-'+number,batchId,number,clientName:'Saurabh',clientEmail:'client@example.com',submittedAt:'2026-11-03T12:00:00Z',videoCount:2,downloadable:true,responses};
  });
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    let data={success:true};
    if(path.endsWith('/auth/me'))data.user={id:'u',name:'Admin',email:'admin@example.com',role:'admin'};
    else if(path.endsWith('/health'))data.message='healthy';
    else if(path==='/api/requests/'+requestId)data.request={id:requestId,title:'Grouped response demo',question:'First?',questions:[{id:'q1',text:'First?'},{id:'q2',text:'Second?'}],clientName:'Saurabh',status:'active',effectiveStatus:'active',maxDurationSeconds:3540,responseCount:7,createdAt:'2026-11-01T12:00:00Z',createdBy:{name:'Admin'}};
    else if(path.endsWith('/responses')){
      const current=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||5);
      const submissions=groups.slice((current-1)*limit,current*limit);
      data={success:true,submissions,responses:submissions.flatMap(s=>s.responses),pagination:{page:current,limit,total:7,totalPages:2}};
    } else if(path.endsWith('/play')) {played.push(path);data={success:true,kind:'signed',url:base+'/fake-video',mimeType:'video/webm'};}
    else throw new Error('Unexpected API route: '+path);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.route('**/fake-video',route=>route.fulfill({status:200,contentType:'video/webm',body:''}));
  await page.goto(base+'/requests/'+requestId);
  const groupFirst=page.getByRole('region',{name:'Response 1',exact:true});
  await groupFirst.waitFor();
  assert.deepEqual(await page.getByRole('heading',{name:/^Response [0-9]+$/}).allTextContents(),['Response 1','Response 2','Response 3','Response 4','Response 5']);
  assert.equal(await groupFirst.getByRole('listitem').count(),2);
  assert.deepEqual(await groupFirst.getByText(/Question [12] for submission/).allTextContents(),['Question 1 for submission 1','Question 2 for submission 1']);
  assert.ok((await groupFirst.getByRole('link',{name:'Download ZIP for Response 1'}).getAttribute('href')).endsWith('/submissions/batch-1/download'));
  const groupNext=page.getByRole('region',{name:'Response 2',exact:true});
  assert.ok((await groupNext.getByRole('link',{name:'Download ZIP for Response 2'}).getAttribute('href')).endsWith('/submissions/batch-2/download'));
  assert.equal(await groupNext.evaluate(el=>getComputedStyle(el).borderTopWidth),'2px');
  await groupFirst.getByRole('button',{name:'Play Video',exact:true}).first().click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(200);assert.ok(played[0].includes('video-1-1'));
  await page.getByRole('button',{name:'Close video'}).click();
  fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:'test-artifacts/grouped-responses-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Go to page 2'}).click();
  const groupLast=page.getByRole('region',{name:'Response 6',exact:true});await groupLast.waitFor();
  assert.equal(await page.getByRole('heading',{name:/^Response [0-9]+$/}).count(),2);
  assert.equal(await groupLast.getByRole('listitem').count(),2);
  assert.equal(await page.getByRole('region',{name:'Response 7',exact:true}).getByRole('listitem').count(),2);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-artifacts/grouped-responses-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Grouped-response browser checks passed: separate sections, numbering, question order, ZIP mapping, playback, pagination, mobile.');
} finally {clearTimeout(deadline);await browser?.close();server.kill();}
