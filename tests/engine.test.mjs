import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,parseUnits} from 'ethers';
import {simulate,validate,CHAIN,SAMPLE} from '../src/engine.mjs';
import {HTML} from '../src/page.mjs';
import {Script} from 'node:vm';
const abi=new Interface([
 'function pending(address) view returns (uint256)',
 'function deposited(address) view returns (uint256)',
 'function tokenA() view returns (address)',
 'function undoDeposit(uint256)',
 'function deposit(uint256)',
 'function compensateSwap(uint256)'
]);
const erc=new Interface(['function balanceOf(address) view returns (uint256)']);
const errAbi=new Interface(['error Error(string)']);
const token='0x0000000000000000000000000000000000000011';
const ONE=parseUnits('1',18);
function rpcMock({revert=false,gas='0x186a0',native=ONE}={}){
 const calls=[];
 const rpc=async(name,params=[])=>{
  calls.push(name);
  if(name==='eth_chainId')return '0xa8231';
  if(name==='eth_blockNumber')return '0x123';
  if(name==='eth_gasPrice')return '0x2540be400';
  if(name==='eth_getCode')return '0x60806040';
  if(name==='eth_getBalance')return '0x'+native.toString(16);
  if(name==='eth_estimateGas')return gas;
  if(name==='eth_call'){
   const [tx]=params;
   if(tx.to.toLowerCase()===token.toLowerCase())
    return erc.encodeFunctionResult('balanceOf',[10n*ONE]);
   const action=abi.parseTransaction({data:tx.data});
   if(action.name==='tokenA')return abi.encodeFunctionResult('tokenA',[token]);
   if(action.name==='pending')return abi.encodeFunctionResult('pending',[0n]);
   if(action.name==='deposited')return abi.encodeFunctionResult('deposited',[ONE]);
   if(revert&&action.name==='deposit'){
    const e=new Error('execution reverted');
    e.code='RPC_PROVIDER_ERROR';
    e.rpcData=errAbi.encodeErrorResult('Error',['INSUFFICIENT_PENDING']);
    throw e;
   }
   return '0x';
  }
  throw Error('unexpected '+name);
 };
 return {rpc,calls};
}
test('correct Pharos Atlantic chain id',()=>assert.equal(CHAIN.chainId,688689));
test('reject zero and malformed amounts',()=>{
 assert.throws(()=>validate({amount:'0'}),/greater than zero/);
 assert.throws(()=>validate({amount:'1e5'}),/decimal/);
});
test('reject unsafe gas caps',()=>{
 assert.throws(()=>validate({maxGasUnits:'100'}),/Gas unit/);
 assert.throws(()=>validate({gasBufferBps:'11000'}),/Gas buffer/);
});
test('passing eth_call projects state and prepares an unsigned transaction only',async()=>{
 const m=rpcMock();
 const r=await simulate(SAMPLE,m.rpc);
 assert.equal(r.decision,'READY_TO_PREPARE');
 assert.equal(r.before.pendingTestBWei,'0');
 assert.equal(r.before.depositedSharesWei,ONE.toString());
 assert.equal(r.afterProjected.pendingTestBWei,ONE.toString());
 assert.equal(r.afterProjected.depositedSharesWei,'0');
 assert.equal(r.preparedUnsignedTransaction.chainId,688689);
 assert.equal(r.gasEstimateUnits,'100000');
 assert.equal(r.transactionBroadcast,false);
 assert.ok(m.calls.includes('eth_call')&&m.calls.includes('eth_estimateGas'));
 assert.ok(!m.calls.includes('eth_sendRawTransaction')&&!m.calls.includes('eth_sendTransaction'));
});
test('revert decodes Error(string), blocks without fabricating gas costs',async()=>{
 const m=rpcMock({revert:true});
 const r=await simulate({...SAMPLE,method:'deposit',amount:'2'},m.rpc);
 assert.equal(r.decision,'BLOCKED');
 assert.equal(r.revertReason,'INSUFFICIENT_PENDING');
 assert.equal(r.evmCallSucceeded,false);
 assert.equal(r.rpcFailureType,'EVM_REVERT');
 assert.equal(r.afterProjected,null);
 assert.equal(r.gasEstimateUnits,null);
 assert.equal(r.preparedUnsignedTransaction,null);
 assert.ok(!m.calls.includes('eth_estimateGas'));
});
test('gas cap blocks an otherwise passing simulation',async()=>{
 const r=await simulate({...SAMPLE,maxGasCostPhrs:'0'},rpcMock().rpc);
 assert.equal(r.decision,'BLOCKED');
 assert.match(r.reason,/Safety policy/);
});
test('native gas shortfall blocks',async()=>{
 const r=await simulate(SAMPLE,rpcMock({native:1n}).rpc);
 assert.equal(r.decision,'BLOCKED');
 assert.match(r.reason,/enough PHRS/);
});
test('wrong chain fails closed',async()=>{
 const m=rpcMock();
 await assert.rejects(simulate(SAMPLE,(n,p)=>n==='eth_chainId'?'0x1':m.rpc(n,p)),/Wrong chain/);
});
test('failed eth_estimateGas blocks unsigned transaction',async()=>{
 const m=rpcMock();
 const r=await simulate(SAMPLE,(n,p)=>{
  if(n==='eth_estimateGas')throw Error('gas estimation unavailable');
  return m.rpc(n,p);
 });
 assert.equal(r.decision,'BLOCKED');assert.equal(r.preparedUnsignedTransaction,null);
});
test('UI includes success, revert, gas policy and audit export',()=>{
 for(const x of ['id="positive"','id="negative"','id="policy"','id="prepare"','id="export"'])assert.ok(HTML.includes(x));
 assert.match(HTML,/transactionBroadcast:false/);
});
test('inline browser JavaScript parses',()=>{
 const scripts=[...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.ok(scripts.length);
 for(const [,s] of scripts)new Script(s);
});
test('HTTP 429 during eth_call is NOT mislabeled as EVM revert',async()=>{
 const m=rpcMock();
 const rpc=async(name,params)=>{
  if(name==='eth_call'&&abi.parseTransaction({data:params[0].data})?.name==='undoDeposit'){
   const e=new Error('Pharos RPC HTTP 429');
   e.code='RPC_RATE_LIMIT';e.retryAfterSeconds=20;throw e;
  }
  return m.rpc(name,params);
 };
 const r=await simulate(SAMPLE,rpc);
 assert.equal(r.decision,'ERROR_BLOCKED');
 assert.equal(r.rpcFailureType,'RATE_LIMIT');
 assert.equal(r.evmCallSucceeded,null);
 assert.equal(r.revertReason,null);
 assert.equal(r.retryAfterSeconds,20);
 assert.equal(r.preparedUnsignedTransaction,null);
});
test('generic provider failures never invent EVM revert',async()=>{
 const m=rpcMock();
 const rpc=async(name,params)=>{
  if(name==='eth_call'&&abi.parseTransaction({data:params[0].data})?.name==='undoDeposit')throw Error('Provider network timeout');
  return m.rpc(name,params);
 };
 const r=await simulate(SAMPLE,rpc);
 assert.equal(r.decision,'ERROR_BLOCKED');assert.equal(r.revertReason,null);
 assert.equal(r.rpcFailureType,'RPC_UNAVAILABLE');
});
test('EVM success and safety policy block are distinct',async()=>{
 const r=await simulate({...SAMPLE,maxGasCostPhrs:'0'},rpcMock().rpc);
 assert.equal(r.evmCallSucceeded,true);
 assert.equal(r.decision,'BLOCKED');
 assert.equal(r.preparedUnsignedTransaction,null);
});
test('UI presents RPC errors separately from on-chain reverts',()=>{
 assert.match(HTML,/RPC UNAVAILABLE/);
 assert.match(HTML,/nextRpcAllowedAt/);
 assert.match(HTML,/rpcCooldown/);
});
