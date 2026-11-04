import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const port=5188,base='http://localhost:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--host','127.0.0.1'],{cwd:process.cwd(),windowsHide:true,stdio:'ignore'});
let browser;
const deadline=setTimeout(()=>{console.error('Browser test exceeded 150s');process.exit(1);},150000);
try {
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await sleep(250);}
 browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({viewport:{width:1366,height:900},permissions:['camera','microphone']});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const questions=[{id:'64b7f0c2a1b2c3d4e5f60711',text:'Tell us about yourself?'},{id:'64b7f0c2a1b2c3d4e5f60712',text:'What happened next?'}];
 let site='it-tech-pulse',createdBody,initiates=0,completes=0,finals=0;
 const fixture=()=>({id:'64b7f0c2a1b2c3d4e5f60718',title:'Client interview',clientName:'Alex',microsite:site,questions,question:questions[0].text,multiQuestion:true,maxDurationSeconds:3540,status:'active',effectiveStatus:'active',createdBy:{name:'Employee'},responseCount:0});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  let status=200,data={success:true};
  if(path.endsWith('/auth/me'))data.user={id:'u1',name:'Employee',email:'employee@example.com',role:'admin'};
  else if(path.endsWith('/health'))data.message='healthy';
  else if(path.endsWith('/requests') && request.method()==='POST'){createdBody=request.postDataJSON();data={success:true,request:fixture(),url:base+'/respond/alex42'};status=201;}
  else if(path.endsWith('/public/alex42'))data.request=fixture();
  else if(path.endsWith('/uploads')){initiates++;const input=request.postDataJSON();assert.ok(input.batchId && input.batchToken && input.questionId);data={alreadySubmitted:false,responseId:'64b7f0c2a1b2c3d4e5f'+String(60710+initiates),completionToken:'completion',upload:{url:base+'/fake-s3',fields:{key:'answer'}}};}
  else if(path.endsWith('/complete')){completes++;data.duplicate=false;}
  else if(path.endsWith('/submissions')){finals++;assert.equal(request.postDataJSON().answers.length,2);if(finals===1){status=503;data={code:'STORAGE_UNAVAILABLE',message:'Temporary save failure'};}}
  else throw new Error('Unexpected API: '+path);
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('**/fake-s3',route=>route.fulfill({status:204,body:''}));
 await page.goto(base+'/requests/new');
 await page.getByLabel('Request title',{exact:false}).fill('Client interview');
 await page.getByLabel('Client name',{exact:false}).fill('Alex');
 await page.getByLabel('Select microsite',{exact:false}).click();await page.getByRole('option',{name:'ITTech Pulse',exact:true}).click();
 for(const q of questions){await page.getByLabel('Add your question').fill(q.text);await page.getByRole('button',{name:'Add',exact:true}).click();}
 await page.getByLabel('Add your question').fill('Remove me');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Remove question 3'}).click();
 fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:'test-artifacts/create-request.png',fullPage:true});
 console.log('Submitting create request');
 await page.getByRole('button',{name:'Create request',exact:false}).last().click();
 await page.getByText('Request created',{exact:true}).first().waitFor();console.log('Create request passed');assert.equal(createdBody.questions.length,2);assert.equal(createdBody.clientName,'Alex');assert.equal(createdBody.microsite,'it-tech-pulse');
 for(const [id,color] of [['it-tech-pulse','rgb(23, 24, 16)'],['fin-tech-pulse','rgb(0, 102, 66)'],['mar-tech-pulse','rgb(247, 197, 30)'],['hr-tech-pulse','rgb(242, 250, 253)'],['health-tech-pulse','rgb(8, 58, 82)']]){
  site=id;await page.goto(base+'/respond/alex42');await page.getByRole('dialog').waitFor();await page.waitForFunction(expected=>getComputedStyle(document.querySelector('header')).backgroundColor===expected,color);
  const logo=page.locator('header img');await logo.waitFor();assert.ok(await logo.getAttribute('alt'));
  await logo.evaluate(img => img.decode());assert.ok(await logo.evaluate(img => img.naturalWidth > 0));
 }
 await page.getByLabel('Email address',{exact:false}).fill('alex@example.com');await page.getByRole('button',{name:'Continue to Recording'}).click();
 console.log('Themes and welcome passed');
 const submit=page.getByRole('button',{name:'Submit all answers'});assert.equal(await submit.isDisabled(),true);
 const record=async()=>{await page.getByRole('button',{name:'Turn on camera and microphone'}).click();await page.getByRole('button',{name:'Start Recording',exact:true}).click();await page.getByRole('button',{name:'Stop Recording',exact:true}).waitFor();await sleep(1600);await page.getByRole('button',{name:'Stop Recording',exact:true}).click();await page.getByRole('button',{name:'Re-record',exact:true}).waitFor();};
 console.log('Recording first answer');
 await record();console.log('First answer recorded');assert.equal(await submit.isDisabled(),true);
 const before=await page.getByRole('timer').innerText();assert.ok(!before.startsWith('59:00'));
 await page.getByRole('button',{name:'Re-record',exact:true}).click();await page.getByRole('button',{name:'Start Recording',exact:true}).waitFor();assert.ok((await page.getByRole('timer').innerText()).startsWith('59:00'));
 await page.getByRole('button',{name:'Start Recording',exact:true}).click();await page.getByRole('button',{name:'Stop Recording',exact:true}).waitFor();await sleep(1100);await page.getByRole('button',{name:'Stop Recording',exact:true}).click();await page.getByRole('button',{name:'Re-record',exact:true}).waitFor();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await record();
 await page.getByRole('checkbox').check();assert.equal(await submit.isEnabled(),true);
 await page.screenshot({path:'test-artifacts/client-questions.png',fullPage:true});
 await submit.click();await page.getByText(/Temporary save failure/).waitFor();assert.equal(initiates,2);assert.equal(completes,2);
 await submit.click();await page.getByRole('heading',{name:'Thank you for your response!'}).waitFor();assert.equal(finals,2);assert.equal(initiates,2,'retry only finalizes; no duplicate uploads');
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/respond/alex42');await page.getByRole('dialog').waitFor();await page.screenshot({path:'test-artifacts/client-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no mobile horizontal overflow');assert.deepEqual(errors,[]);
 console.log('Browser checks passed: create form, 5 themes, required answers, recording, retake time refund, submit retry, mobile layout.');
} finally {clearTimeout(deadline);await browser?.close();server.kill();}
