"""Optional loopback-only owner-signed browser trigger for the same local bot engine."""
import json,time,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from eth_account.messages import encode_defunct
from niuma import ROOT,chain,safe_error
from bot_engine import execute
allowed={'https://niuma-works.vercel.app','http://127.0.0.1:3000','http://localhost:3000'}
busy=False;seen=set();guard=threading.Lock()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def reply(self,status,body):
  self.send_response(status);origin=self.headers.get('Origin','')
  if origin in allowed:self.send_header('Access-Control-Allow-Origin',origin)
  self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','POST, GET, OPTIONS');self.send_header('Access-Control-Allow-Private-Network','true');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
 def do_OPTIONS(self):self.reply(200,{})
 def do_POST(self):
  global busy
  try:
   if self.path!='/bots' or self.headers.get('Origin') not in allowed:raise ValueError('Origin/path denied')
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<4096:raise ValueError('Invalid request size')
   b=json.loads(self.rfile.read(length));n=b['count'];bid=b['batchId'];issued=b['issuedAt']
   if n!=30 or abs(time.time()*1000-issued)>120000 or not isinstance(bid,str) or len(bid)!=36:raise ValueError('Invalid/expired request')
   w,_=chain();d=json.loads((ROOT/'evidence/deployment-v2.json').read_text());a=json.loads((ROOT/'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text());c=w.eth.contract(address=d['address'],abi=a['abi'])
   message=f"NIUMA WORKS bot rush\nchainId: 10143\ncontract: {d['address']}\ncount: {n}\nbatchId: {bid}\nissuedAt: {issued}"
   if w.eth.account.recover_message(encode_defunct(text=message),signature=b['signature']).lower()!=c.functions.owner().call().lower():raise ValueError('Owner signature required')
   with guard:
    if busy or bid in seen:raise ValueError('Busy or original request already accepted')
    busy=True;seen.add(bid)
   def run():
    global busy
    try:execute(n,'spread','v2')
    finally:busy=False
   threading.Thread(target=run,daemon=True).start();self.reply(202,{'started':True,'requestId':bid})
  except Exception as e:self.reply(400,{'error':safe_error(e)[:180]})
print('Loopback bot worker on 127.0.0.1:8787; owner-signed browser requests only. CLI uses the same bot_engine.',flush=True)
ThreadingHTTPServer(('127.0.0.1',8787),Handler).serve_forever()
