import json,subprocess,httpx
from niuma import ROOT,save,safe_error
try:
 p=ROOT/'evidence/deployment-v2.json';d=json.loads(p.read_text())
 standard=subprocess.check_output(['forge','verify-contract',d['address'],d['contract'],'--chain','10143','--show-standard-json-input'],cwd=ROOT/'packages/foundry',text=True)
 artifact=json.loads((ROOT/'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text());m=artifact['metadata']
 if isinstance(m,str):m=json.loads(m)
 payload=dict(chainId=10143,contractAddress=d['address'],contractName=d['contract'],compilerVersion='v'+m['compiler']['version'],standardJsonInput=json.loads(standard),foundryMetadata=m,constructorArgs=d['constructorArgs'])
 r=httpx.post('https://agents.devnads.com/v1/verify',json=payload,timeout=120)
 save(ROOT/'evidence/verification-v2.json',dict(status=r.status_code,response=r.json()))
 if r.status_code!=200 or not r.json().get('success'):raise ValueError('Verification failed; original deployment retained')
 d['verification']='VERIFIED';save(p,d);print('V2 source VERIFIED')
except Exception as e:print(safe_error(e));raise SystemExit(1)
