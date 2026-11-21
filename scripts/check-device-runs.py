"""Verify user-reported device runs by their original receipts, never send."""
from niuma import ROOT,chain,now,save
w3,contract=chain()
samples=[("Claude 内置浏览器，手机尺寸模拟","0x3ed7b7b178c03487c3dc5c6f7ee7969ffc3a844477c5423b45183d894b1624ee",1481),("真实手机","0xe7b78a0f74bbb9d4edf8f6dfc22b62bba96567b104ff13c5d2cac46b711aae57",1149)]
rows=[]
for device,tx_hash,timing in samples:
    receipt=w3.eth.get_transaction_receipt(tx_hash)
    assert receipt.status==1
    event=contract.events.RunFinished().process_receipt(receipt)[0]
    rows.append(dict(device=device,deviceSource="User report; physical device identity is not independently observable from the chain",hash=tx_hash,status="CONFIRMED",blockNumber=receipt.blockNumber,event=dict(event['args']),browserReportedMs=timing))
save(ROOT/"evidence/device-acceptance.json",dict(at=now(),scope="One mobile-size simulated browser plus one real phone, not two real phones",runs=rows))
print("PASS: two original successful RunFinished receipts; device scope preserved")
