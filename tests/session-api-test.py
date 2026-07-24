"""End-to-end regression for the `session` Edge Function (live backend).

HOW TO RUN:  py tests/session-api-test.py   (from the repo root)
Reads SWISSPAIR_TG_TOKEN from .env to mint cryptographically valid Telegram
initData for synthetic users (ids 9101-9104) — the same HMAC recipe Telegram
uses, so the server's validateInitData accepts them. Never prints the token.
Purge its sessions afterwards with:
  delete from sp_sessions where creator_id in (9101,9102);

The protocol mirrors mahjong-web's link-first mechanism:
  create (in-app, creator joins UNSEATED; roster starts EMPTY) ->
  open = membership (idempotent, unseated) -> add-name placeholders (member) ->
  claim ("This is me") / join-new (own name) -> rename/leave/remove-name ->
  organizer start at 3+ ROSTER names -> organizer-only save -> viewers get.
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
R["create_unseatedCreator"] = (s == 200 and d["session"]["isCreator"] and d["isMember"]
                               and d["me"] is None and d["players"] == [])
code = d["session"]["code"]

s, d = call({"op": "add-name", "initData": C, "code": code, "name": "Zed"})
R["addBeforeOpen403"] = s == 403

s, d = call({"op": "open", "initData": B, "code": code})
R["openJoinsUnseated"] = s == 200 and d["isMember"] and d["me"] is None

s, d = call({"op": "add-name", "initData": B, "code": code, "name": "Spot"})
R["memberAddsName"] = s == 200 and any(p["name"] == "Spot" and not p["claimed"] for p in d["players"])

s, d = call({"op": "claim", "initData": B, "code": code, "player": "Spot"})
R["thisIsMe"] = s == 200 and d["me"] == "Spot" and any(p["name"] == "Spot" and p["claimed"] for p in d["players"])

s, d = call({"op": "open", "initData": C, "code": code})
s, d = call({"op": "join-new", "initData": C, "code": code, "name": "Cara"})
R["joinNew"] = s == 200 and d["me"] == "Cara" and len(d["players"]) == 2

s, d = call({"op": "claim", "initData": A, "code": code, "player": "Spot"})
R["claimTaken409"] = s == 409
s, d = call({"op": "join-new", "initData": A, "code": code, "name": "Cara"})
R["joinNewDup409"] = s == 409
s, d = call({"op": "join-new", "initData": A, "code": code, "name": "Alice"})
R["creatorSeats"] = s == 200 and d["me"] == "Alice" and len(d["players"]) == 3

s, d = call({"op": "rename", "initData": B, "code": code, "newName": "Bobby"})
R["renameFollowsRoster"] = (s == 200 and d["me"] == "Bobby"
                            and any(p["name"] == "Bobby" and p["claimed"] for p in d["players"])
                            and not any(p["name"] == "Spot" for p in d["players"]))

s, d = call({"op": "remove-name", "initData": B, "code": code, "name": "Bobby"})
R["removeClaimed409"] = s == 409
s, d = call({"op": "add-name", "initData": B, "code": code, "name": "Ghost"})
s, d = call({"op": "remove-name", "initData": B, "code": code, "name": "Ghost"})
R["removeUnclaimed"] = s == 200 and not any(p["name"] == "Ghost" for p in d["players"])

s, d = call({"op": "start", "initData": B, "code": code, "format": "roundrobin"})
R["nonCreatorStart403"] = s == 403
s, d = call({"op": "start", "initData": A, "code": code, "format": "roundrobin"})
R["start"] = (s == 200 and d["session"]["status"] == "active"
              and sorted(p["name"] for p in d["state"]["players"]) == ["Alice", "Bobby", "Cara"]
              and d["state"]["settings"]["format"] == "roundrobin")

st = d["state"]; st["rounds"].append({"number": 1, "pairings": []})
s, d = call({"op": "save", "initData": B, "code": code, "state": st}); R["nonCreatorSave403"] = s == 403
s, d = call({"op": "save", "initData": A, "code": code, "state": st}); R["saveOk"] = s == 200 and len(d["state"]["rounds"]) == 1

s, d = call({"op": "open", "initData": mint({"id": 9104, "first_name": "Late"}), "code": code})
R["lateViewerOpens"] = s == 200 and d["isMember"] and d["me"] is None and d["state"] is not None
s, d = call({"op": "claim", "initData": mint({"id": 9104, "first_name": "Late"}), "code": code, "player": "Alice"})
R["lateClaim409"] = s == 409

s, d = call({"op": "create", "initData": B, "name": "Tiny"}); code2 = d["session"]["code"]
s, d = call({"op": "start", "initData": B, "code": code2, "format": "swiss"}); R["under3Refused"] = s == 400

s, d = call({"op": "nope", "initData": A, "code": code}); R["unknownOp400"] = s == 400 and d.get("error") == "unknown op"

print(json.dumps(R, indent=1))
ok = all(R.values())
print("ALL PASS:", ok, "| sessions used:", code, code2, "(purge: delete from sp_sessions where creator_id in (9101,9102);)")
sys.exit(0 if ok else 1)
