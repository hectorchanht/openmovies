#!/usr/bin/env python3
"""Deploy the OpenMovies web tier: build (with the API base baked in) ->
verify the bundle -> Pages direct upload (proven Dawn route via
~/workspace/pages-deploy-dir.py) + attach openmovies.dawnstudio.app as a Pages
custom domain (CNAME -> openmovies.pages.dev, proxied) + purge the zone cache.

PUBLIC_API_BASE is FAIL-CLOSED here, mirroring deploy-api.py's Resend fix:
the web client reads PUBLIC_API_BASE at build time (src/lib/api.ts ->
apiConfigured()). A bundle built without it silently disables email sign-in,
the Worker /resolve edge-cache path and provider health chips — exactly the
2026-11-18 incident, where production shipped with the API unconfigured. So
this script ALWAYS builds with PUBLIC_API_BASE set to the production API
origin itself, then greps the build output for that origin and ABORTS the
deploy if it is absent. Never deploy a pre-built build/ directory by hand."""
import json, os, subprocess, sys, urllib.request, urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

ACCOUNT = "f1868a071996e836eae6da2b65f37929"  # Dawn Pages account (pages-deploy-dir.py)
PROJECT, HOST = "openmovies", "openmovies.dawnstudio.app"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_BASE = "https://openmovies-api.dawnstudio.app"

# --- build with the API base + TMDB key baked in (fail-closed) ---
# PUBLIC_TMDB_API_KEY comes from the caller's environment only (a by-design
# public v3 key that ships in the bundle). It is never printed or logged;
# if it is unset the deploy ABORTS rather than shipping the demo catalogue.
TMDB_KEY = os.environ.get("PUBLIC_TMDB_API_KEY", "")
if not TMDB_KEY:
    # Reuse what Hector already gave (2026-11-20), stored for exactly
    # this purpose in .deploy-secrets.json (0600, gitignored) per his
    # 2026-11-24 rule: what he gives must be remembered and reusable
    # next time - never ask again for a key that is already on file.
    try:
        with open(os.path.join(ROOT, ".deploy-secrets.json")) as f:
            TMDB_KEY = json.load(f).get("TMDB_API_KEY", "")
        if TMDB_KEY:
            print("PUBLIC_TMDB_API_KEY loaded from stored secrets (value withheld)")
    except Exception:
        TMDB_KEY = ""
if not TMDB_KEY:
    raise SystemExit(
        "ABORT: PUBLIC_TMDB_API_KEY is not set in the environment — the web "
        "bundle would fall back to the demo catalogue. Refusing to deploy.")
env = {**os.environ, "PUBLIC_API_BASE": API_BASE, "PUBLIC_TMDB_API_KEY": TMDB_KEY}
subprocess.run(["npm", "run", "build"], cwd=ROOT, env=env, check=True)
build_dir = os.path.join(ROOT, "build")
def bundle_contains(needle: bytes) -> bool:
    for dirpath, _dirs, files in os.walk(build_dir):
        for name in files:
            with open(os.path.join(dirpath, name), "rb") as f:
                if needle in f.read():
                    return True
    return False
if not bundle_contains(API_BASE.encode()):
    raise SystemExit(
        f"ABORT: {API_BASE} not found anywhere in build/ — PUBLIC_API_BASE did "
        "not make it into the bundle, so apiConfigured() would be false in "
        "production. Refusing to deploy an API-less web tier.")
if not bundle_contains(TMDB_KEY.encode()):
    raise SystemExit(
        "ABORT: the TMDB key was not found anywhere in build/ — "
        "PUBLIC_TMDB_API_KEY did not make it into the bundle, so the site "
        "would serve the demo catalogue. Refusing to deploy.")
print("pre-flight OK: bundle contains PUBLIC_API_BASE =", API_BASE, "+ TMDB key (value withheld)")

def cf(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request("https://api.cloudflare.com" + path, data=body, method=method)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "muse-openmovies-web-deploy")
    if data is not None: req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=["api.cloudflare.com"])
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return read_json_response(resp)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {e.read()[:500]!r}")

subprocess.run([sys.executable, "/home/hatch/workspace/pages-deploy-dir.py", PROJECT, "build"],
               cwd="/home/hatch/workspace/openmovies-app", check=True)

zone = cf("GET", "/client/v4/zones?name=dawnstudio.app")["result"][0]
zid = zone["id"]
# Pages custom domain
try:
    r = cf("POST", f"/client/v4/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains", {"name": HOST})
    print("pages domain:", r["result"].get("status", "created"))
except RuntimeError as e:
    print("pages domain attach note:", str(e)[:200])
# CNAME -> project subdomain (proxied)
proj = cf("GET", f"/client/v4/accounts/{ACCOUNT}/pages/projects/{PROJECT}")["result"]
target = proj["subdomain"]
recs = cf("GET", f"/client/v4/zones/{zid}/dns_records?name={HOST}")["result"]
if recs:
    rec = recs[0]
    if rec["content"] != target:
        cf("PUT", f"/client/v4/zones/{zid}/dns_records/{rec['id']}",
           {"type": "CNAME", "name": HOST, "content": target, "proxied": True, "ttl": 1})
        print("CNAME updated ->", target)
    else:
        print("CNAME already correct ->", target)
else:
    cf("POST", f"/client/v4/zones/{zid}/dns_records",
       {"type": "CNAME", "name": HOST, "content": target, "proxied": True, "ttl": 1})
    print("CNAME created ->", target)
cf("POST", f"/client/v4/zones/{zid}/purge_cache", {"purge_everything": True})
print("zone purged. WEB DEPLOY DONE")
