#!/usr/bin/env python3
"""Deploy the OpenMovies web tier: Pages direct upload (proven Dawn route via
~/workspace/pages-deploy-dir.py) + attach openmovies.dawnstudio.app as a Pages
custom domain (CNAME -> openmovies.pages.dev, proxied) + purge the zone cache.
Run AFTER `npm run build` with PUBLIC_API_BASE baked in."""
import json, subprocess, sys, urllib.request, urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

ACCOUNT = "f1868a071996e836eae6da2b65f37929"  # Dawn Pages account (pages-deploy-dir.py)
PROJECT, HOST = "openmovies", "openmovies.dawnstudio.app"

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
