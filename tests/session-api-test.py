"""End-to-end regression for the `session` Edge Function (live backend).

HOW TO RUN:  py tests/session-api-test.py   (from the repo root)
Reads SWISSPAIR_TG_TOKEN from .env to mint cryptographically valid Telegram
initData for three synthetic users (ids 9101/9102/9103) — the same HMAC recipe
Telegram uses, so the server's validateInitData accepts them. Never prints the
token. Creates its own sessions and deletes nothing else; cleans up by ending
with a distinctive creator id you can purge with:
  delete from sp_sessions where creator_id in (9101,9102);

Checks (must all be True): forged-hash 401; create; claim-taken 409;
add-name-before-join 403; nickname join; add placeholder; claim placeholder;
rename; non-creator start 403; start with 3 (state + format); non-creator save
403; creator save; viewer get; post-start join 409; under-3 start 400;
unknown-op stable marker.
"""
import hmac, hashlib, urllib.parse, json, time, urllib.request, sys, os, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(HERE, "..", ".env")
TOKEN = next(l.split("=", 1)[1].strip() for l in open(ENV, encoding="utf-8")
             if l.startswith("SWISSPAIR_TG_TOKEN="))
URL = "https://empjrokwgnsfczqpdvrp.supabase.co/functions/v1/session"

def mint(user):
    params = {"auth_date": str(int(time.time())), "query_id": "AAtest",
              "user": json.dumps(user, separators=(",", ":"))}
    dcs = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(params)

A = mint({"id": 9101, "first_name": "Alice"})
B = mint({"id": 9102, "first_name": "Bob"})
C = mint({"id": 9103, "first_name": "Cara"})
BAD = A[:-6] + "abcdef"

def call(payload):
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}

R = {}
s, _ = call({"op": "get", "initData": BAD, "code": "XXXXXX"}); R["forged401"] = s == 401
s, d = call({"op": "create", "initData": A, "name": "Gate Suite"})
R["create"] = s == 200 and d["session"]["status"] == "lobby" and d["session"]["isCreator"]
code = d["session"]["code"]
s, d = call({"op": "join", "initData": B, "code": code, "claim": "Alice"}); R["claimTaken409"] = s == 409
s, d = call({"op": "add-name", "initData": B, "code": code, "name": "Zed"}); R["addBeforeJoin403"] = s == 403
s, d = call({"op": "join", "initData": B, "code": code, "nickname": "Bobby"}); R["joinNick"] = s == 200 and d["me"] == "Bobby"
s, d = call({"op": "add-name", "initData": B, "code": code, "name": "Spot"})
R["addName"] = s == 200 and any(p["name"] == "Spot" and not p["claimed"] for p in d["players"])
s, d = call({"op": "join", "initData": C, "code": code, "claim": "Spot"}); R["claimOk"] = s == 200 and d["me"] == "Spot"
s, d = call({"op": "rename", "initData": C, "code": code, "newName": "Cara"}); R["rename"] = s == 200 and d["me"] == "Cara"
s, d = call({"op": "start", "initData": B, "code": code, "format": "roundrobin"}); R["nonCreatorStart403"] = s == 403
s, d = call({"op": "start", "initData": A, "code": code, "format": "roundrobin"})
R["start"] = (s == 200 and d["session"]["status"] == "active" and d["session"]["format"] == "roundrobin"
              and d["state"] and len(d["state"]["players"]) == 3
              and d["state"]["settings"]["format"] == "roundrobin")
st = d["state"]; st["rounds"].append({"number": 1, "pairings": []})
s, d = call({"op": "save", "initData": B, "code": code, "state": st}); R["nonCreatorSave403"] = s == 403
s, d = call({"op": "save", "initData": A, "code": code, "state": st}); R["saveOk"] = s == 200 and len(d["state"]["rounds"]) == 1
s, d = call({"op": "get", "initData": C, "code": code}); R["viewerGet"] = s == 200 and d["state"] is not None
s, d = call({"op": "join", "initData": mint({"id": 9104, "first_name": "Late"}), "code": code, "nickname": "Late"})
R["lateJoin409"] = s == 409
s, d = call({"op": "create", "initData": B, "name": "Tiny"}); code2 = d["session"]["code"]
s, d = call({"op": "start", "initData": B, "code": code2, "format": "swiss"}); R["under3Refused"] = s == 400
s, d = call({"op": "nope", "initData": A, "code": code}); R["unknownOp400"] = s == 400 and d.get("error") == "unknown op"

print(json.dumps(R, indent=1))
ok = all(R.values())
print("ALL PASS:" , ok, "| sessions used:", code, code2, "(purge: delete from sp_sessions where creator_id in (9101,9102);)")
sys.exit(0 if ok else 1)
