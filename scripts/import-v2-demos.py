"""Register exact public static PNGs on V2, preserving V1 and original hashes."""
import hashlib,json,os,time,httpx
from niuma import ROOT,chain,send,save,prompt_hash,now,safe_error
try:
 w,_=chain();d=json.loads((ROOT/'evidence/deployment-v2.json').read_text());a=json.loads((ROOT/'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text());c=w.eth.contract(address=d['address'],abi=a['abi']);manifest=[]
 for i,slug in enumerate(['mule','alpaca','programmer'],1):
  prior=json.loads((ROOT/f'evidence/orders/{i+5}.json').read_text(encoding='utf-8'));p=ROOT/f'evidence/v2/orders/{i}.json'
  record=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {k:prior[k] for k in ['displayName','prompt','source','generationSource','bytes','sha256','width','height','assetType']}
  url=f'https://niuma-works.vercel.app/chars/{record["sha256"]}.png'
  r=httpx.get(url,timeout=30);r.raise_for_status()
  if hashlib.sha256(r.content).hexdigest()!=record['sha256']:raise ValueError('Static download hash mismatch')
  record.update(contract=d['address'],version='V2',url=url,publicDownloadVerified=True,downloadedSha256=hashlib.sha256(r.content).hexdigest(),publicDownloadBytes=len(r.content));save(p,record)
  tx,receipt=send(w,c.functions.order(prompt_hash(record['prompt']),int(time.time())+3600),'BUYER',f'v2-{slug}-order',value=c.functions.characterPrice().call())
  oid=c.events.Ordered().process_receipt(receipt,errors=__import__('web3').logs.DISCARD)[0]['args']['orderId'];record.update(orderId=oid,orderTransaction=tx);save(p,record)
  tx,receipt=send(w,c.functions.deliver(oid,bytes.fromhex(record['sha256']),url),'OPERATOR',f'v2-{slug}-deliver')
  cid=c.events.Delivered().process_receipt(receipt,errors=__import__('web3').logs.DISCARD)[0]['args']['characterId'];record.update(characterId=cid,deliverTransaction=tx);save(p,record)
  tx,receipt=send(w,c.functions.approve(oid),'BUYER',f'v2-{slug}-approve');paid=c.events.Paid().process_receipt(receipt,errors=__import__('web3').logs.DISCARD)[0]['args']
  character=c.functions.characters(cid).call();order=c.functions.orders(oid).call()
  if character[1].hex()!=record['sha256'] or character[2]!=url or order[3]!=2:raise ValueError('Chain readback mismatch')
  record.update(approveTransaction=tx,recipients=list(paid['recipients']),splitAmountsWei=[str(v) for v in paid['amounts']],status='paid',verifiedAt=now());save(p,record)
  manifest.append(dict(id=cid,orderId=oid,name=record['displayName'],slug=slug,url=url,sha256=record['sha256'],prompt=record['prompt'],source=record['source'],generationSource=record['generationSource'],assetType='png',bytes=record['bytes'],orderHash=record['orderTransaction']['hash'],deliverHash=record['deliverTransaction']['hash'],approveHash=tx['hash'],splitAmountsWei=record['splitAmountsWei']))
  print(json.dumps({'name':record['displayName'],'id':cid,'approve':tx['hash'],'sha256':record['sha256'],'bytes':len(r.content)},ensure_ascii=False),flush=True)
 save(ROOT/'packages/nextjs/contracts/demoCharacters.json',manifest)
except Exception as e:print(safe_error(e));raise SystemExit(1)
