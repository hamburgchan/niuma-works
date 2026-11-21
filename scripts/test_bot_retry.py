"""Offline tests of the actual broadcast function AST. No wallets, signing or network."""
import ast,copy,types,unittest
from pathlib import Path
import httpx

class RetryTests(unittest.TestCase):
 def setUp(self):
  tree=ast.parse(Path(__file__).with_name('bot_engine.py').read_text())
  function=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='broadcast')
  self.rows=[{'hash':'0x'+'01'*32,'state':'PENDING'},{'hash':'0x'+'02'*32,'state':'PENDING'}]
  self.chunk=[(self.rows[0],'0xFIXTURE_SIGNED_A'),(self.rows[1],'0xFIXTURE_SIGNED_B')]
  self.calls=[];self.sleeps=[];self.outcomes=[]
  self.batch={'broadcastHttpRetries':0,'transactionResubmissions':0,'rpcFailures':[]}
  def rpc(method,params):
   self.assertEqual(method,'eth_sendRawTransaction');self.calls.append(copy.deepcopy(params))
   outcome=self.outcomes.pop(0)
   if isinstance(outcome,Exception):raise outcome
   return outcome
  scope={'rpc_batch':rpc,'batch':self.batch,'time':types.SimpleNamespace(sleep=self.sleeps.append),'httpx':httpx,'safe_error':lambda e:type(e).__name__}
  exec(compile(ast.fix_missing_locations(ast.Module(body=[function],type_ignores=[])),'actual-broadcast','exec'),scope)
  self.broadcast=scope['broadcast']
 def http_error(self,status):
  request=httpx.Request('POST','https://fixture.invalid');response=httpx.Response(status,request=request)
  return httpx.HTTPStatusError(str(status),request=request,response=response)
 def success(self):return {i:{'result':r['hash']} for i,r in enumerate(self.rows)}
 def test_429_and_connection_retry_exact_original_raw(self):
  self.outcomes=[self.http_error(429),httpx.ConnectError('fixture'),self.success()];self.broadcast(self.chunk)
  self.assertEqual(len(self.calls),3);self.assertTrue(all(c==self.calls[0] for c in self.calls))
  self.assertEqual(self.sleeps,[1,2]);self.assertEqual(self.batch['broadcastHttpRetries'],2);self.assertEqual(self.batch['transactionResubmissions'],4)
  self.assertTrue(all(r['broadcastAttempts']==3 for r in self.rows))
 def test_retry_bound_preserves_unknown(self):
  self.outcomes=[httpx.ConnectError('fixture') for _ in range(4)];self.broadcast(self.chunk)
  self.assertEqual(len(self.calls),4);self.assertEqual(self.sleeps,[1,2,4]);self.assertTrue(all(r['state']=='UNKNOWN' for r in self.rows))
 def test_http_400_is_not_retried_or_called_chain_revert(self):
  self.outcomes=[self.http_error(400)];self.broadcast(self.chunk)
  self.assertEqual(len(self.calls),1);self.assertEqual(self.batch['transactionResubmissions'],0);self.assertTrue(all(r['state']=='UNKNOWN' for r in self.rows))
 def test_already_known_waits_for_original_receipt(self):
  self.outcomes=[{i:{'error':{'code':-32000,'message':'already known'}} for i in range(2)}];self.broadcast(self.chunk)
  self.assertEqual(len(self.calls),1);self.assertTrue(all(r['state']=='UNKNOWN' for r in self.rows));self.assertEqual(self.batch['transactionResubmissions'],0)

if __name__=='__main__':unittest.main(verbosity=2)
