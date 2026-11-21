"""Local-only configuration, content validation and durable testnet transactions."""
import hashlib
import json
import os
import re
import struct
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = Path(os.environ.get("NIUMA_ENV_FILE", ROOT.parent / ".env"))
load_dotenv(ENV_FILE, override=False)
if not os.environ.get("HF_TOKEN") and os.name == "nt":
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
        try:
            os.environ["HF_TOKEN"] = winreg.QueryValueEx(key, "HF_TOKEN")[0]
        except FileNotFoundError:
            pass

RUNTIME = ROOT / ".runtime"
RUNTIME.mkdir(exist_ok=True)
DEPLOYMENT = json.loads((ROOT / "evidence/deployment.json").read_text(encoding="utf-8-sig"))
BLOB_ACCESS = os.getenv("BLOB_ACCESS", "public")


def now():
    return datetime.now(timezone.utc).isoformat()


def save(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def safe_error(error):
    text = str(error)
    for key, value in os.environ.items():
        if value and re.search(r"PRIVATE_KEY|TOKEN|SECRET", key):
            text = text.replace(value, "[REDACTED]")
    text = re.sub(r"https?://[^\s\"']+", "[URL]", text)
    return re.sub(r"hf_[A-Za-z0-9]+", "[REDACTED]", text)


def chain():
    w3 = Web3(Web3.HTTPProvider(os.getenv("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz"), request_kwargs={"timeout": 40}))
    if w3.eth.chain_id != 10143:
        raise RuntimeError("Refusing all operations outside Monad testnet 10143")
    artifact = ROOT / "packages/foundry/out/NiumaWorks.sol/NiumaWorks.json"
    abi = json.loads(artifact.read_text(encoding="utf-8"))["abi"]
    contract = w3.eth.contract(address=Web3.to_checksum_address(DEPLOYMENT["address"]), abi=abi)
    return w3, contract


def prompt_hash(prompt):
    # Exact UTF-8 text, without normalization. Also used by the TypeScript API.
    return Web3.keccak(text=prompt)


def validate_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("Not a nonempty GLB")
    _, version, length = struct.unpack_from("<III", data)
    if version != 2 or length != len(data):
        raise ValueError("Invalid GLB header/version/declared length")
    size, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A or 20 + size > len(data):
        raise ValueError("Missing GLB JSON chunk")
    document = json.loads(data[20:20 + size])
    if not document.get("meshes"):
        raise ValueError("GLB has no meshes")
    if any(b.get("uri") for b in document.get("buffers", [])):
        raise ValueError("GLB must embed buffers")
    if any(i.get("uri") for i in document.get("images", [])):
        raise ValueError("GLB must embed textures")
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "meshes": len(document["meshes"]), "textures": len(document.get("images", []))}


def send(w3, function, role, label, value=0):
    """Persist the original signed transaction hash BEFORE broadcasting; never resubmit."""
    from web3.exceptions import TransactionNotFound
    path = RUNTIME / "transactions" / (label + ".json")
    if path.exists():
        record = json.loads(path.read_text(encoding="utf-8"))
        try:
            receipt = w3.eth.get_transaction_receipt(record["hash"])
        except TransactionNotFound:
            raise RuntimeError(f"Original transaction {record['hash']} has no receipt; reconcile it before continuing") from None
    else:
        key = os.environ.get(role + "_PRIVATE_KEY")
        if not key:
            raise RuntimeError(role + "_PRIVATE_KEY is missing")
        account = w3.eth.account.from_key(key)
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        estimate = function.estimate_gas({"from": account.address, "value": value})
        gas = (estimate * 110 + 99) // 100
        priority = w3.to_wei(2, "gwei")
        base = w3.eth.get_block("latest")["baseFeePerGas"]
        transaction = function.build_transaction({"from": account.address, "nonce": nonce, "chainId": 10143, "gas": gas, "value": value, "type": 2, "maxFeePerGas": base * 2 + priority, "maxPriorityFeePerGas": priority})
        if w3.eth.get_balance(account.address) < value + gas * transaction["maxFeePerGas"]:
            raise RuntimeError("Insufficient testnet MON")
        signed = account.sign_transaction(transaction)
        record = {"hash": Web3.to_hex(signed.hash), "sender": account.address, "nonce": nonce, "gasLimit": gas, "valueWei": str(value), "startedAt": now(), "state": "PRE_BROADCAST"}
        save(path, record)
        w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(signed.hash, timeout=180, poll_latency=1)
    if receipt["status"] != 1:
        raise RuntimeError("Transaction reverted: " + record["hash"])
    record.update(state="CONFIRMED", blockNumber=receipt["blockNumber"], gasUsed=receipt["gasUsed"], effectiveGasPriceWei=str(receipt["effectiveGasPrice"]), confirmedAt=now())
    record["chargedFeeWei"] = str(record["gasLimit"] * receipt["effectiveGasPrice"])
    save(path, record)
    return record, receipt


def blob_path(order_id, name):
    return f"niuma/{DEPLOYMENT['address'].lower()}/orders/{int(order_id)}/{name}"


def publish_progress(record):
    from vercel.blob.sync import put_blob
    public = {k: v for k, v in record.items() if k not in {"imagePath", "glbPath", "pngPath", "sourcePath", "gradioResults"}}
    body = json.dumps(public, ensure_ascii=False).encode()
    path = blob_path(record["orderId"], "progress.json")
    result = put_blob(path, body, access=BLOB_ACCESS, content_type="application/json", allow_overwrite=True, cache_control_max_age=60)
    put_blob(path + ".versions/" + result.etag.encode().hex() + ".json", body, access=BLOB_ACCESS, content_type="application/json", allow_overwrite=False, cache_control_max_age=60)
    return result.url
