// Vercel 52 embeds the Windows hostname in an HTTP header. Encode it as ASCII
// for this CLI process only; never change OS configuration or TLS verification.
const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');
const originalHostname = os.hostname;
os.hostname = () => originalHostname().replace(/[^\x20-\x7e]/g, '_');
syncBuiltinESMExports();
