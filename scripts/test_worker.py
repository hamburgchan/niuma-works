import json
import struct
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch
from web3.exceptions import TransactionNotFound
import niuma
from generate import generate


@contextmanager
def scratch():
    # Keep small inspection fixtures inside the ignored workspace runtime directory.
    directory = niuma.RUNTIME / ("test-" + uuid.uuid4().hex)
    directory.mkdir()
    yield directory


class WorkerSafetyTest(unittest.TestCase):
    def test_glb_rejects_truncation_and_external_dependencies(self):
        def glb(document):
            chunk = json.dumps(document).encode()
            chunk += b" " * (-len(chunk) % 4)
            return struct.pack("<4sIIII", b"glTF", 2, 20 + len(chunk), len(chunk), 0x4E4F534A) + chunk
        with scratch() as folder:
            path = Path(folder) / "asset.glb"
            for data in [b"glTF", glb({"meshes": [{}], "buffers": [{"uri": "external.bin"}]}), glb({"meshes": [{}], "images": [{"uri": "external.png"}]})]:
                path.write_bytes(data)
                with self.assertRaises(ValueError):
                    niuma.validate_glb(path)

    def test_started_gpu_job_cannot_submit_again(self):
        with patch("generate.Client") as client:
            with self.assertRaisesRegex(RuntimeError, "earlier GPU attempt"):
                generate({"gpuAttemptStarted": "previous attempt"}, Path("unused"), Path("unused"))
            client.assert_not_called()

    def test_unknown_transaction_does_not_resend(self):
        with scratch() as folder, patch.object(niuma, "RUNTIME", Path(folder)):
            record = {"hash": "0x" + "01" * 32, "gasLimit": 50000}
            niuma.save(Path(folder) / "transactions/original.json", record)
            w3 = MagicMock()
            w3.eth.get_transaction_receipt.side_effect = TransactionNotFound("Original hash not found")
            with self.assertRaisesRegex(RuntimeError, "reconcile"):
                niuma.send(w3, MagicMock(), "BUYER", "original")
            w3.eth.send_raw_transaction.assert_not_called()
            w3.eth.account.from_key.assert_not_called()

    def test_existing_global_claim_never_submits_a_gpu_job(self):
        with scratch() as folder, patch("generate.Client") as constructor, patch("generate.publish_progress"), patch("vercel.blob.sync.put_blob", side_effect=RuntimeError("Claim already exists")), patch.dict("os.environ", {"HF_TOKEN": "hf_test_placeholder"}):
            flux, trellis = MagicMock(), MagicMock()
            flux.view_api.return_value = {}
            trellis.view_api.return_value = {}
            constructor.side_effect = [flux, trellis]
            record = {"orderId": 123, "seed": 42, "generationPrompt": "test"}
            with self.assertRaisesRegex(RuntimeError, "Claim already exists"):
                generate(record, folder, folder / "job.json")
            flux.submit.assert_not_called()
            trellis.submit.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
