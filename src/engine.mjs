import {Interface,getAddress,isHexString,parseUnits,formatUnits} from 'ethers';

export const CHAIN=Object.freeze({name:'Pharos Atlantic Testnet',chainId:688689,rpc:'https://atlantic.dplabs-internal.com',nativeSymbol:'PHRS',explorer:'https://atlantic.pharosscan.xyz'});
export const SAMPLE=Object.freeze({
 contract:'0x934403227468426b33c26536dABC33b066B73f73',
 from:'0x74B2c2E4E4B771F0C75dcE44f40787468E323f79',
 amount:'1',maxGasUnits:'400000',maxGasCostPhrs:'0.02',gasBufferBps:'2000'
});
const saga=new Interface([
 'function pending(address) view returns (uint256)',
 'function deposited(address) view returns (uint256)',
 'function tokenA() view returns (address)',
 'function undoDeposit(uint256)',
 'function deposit(uint256)',
 'function compensateSwap(uint256)'
]);
const erc20=new Interface(['function balanceOf(address) view returns (uint256)']);
const errorAbi=new Interface(['error Error(string)','error Panic(uint256)']);
const methods=Object.freeze({undoDeposit:'Undo a completed test-vault deposit',deposit:'Deposit pending test credits',compensateSwap:'Refund pending test credit to asset A'});
const nonneg=(value,k)=>{const s=String(value);if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s))throw Error(k+' must be a positive decimal string (0 allowed for the gas cap)');return s};
export function validate(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid input');
 const input={...SAMPLE,...raw};
 const contract=getAddress(input.contract);
 const from=getAddress(input.from);
 const method=String(input.method||'undoDeposit');
 if(!Object.hasOwn(methods,method))throw Error('Unsupported method: '+method);
 const amount=nonneg(input.amount,'amount');
 const amountWei=parseUnits(amount,18);
 if(amountWei<=0n)throw Error('Amount must be greater than zero');
 const maxGasUnits=nonneg(input.maxGasUnits,'maxGasUnits');
 const maxGasCostPhrs=nonneg(input.maxGasCostPhrs,'maxGasCostPhrs');
 const gasBufferBps=nonneg(input.gasBufferBps,'gasBufferBps');
 if(BigInt(maxGasUnits)<21000n||BigInt(maxGasUnits)>15000000n)throw Error('Gas unit limit out of allowed range');
 if(BigInt(gasBufferBps)>10000n)throw Error('Gas buffer >100%');
 if(parseUnits(maxGasCostPhrs,18)>parseUnits('10',18))throw Error('Gas cap may not exceed 10 PHRS');
 return {contract,from,method,amount,amountWei,maxGasUnits,maxGasCostPhrs,gasBufferBps};
}
function hexAddr(data){
 if(typeof data!=='string'||!isHexString(data,32))throw Error('Invalid returned address');
 return getAddress('0x'+data.slice(-40));
}
function hexNumber(result,name){
 if(typeof result!=='string'||!/^0x[0-9a-fA-F]+$/.test(result))throw Error('Invalid '+name+' result');
 return BigInt(result);
}
function parseRpcError(e){
 const message=String(e?.rpcMessage||e?.message||'Unknown RPC error');
 let data=e?.rpcData;
 if(data&&typeof data==='object')data=data.data||data.originalError?.data;
 if(typeof data==='string'&&isHexString(data)){
  try{
   const parsed=errorAbi.parseError(data);
   if(parsed?.name==='Error')return String(parsed.args[0]);
   if(parsed?.name==='Panic')return 'EVM panic: '+parsed.args[0];
  }catch{}
 }
 const reason=message.match(/(?:execution reverted|reverted)(?::\s*(.*))?/i);
 return reason?(reason[1]?.trim()||'Execution reverted (no decoded reason returned)'):message.slice(0,300);
}
const readValue=async(rpc,to,abi,method,args,block)=>{
 const output=await rpc('eth_call',[{to,data:abi.encodeFunctionData(method,args)},block]);
 return abi.decodeFunctionResult(method,output)[0];
};
const view=(state)=>Object.fromEntries(Object.entries(state).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v]));
export async function simulate(raw,rpc){
 const cfg=validate(raw);
 const at=new Date().toISOString();
 const chainId=Number(hexNumber(await rpc('eth_chainId'),'chain id'));
 if(chainId!==CHAIN.chainId)throw Error('Wrong chain; expected Pharos Atlantic 688689, got '+chainId);
 const [block,gasPriceHex,code]=await Promise.all([
  rpc('eth_blockNumber'),rpc('eth_gasPrice'),rpc('eth_getCode',[cfg.contract,'latest'])
 ]);
 const blockNum=hexNumber(block,'block number');
 const gasPriceWei=hexNumber(gasPriceHex,'gas price');
 if(gasPriceWei===0n)throw Error('Zero gas price from RPC');
 if(typeof code!=='string'||code==='0x')throw Error('SagaPlayground contract has no deployed code');
 const method=cfg.method;
 const tx={from:cfg.from,to:cfg.contract,value:'0x0',data:saga.encodeFunctionData(method,[cfg.amountWei])};
 const tokenAAddress=hexAddr(await rpc('eth_call',[{to:cfg.contract,data:saga.encodeFunctionData('tokenA',[])},block]));
 const [pending,deposited,balanceA,balanceNative]=await Promise.all([
  readValue(rpc,cfg.contract,saga,'pending',[cfg.from],block),
  readValue(rpc,cfg.contract,saga,'deposited',[cfg.from],block),
  readValue(rpc,tokenAAddress,erc20,'balanceOf',[cfg.from],block),
  rpc('eth_getBalance',[cfg.from,block])
 ]);
 const before={
  pendingTestBWei:pending.toString(),depositedSharesWei:deposited.toString(),
  balanceTestAWei:balanceA.toString(),balancePhrsWei:hexNumber(balanceNative,'native balance').toString()
 };
 const report={
  schema:'pharos-dry-run-v1',observedAt:at,network:CHAIN.name,chainId:CHAIN.chainId,
  blockNumber:blockNum.toString(),blockHex:block,contract:cfg.contract,from:cfg.from,
  functionName:method,description:methods[method],amountWei:cfg.amountWei.toString(),
  simulationOnly:true,transactionBroadcast:false,readOnlyRpcMethods:
  ['eth_chainId','eth_blockNumber','eth_getCode','eth_getBalance','eth_gasPrice','eth_call','eth_estimateGas'],
  before,afterProjected:null,afterObserved:null,
  gasPriceWei:gasPriceWei.toString(),gasPriceGwei:formatUnits(gasPriceWei,9),
  gasEstimateUnits:null,recommendedGasLimit:null,estimatedGasCostPhrs:null,
  maxPossibleGasCostPhrs:null,revertReason:null,
  input:{amount:cfg.amount,maxGasUnits:cfg.maxGasUnits,maxGasCostPhrs:cfg.maxGasCostPhrs,gasBufferBps:cfg.gasBufferBps},
  decision:'BLOCKED',successPredicted:false,reason:'',
  preparedUnsignedTransaction:null
 };
 // Contract-state projection is conditional on a passing EVM simulation.
 try{
  await rpc('eth_call',[tx,block]);
 }catch(e){
  report.revertReason=parseRpcError(e);
  report.reason='EVM eth_call failed (revert or RPC error); execution blocked. No gas estimate is claimed.';
  report.rpcFailureType=e?.code==='RPC_PROVIDER_ERROR'?'RPC_ERROR':'CALL_ERROR';
  return report;
 }
 let gasEstimate;
 try{
  gasEstimate=hexNumber(await rpc('eth_estimateGas',[tx,block]),'gas estimate');
 }catch(e){
  report.revertReason=parseRpcError(e);
  report.reason='eth_call passed, but eth_estimateGas failed; fail closed and block execution.';
  return report;
 }
 const limit=(gasEstimate*(10000n+BigInt(cfg.gasBufferBps))+9999n)/10000n;
 const estimatedWei=gasEstimate*gasPriceWei;
 const limitWei=limit*gasPriceWei;
 report.gasEstimateUnits=gasEstimate.toString();
 report.recommendedGasLimit=limit.toString();
 report.estimatedGasCostPhrs=formatUnits(estimatedWei,18);
 report.maxPossibleGasCostPhrs=formatUnits(limitWei,18);
 const costMaxWei=parseUnits(cfg.maxGasCostPhrs,18);
 if(gasEstimate>BigInt(cfg.maxGasUnits)||limitWei>costMaxWei){
  report.reason='Safety policy blocked: estimated gas or buffered gas cost exceeds configured cap.';
  return report;
 }
 if(estimatedWei>hexNumber(balanceNative,'native balance')){
  report.reason='Sender does not have enough PHRS to cover estimated gas; preparation blocked.';
  return report;
 }
 const after={...before};
 if(method==='undoDeposit'){
  if(deposited<cfg.amountWei){report.reason='Contradiction: simulated success but deposited balance insufficient';return report;}
  after.pendingTestBWei=(pending+cfg.amountWei).toString();
  after.depositedSharesWei=(deposited-cfg.amountWei).toString();
 }else if(method==='deposit'){
  if(pending<cfg.amountWei){report.reason='Contradiction: simulated success but pending balance insufficient';return report;}
  after.pendingTestBWei=(pending-cfg.amountWei).toString();
  after.depositedSharesWei=(deposited+cfg.amountWei).toString();
 }else {
  if(pending<cfg.amountWei){report.reason='Contradiction: simulated success but refund pending insufficient';return report;}
  after.pendingTestBWei=(pending-cfg.amountWei).toString();
  after.balanceTestAWei=(balanceA+cfg.amountWei).toString();
 }
 report.afterProjected=after;
 report.successPredicted=true;
 report.decision='READY_TO_PREPARE';
 report.reason='eth_call and eth_estimateGas succeeded at the pinned block. A safe unsigned transaction is prepared; nothing is sent.';
 report.preparedUnsignedTransaction={from:cfg.from,to:cfg.contract,value:'0x0',data:tx.data,gasLimit:'0x'+limit.toString(16),chainId:CHAIN.chainId};
 return report;
}
