import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.DRY_RUN_URL||'https://dry-run-executor.trantanlong2411.workers.dev';
const base={from:'0x74B2c2E4E4B771F0C75dcE44f40787468E323f79',
 contract:'0x934403227468426b33c26536dABC33b066B73f73',amount:'1',
 maxGasUnits:'400000',maxGasCostPhrs:'0.02',gasBufferBps:'2000'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,payload){
 for(let attempt=1;attempt<=4;attempt++){
  const r=await fetch(url+path,{method:payload?'POST':'GET',
   headers:payload?{'content-type':'application/json'}:{},
   body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(25000)});
  const raw=await r.text();let obj;
  try{obj=JSON.parse(raw)}catch{throw Error('Non-JSON HTTP '+r.status+' '+raw.slice(0,400))}
  const rateLimited=r.status===429||obj?.report?.rpcFailureType==='RATE_LIMIT';
  if(rateLimited){
   if(attempt===4)throw Error('RATE_LIMIT_EXHAUSTED after 4 attempts: '+JSON.stringify(obj).slice(0,400));
   const seconds=Math.max(15,Math.min(60,Number(obj.retryAfterSeconds||obj.report?.retryAfterSeconds||15)));
   console.log('RPC HTTP 429 / RATE_LIMIT — retry after '+seconds+' seconds, attempt '+attempt+'; no synthetic fallback');
   await sleep(seconds*1000+2000);continue;
  }
  if(!r.ok||!obj.ok)throw Error('API '+path+' HTTP '+r.status+' '+JSON.stringify(obj).slice(0,500));
  return obj;
 }
 throw Error('Unreachable retry loop');
}
let health;
for(let i=0;i<18;i++){
 try{health=await request('/api/health');if(health.name==='dry-run-executor')break}
 catch{}
 await sleep(4000);
}
assert.equal(health?.canBroadcast,false);
assert.equal(health?.chainId,688689);
const artifact={schema:'pharos-atlantic-dry-run-proof',verifiedAt:new Date().toISOString(),
 deployedUrl:url,transactionBroadcast:false,records:[]};
for(const [name,config,expected] of [
 ['success',{...base,method:'undoDeposit'},'READY_TO_PREPARE'],
 ['revert',{...base,method:'deposit',amount:'2'},'BLOCKED'],
 ['gas-policy',{...base,method:'undoDeposit',maxGasCostPhrs:'0'},'BLOCKED']]){
 const {report}=await request('/api/simulate',config);
 assert.equal(report.decision,expected,name);
 assert.equal(report.transactionBroadcast,false);
 assert.equal(report.chainId,688689);
 assert.ok(Number(report.blockNumber)>0);
 assert.ok(report.before.pendingTestBWei!==undefined);
 if(name==='success'){
  assert.equal(report.successPredicted,true);
  assert.ok(BigInt(report.gasEstimateUnits)>0n);
  assert.ok(report.afterProjected&&report.preparedUnsignedTransaction);
 }
 if(name==='revert'){
  assert.match(report.revertReason||'',/INSUFFICIENT_PENDING/);
  assert.equal(report.preparedUnsignedTransaction,null);
 }
 if(name==='gas-policy')assert.equal(report.preparedUnsignedTransaction,null);
 artifact.records.push({case:name,report});
 if(name!=='gas-policy')await sleep(12000);
 console.log('PHAROS LIVE DRY RUN',JSON.stringify({
  case:name,block:report.blockNumber,decision:report.decision,
  gasUnits:report.gasEstimateUnits,revertReason:report.revertReason,
  before:report.before,afterProjected:report.afterProjected
 }));
}
await mkdir('proof',{recursive:true});
await writeFile('proof/live-dry-run.json',JSON.stringify(artifact,null,2)+'\n');
console.log('LIVE DRY-RUN EVIDENCE VERIFIED: proof/live-dry-run.json');
