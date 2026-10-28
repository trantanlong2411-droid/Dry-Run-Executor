import {simulate,CHAIN} from './engine.mjs';
import {HTML} from './page.mjs';
const MAX_BODY=6000;
async function rpc(method,params=[]){
 const response=await fetch(CHAIN.rpc,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
  signal:AbortSignal.timeout(18000)
 });
 let value;
 try{value=await response.json()}catch{throw Error('Pharos RPC returned a non-JSON response');}
 if(!response.ok)throw Error('Pharos RPC HTTP '+response.status);
 if(value.error){
  const error=Error(value.error.message||'Unknown Pharos RPC error');
  error.code='RPC_PROVIDER_ERROR';error.rpcMessage=value.error.message;
  error.rpcData=value.error.data;
  throw error;
 }
 if(value.result===undefined||value.result===null)throw Error(method+' returned an empty result');
 return value.result;
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
export default {
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/'&&request.method==='GET')return new Response(HTML,{headers:{
    'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
  }});
  if(url.pathname==='/api/health'&&request.method==='GET')
   return json({ok:true,name:'dry-run-executor',chainId:CHAIN.chainId,
    network:CHAIN.name,rpc:CHAIN.rpc,readOnly:true,canBroadcast:false,liveChainVerified:false,
    methods:['eth_call','eth_estimateGas','eth_getBalance','eth_getCode','eth_gasPrice']});
  if(url.pathname!=='/api/simulate'||request.method!=='POST')return json({ok:false,error:'Not found'},404);
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)return json({ok:false,error:'Request body too large'},413);
  let body;
  try{const source=await request.text();if(source.length>MAX_BODY)throw Error('Request exceeds 6000 characters');body=JSON.parse(source);}
  catch(e){return json({ok:false,error:'Invalid JSON: '+e.message},400);}
  try{
   const result=await simulate(body,rpc);
   return json({ok:true,report:result});
  }catch(e){
   return json({ok:false,decision:'ERROR_BLOCKED',error:'Simulation unavailable; nothing prepared or sent: '+e.message},400);
  }
 }
};