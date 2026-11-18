#!/usr/bin/env python3
"""Deploy the openmovies-api Worker + D1 via the Cloudflare API (surrogate auth).

Steps: find dawnstudio.app zone/account -> create D1 + apply schema ->
transpile worker/index.ts -> upload worker module with bindings ->
attach Workers Custom Domain openmovies-api.dawnstudio.app.
AUTH_SECRET is generated once and kept in .deploy-secrets.json (0600, gitignored).
RESEND_API_KEY is included only if present in the environment — without it the
worker's code flow returns an honest 501 (mail not configured).
"""
import json, os, subprocess, sys, secrets as pysecrets, urllib.request, urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRETS_FILE = os.path.join(ROOT, ".deploy-secrets.json")
HOST = "openmovies-api.dawnstudio.app"
SERVICE = "openmovies-api"

def cf(method, path, data=None, raw_body=None, content_type=None):
    body = raw_body if raw_body is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request("https://api.cloudflare.com" + path, data=body, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "muse-openmovies-deploy")
    if content_type: req.add_header("Content-Type", content_type)
    elif data is not None: req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=["api.cloudflare.com"])
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            ct = resp.headers.get("Content-Type", "")
            return read_json_response(resp) if "json" in ct else resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {e.read()[:500]!r}")

# --- zone / account ---
zones = cf("GET", "/client/v4/zones?name=dawnstudio.app")["result"]
assert zones, "dawnstudio.app zone not found"
zone = zones[0]
ZONE_ID, ACCOUNT = zone["id"], zone["account"]["id"]
print("zone account:", ACCOUNT)

# --- D1 ---
dbs = cf("GET", f"/client/v4/accounts/{ACCOUNT}/d1/database?name=openmovies-db")["result"]
if dbs:
    db_id = dbs[0]["uuid"]; print("D1 exists:", db_id)
else:
    db_id = cf("POST", f"/client/v4/accounts/{ACCOUNT}/d1/database", {"name": "openmovies-db"})["result"]["uuid"]
    print("D1 created:", db_id)
schema = open(os.path.join(ROOT, "worker", "schema.sql")).read()
stmts = []
for chunk in schema.split(";"):
    lines = [ln for ln in chunk.splitlines() if not ln.strip().startswith("--")]
    s = "\n".join(lines).strip()
    if s: stmts.append(s)
for s in stmts:
    cf("POST", f"/client/v4/accounts/{ACCOUNT}/d1/database/{db_id}/query", {"sql": s})
print("schema applied:", len(stmts), "statements")

# --- auth secret (generated once, never printed) ---
if os.path.exists(SECRETS_FILE):
    auth_secret = json.load(open(SECRETS_FILE))["AUTH_SECRET"]
else:
    auth_secret = pysecrets.token_hex(32)
    with open(SECRETS_FILE, "w") as f: json.dump({"AUTH_SECRET": auth_secret}, f)
    os.chmod(SECRETS_FILE, 0o600)
    print("AUTH_SECRET generated + stored 0600")

# --- transpile worker ---
outdir = "/tmp/openmovies-worker-build"
subprocess.run(["npx", "tsc", "worker/index.ts", "--outDir", outdir, "--module", "esnext",
                "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
               cwd=ROOT, check=True, capture_output=True)
worker_js = open(os.path.join(outdir, "index.js"), "rb").read()
print("worker bundle bytes:", len(worker_js))

# --- upload worker (multipart: metadata + module) ---
bindings = [
    {"type": "d1", "name": "DB", "database_id": db_id},
    {"type": "secret_text", "name": "AUTH_SECRET", "text": auth_secret},
    {"type": "plain_text", "name": "MAIL_FROM", "text": "OpenMovies <login@dawnstudio.app>"},
]
resend = os.environ.get("RESEND_API_KEY")
if resend:
    bindings.append({"type": "secret_text", "name": "RESEND_API_KEY", "text": resend})
    print("RESEND_API_KEY binding included from env")
else:
    print("NOTE: no RESEND_API_KEY in env — code emails will 501 until the secret is set")
metadata = {"main_module": "index.js", "bindings": bindings, "compatibility_date": "2026-06-05"}
boundary = "----omw" + pysecrets.token_hex(8)
parts = []
def part(name, filename, ctype, data):
    head = f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n".encode()
    parts.append(head + data + b"\r\n")
part("metadata", "metadata.json", "application/json", json.dumps(metadata).encode())
part("index.js", "index.js", "application/javascript+module", worker_js)
body = b"".join(parts) + f"--{boundary}--\r\n".encode()
r = cf("PUT", f"/client/v4/accounts/{ACCOUNT}/workers/scripts/{SERVICE}", raw_body=body,
       content_type=f"multipart/form-data; boundary={boundary}")
print("worker uploaded:", r["result"].get("id", SERVICE))

# --- custom domain (delete conflicting DNS first, per Dawn recipe) ---
recs = cf("GET", f"/client/v4/zones/{ZONE_ID}/dns_records?name={HOST}")["result"]
for rec in recs:
    try:
        cf("DELETE", f"/client/v4/zones/{ZONE_ID}/dns_records/{rec['id']}")
        print("deleted conflicting DNS record:", rec["type"], HOST)
    except RuntimeError as e:
        # 1043 = read-only: this is the Workers-managed record from a previous
        # attach of this very domain — nothing to delete.
        print("DNS record kept (managed/read-only):", rec["type"], HOST, str(e)[:80])
try:
    cf("PUT", f"/client/v4/accounts/{ACCOUNT}/workers/domains",
       {"hostname": HOST, "service": SERVICE, "environment": "production"})
    print("workers custom domain attached:", HOST)
except RuntimeError as e:
    if "already" in str(e).lower() or "100117" in str(e):
        print("workers custom domain already attached:", HOST)
    else:
        raise
print("API DEPLOY DONE")
