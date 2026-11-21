# Public store verification

2026-11-21, after user replaced BLOB_READ_WRITE_TOKEN with a token for a new public store:

```text
UPLOAD=PASS; ACCESS=public
UNAUTHENTICATED_CURL=PASS; CONTENT=NIUMA WORKS public Blob verification 2026-11-21
DELETE=PASS
```

The test used a unique small text file and `curl.exe --fail --silent --show-error <public URL>` with no Authorization header, cookies or credentials. The SDK deleted the test object after the download matched.

Order 1 completed on the earlier private store before the switch. Its immutable original chain URI remains private. A public mirror of the exact same post-start GLB is published in the new store and independently hashed against the chain; no new GPU call or replacement character is used for that mirror.
