#!/usr/bin/env python3
"""Push the current working tree to hectorchanht/openmovies (main) via the
GitHub Git Data API (plain git push is blocked in this environment).
Retries each call; pushes every tracked file as one commit on top of the
current remote head. Usage: python3 scripts/push-github.py "commit message"
"""
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

API = "https://api.github.com/repos/hectorchanht/openmovies"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MSG = sys.argv[1] if len(sys.argv) > 1 else "update"

def call(method, url, payload=None, tries=5):
    body = json.dumps(payload).encode() if payload is not None else None
    last = None
    for i in range(tries):
        req = urllib.request.Request(url, data=body, method=method, headers={"Accept": "application/vnd.github+json"})
        if body: req.add_header("Content-Type", "application/json")
        add_surrogate_to_request(req, "custom.github-pat", allowed_hosts=["api.github.com"])
        try:
            with urllib.request.urlopen(req, timeout=90) as r: return read_json_response(r)
        except Exception as e:  # transient disconnects are common mid-push
            last = e; print(f"retry {i+1}: {type(e).__name__}"); time.sleep(2 * (i + 1))
    raise last

files = subprocess.run(["git", "-C", ROOT, "ls-files"], capture_output=True, text=True, check=True).stdout.split()
head = call("GET", f"{API}/git/ref/heads/main")["object"]["sha"]
base_tree = call("GET", f"{API}/git/commits/{head}")["tree"]["sha"]
tree = []
for rel in files:
    with open(os.path.join(ROOT, rel), "rb") as f: raw = f.read()
    blob = call("POST", f"{API}/git/blobs", {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
    tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
new_tree = call("POST", f"{API}/git/trees", {"base_tree": base_tree, "tree": tree})
commit = call("POST", f"{API}/git/commits", {"message": MSG, "tree": new_tree["sha"], "parents": [head]})
call("PATCH", f"{API}/git/refs/heads/main", {"sha": commit["sha"], "force": False})
print("pushed:", commit["sha"][:8], f"({len(files)} files)")
