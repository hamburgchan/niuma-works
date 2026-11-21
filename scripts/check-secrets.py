"""Scan staged blobs and Git history without printing any credential values."""
import json
import os
import re
import subprocess
from niuma import ROOT, now, save


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


values = []
for key, value in os.environ.items():
    if value and re.search(r"PRIVATE_KEY|TOKEN|SECRET|DEMO_CODE", key):
        values.append(value.encode())
        if re.search(r"PRIVATE_KEY", key) and value.startswith("0x"):
            values.append(value[2:].encode())
history = {line.split()[0] for line in git("rev-list", "--objects", "--all").splitlines()}
staged = {line.split()[1] for line in git("ls-files", "--stage").splitlines() if not line.startswith(b"160000")}
objects = sorted(history | staged)
process = subprocess.run(["git", "cat-file", "--batch"], input=b"\n".join(objects) + b"\n", capture_output=True, cwd=ROOT, check=True)
data = process.stdout
position = 0
count = 0
commits = 0
hits = []
patterns = [re.compile(rb"hf_[A-Za-z0-9]{24,}"), re.compile(rb"vercel_blob_rw_[A-Za-z0-9_]{20,}"),
            re.compile(rb"(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}"),
            re.compile(rb"(?:PRIVATE_KEY|privateKey|private_key)\s*[:=]\s*['\"]?(?:0x)?[a-fA-F0-9]{64}(?![a-fA-F0-9])"),
            re.compile(rb"(?:VERCEL_TOKEN|HF_TOKEN|BLOB_READ_WRITE_TOKEN|DEMO_CODE)\s*[:=]\s*['\"][A-Za-z0-9_\-]{24,}['\"]")]
for oid in objects:
    end = data.index(b"\n", position)
    header = data[position:end].split()
    position = end + 1
    if len(header) < 3 or header[1] == b"missing":
        continue
    length = int(header[2])
    body = data[position:position + length]
    position += length + 1
    if header[1] not in [b"blob", b"commit", b"tag"]:
        continue
    if header[1] == b"blob": count += 1
    if header[1] == b"commit": commits += 1
    if any(value in body for value in values) or any(pattern.search(body) for pattern in patterns):
        hits.append(oid.decode())
report = {"at": now(), "status": "FAIL" if hits else "PASS", "scannedBlobObjects": count, "scannedCommitObjects":commits, "scope": "All refs, full Git history including commit messages and annotated tags, plus staged files; exact local credentials, contextual private-key assignments, HF/Blob/GitHub token and quoted demo-code patterns. Production DEMO_CODE is unknown to the agent, so exact-value matching is unavailable for it. No credential values are output.", "matchingObjectCount": len(hits), "matchingObjectIds":hits, "headBeforeCommit": git("rev-parse", "HEAD").decode().strip()}
save(ROOT / "evidence/credential-scan.json", report)
print(json.dumps(report))
raise SystemExit(bool(hits))
