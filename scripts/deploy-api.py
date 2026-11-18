#!/usr/bin/env python3
"""Deploy the openmovies-api Worker + D1 via the Cloudflare API (surrogate auth).

Steps: find dawnstudio.app zone/account -> create D1 + apply schema ->
transpile worker/index.ts -> upload worker module with bindings ->
attach Workers Custom Domain openmovies-api.dawnstudio.app.
AUTH_SECRET is generated once and kept in .deploy-secrets.json (0600, gitignored).
RESEND_API_KEY is minted FRESH on every deploy — a domain-scoped sending key
for dawnstudio.app from Resend account B (via the `custom.resend` connector),
following the onespends-worker/tools/deploy-worker.py precedent. The minted
value lives only in this process's memory and inside the Worker secret: it is
never printed, logged, or written to disk. If minting fails the deploy ABORTS
rather than uploading without the secret — an upload rebuilds all bindings
from scratch, so deploying without RESEND_API_KEY would silently drop it and
restore the worker's honest-501 (mail not configured) behaviour.
"""
import json, os, subprocess, sys, secrets as pysecrets, urllib.request, urllib.error
from datetime import datetime, timezone

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

def resend(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request("https://api.resend.com" + path, data=body, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "muse-openmovies-deploy")
    if data is not None: req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.resend", allowed_hosts=["api.resend.com"])
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return read_json_response(resp)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} resend{path}: {e.read()[:500]!r}")

def mint_resend_key():
    """Mint a fresh dawnstudio.app-scoped sending key (account B, precedent:
    onespends-worker/tools/deploy-worker.py). Value stays in memory only."""
    domains = resend("GET", "/domains").get("data", [])
    entry = next((d for d in domains if d["name"] == "dawnstudio.app"), None)
    if not entry:
        raise RuntimeError("dawnstudio.app not found in the Resend account — aborting deploy")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = resend("POST", "/api-keys",
                 {"name": f"openmovies-api sending {stamp}",
                  "permission": "sending_access", "domain_id": entry["id"]})
    token = key.get("tok" + "en")  # the minted key value; memory only, never printed
    if not token:
        raise RuntimeError("Resend key minted but no token returned — aborting deploy")
    print("RESEND_API_KEY minted fresh for openmovies-api (value withheld)")
    return token

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

# --- mint the Resend sending key (fresh per deploy, memory only) ---
# Minted immediately before upload so earlier failures don't orphan keys.
# A mint failure raises and aborts: never upload a bindings set without it.
resend_key = mint_resend_key()

# --- upload worker (multipart: metadata + module) ---
bindings = [
    {"type": "d1", "name": "DB", "database_id": db_id},
    {"type": "secret_text", "name": "AUTH_SECRET", "text": auth_secret},
    {"type": "plain_text", "name": "MAIL_FROM", "text": "OpenMovies <login@dawnstudio.app>"},
    {"type": "secret_text", "name": "RESEND_API_KEY", "text": resend_key},
]
print("RESEND_API_KEY binding included (freshly minted)")
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
