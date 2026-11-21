"""One bounded, durable 0.08 test-MON top-up for the existing local UI QA wallet."""
import json
import argparse
import os
from niuma import ROOT,RUNTIME,chain,now,save
w3, contract = chain()
parser=argparse.ArgumentParser(); parser.add_argument("--wages",action="store_true"); parser.add_argument("--v2-public",action="store_true"); args=parser.parse_args()
label="v2-public-ui-qa-funding" if args.v2_public else "ui-wages-qa-funding" if args.wages else "ui-recruit-qa-funding"
path=RUNTIME/"transactions"/f"{label}.json"
if path.exists():
    record=json.loads(path.read_text(encoding="utf-8")); receipt=w3.eth.get_transaction_receipt(record["hash"])
else:
    account=w3.eth.account.from_key(os.environ["BUYER_PRIVATE_KEY"])
    recipient="0x2d5FC86Ccb4dC23AC5c686374C56aB02a139bBBA" if args.v2_public else "0xD4FaB6129F14470E7C46f8cD6f59c1aBc9c489d2"
    transaction=dict(chainId=10143, to=w3.to_checksum_address(recipient), nonce=w3.eth.get_transaction_count(account.address,"pending"), value=3*10**16 if args.wages or args.v2_public else 8*10**16, gas=21000, type=2, maxFeePerGas=w3.eth.gas_price, maxPriorityFeePerGas=2*10**9)
    signed=account.sign_transaction(transaction)
    record=dict(hash=w3.to_hex(signed.hash), sender=account.address, recipient=transaction["to"], nonce=transaction["nonce"], amountWei=str(transaction["value"]), gasLimit=21000, state="PRE_BROADCAST", startedAt=now(),purpose="V2 public game UI acceptance" if args.v2_public else "Recruitment UI test; separate from faucet and bot budgets")
    save(path,record)
    w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt=w3.eth.wait_for_transaction_receipt(signed.hash,timeout=120)
assert receipt.status==1
record.update(state="CONFIRMED",blockNumber=receipt.blockNumber)
save(path,record); save(ROOT/"evidence"/f"{label}.json",record)
print(json.dumps(record))
