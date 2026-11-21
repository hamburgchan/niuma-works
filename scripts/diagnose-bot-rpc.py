"""Read-only batched estimate diagnostic using the already funded failed batch."""
import json
import httpx
from niuma import ROOT, chain, now, save
w3, contract = chain()
batch = json.loads((ROOT / "evidence/bots/b4477613-1a3a-4451-bb44-dd5dbf9f51dd.json").read_text(encoding="utf-8"))
requests = [dict(jsonrpc="2.0", id=row["index"], method="eth_estimateGas", params=[dict(
    to=contract.address, **{"from": row["address"]}, value=hex(10**15),
    data=contract.encode_abi("finishRun", args=[row["characterId"], row["stars"], row["timeMs"]]))]) for row in batch["rows"]]
response = httpx.post("https://testnet-rpc.monad.xyz", json=requests, timeout=60)
response.raise_for_status()
results = response.json()
report = dict(at=now(), scope="READ_ONLY: 30 eth_estimateGas calls in one HTTP batch. No signing, no broadcast, no financial retry.",
              httpStatus=response.status_code, successfulEstimates=sum("result" in item for item in results), errors=[item for item in results if "error" in item],
              results=results, originalFinancialBatchStatus="FAILED: 0 finishRun broadcasts; unchanged")
save(ROOT / "evidence/bots/batched-rpc-diagnostic.json", report)
print(json.dumps({k:v for k,v in report.items() if k != "results"}, ensure_ascii=False))
