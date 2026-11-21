"""Owner-authorized payout update, preserving the on-chain operator."""
import argparse
import hashlib
import json
import os
from niuma import ROOT, chain, now, safe_error, save, send

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for role in ("donkey", "horse", "cow", "treasury"):
        parser.add_argument("--" + role, required=True)
    args = parser.parse_args()
    try:
        w3, contract = chain()
        addresses = [getattr(args, role) for role in ("donkey", "horse", "cow", "treasury")]
        if any(not w3.is_address(address) or int(address, 16) == 0 for address in addresses):
            raise ValueError("All four public payout addresses must be valid and nonzero")
        addresses = [w3.to_checksum_address(address) for address in addresses]
        owner = w3.eth.account.from_key(os.environ["DEPLOYER_PRIVATE_KEY"]).address
        if owner != contract.functions.owner().call():
            raise ValueError("Configured deployer is not the contract owner")
        operator = contract.functions.operator().call()
        label = hashlib.sha256("".join(addresses).lower().encode()).hexdigest()[:16]
        tx, _ = send(w3, contract.functions.setRecipients(operator, addresses[3], addresses[:3]), "DEPLOYER", "recipients-" + label)
        assert contract.functions.operator().call() == operator
        assert contract.functions.treasury().call() == addresses[3]
        assert [contract.functions.payouts(i).call() for i in range(3)] == addresses[:3]
        evidence = {"at": now(), "operatorUnchanged": operator, "donkey": addresses[0], "horse": addresses[1], "cow": addresses[2], "treasury": addresses[3], "transaction": tx, "status": "PASS"}
        save(ROOT / "evidence/recipients-update.json", evidence)
        print(json.dumps(evidence, indent=2))
    except Exception as error:
        print(json.dumps({"error": safe_error(error)}))
        raise SystemExit(1)
