// Round-robin + fixed-pairing property regression.
//
// HOW TO RUN: open the app (index.html) in a browser, open DevTools, paste
// this entire file into the Console. It drives the REAL app code path
// (createSession -> generateNextRound -> computeStats) and checks:
//   1. schedule, even field  : n-1 rounds, every pair exactly once, no byes
//   2. schedule, odd field   : n rounds, every pair once, exactly one bye per
//                              round, each player byes exactly once (alternating)
//   3. full app, odd RR      : 5 rounds played; one pairing-bye row per round,
//                              5 distinct bye players, all 10 pairs met, no rematch
//   4. RR + fixed pairing    : forced pair meets in the requested round AND the
//                              full-cycle properties still hold
//   5. swiss + fixed pairing : forced pair seated in the requested round, rest
//                              paired normally (no dup players)
//   6. all-byes no-crash     : every active player requesting a bye must not
//                              crash generation (regression: NaN schedule index)
//   7. bye-request stability : a one-round sit-out must NOT change the RR
//                              rotation (schedule built on the full field; the
//                              requester's opponent gets a bye) and the missed
//                              pair is recovered on the next cycle
// Temporary sessions are deleted afterwards.
// Expected output: {"passed":true, ...all sub-checks true...}
(function(){
  const realAlert=window.alert, realConfirm=window.confirm;
  window.alert=()=>{}; window.confirm=()=>true;
  const out={};
  try{
    // ---- 1 & 2: pure schedule properties ----
    const evenIds=[1,2,3,4,5,6];
    const se=roundRobinSchedule(evenIds);
    const pk=(a,b)=>Math.min(a,b)+"-"+Math.max(a,b);
    const seen=new Set(); let dup=false, nulls=0;
    se.forEach(r=>r.forEach(([a,b])=>{ if(a==null||b==null){nulls++;return;} const k=pk(a,b); if(seen.has(k)) dup=true; seen.add(k); }));
    out.even = {rounds:se.length===5, pairs:seen.size===15, noDup:!dup, noByes:nulls===0};

    const oddIds=[1,2,3,4,5];
    const so=roundRobinSchedule(oddIds);
    const seenO=new Set(); let dupO=false; const byeCount={}; let byesPerRoundOk=true;
    so.forEach(r=>{
      let rb=0;
      r.forEach(([a,b])=>{
        if(a==null){ byeCount[b]=(byeCount[b]||0)+1; rb++; }
        else if(b==null){ byeCount[a]=(byeCount[a]||0)+1; rb++; }
        else { const k=pk(a,b); if(seenO.has(k)) dupO=true; seenO.add(k); }
      });
      if(rb!==1) byesPerRoundOk=false;
    });
    out.odd = {rounds:so.length===5, pairs:seenO.size===10, noDup:!dupO,
      oneByePerRound:byesPerRoundOk,
      eachByesOnce:oddIds.every(id=>byeCount[id]===1)};

    // ---- helpers for app-path tests ----
    const playRound=()=>{ const rd=state.rounds[state.rounds.length-1];
      rd.pairings.forEach(pg=>{ if(pg.p2!==null) pg.result={winner:"p1",score1:400,score2:350}; }); save(); };
    const roundPairs=rd=>rd.pairings.filter(pg=>pg.p2!==null).map(pg=>pk(pg.p1,pg.p2));
    const roundByes=rd=>rd.pairings.filter(pg=>pg.p2===null && pg.result.byeType==="pairing").map(pg=>pg.p1);

    // ---- 3: full app path, odd round robin ----
    createSession("RR odd","2026-07-06","roundrobin");
    ["A","B","C","D","E"].forEach(n=>addPlayer(n,1500,true)); save();
    for(let i=0;i<5;i++){ generateNextRound(); playRound(); }
    const allPairs=new Set(); let rematch=false; const byers=[]; let oneByeEach=true;
    state.rounds.forEach(rd=>{
      roundPairs(rd).forEach(k=>{ if(allPairs.has(k)) rematch=true; allPairs.add(k); });
      const b=roundByes(rd); if(b.length!==1) oneByeEach=false; byers.push(b[0]);
    });
    out.appOdd = {rounds:state.rounds.length===5, pairs:allPairs.size===10, noRematch:!rematch,
      oneByePerRound:oneByeEach, distinctByers:new Set(byers).size===5};
    let t=state.id; closeSession(); deleteSession(t);

    // ---- 4: RR with a fixed pairing ----
    createSession("RR fixed","2026-07-06","roundrobin");
    ["A","B","C","D","E"].forEach(n=>addPlayer(n,1500,true)); save();
    const idA=state.players[0].id, idE=state.players[4].id;
    state.exceptions.push({round:1,p1:idA,p2:idE}); save();
    for(let i=0;i<5;i++){ generateNextRound(); playRound(); }
    const r1HasForced = roundPairs(state.rounds[0]).includes(pk(idA,idE));
    const allP2=new Set(); let rem2=false; const bc2={};
    state.rounds.forEach(rd=>{
      roundPairs(rd).forEach(k=>{ if(allP2.has(k)) rem2=true; allP2.add(k); });
      roundByes(rd).forEach(id=>bc2[id]=(bc2[id]||0)+1);
    });
    out.rrFixed = {forcedInRound1:r1HasForced, pairs:allP2.size===10, noRematch:!rem2,
      eachByesOnce:state.players.every(p=>bc2[p.id]===1)};
    t=state.id; closeSession(); deleteSession(t);

    // ---- 5: swiss with a fixed pairing ----
    createSession("Swiss fixed","2026-07-06","swiss");
    ["P1,1800","P2,1700","P3,1600","P4,1500","P5,1400","P6,1300"].forEach(l=>{const m=l.split(","); addPlayer(m[0],m[1],true);}); save();
    const s1=state.players[0].id, s6=state.players[5].id;
    state.exceptions.push({round:2,p1:s1,p2:s6}); save();
    generateNextRound(); playRound();     // round 1 (normal fold: P1-P4, P2-P5, P3-P6)
    generateNextRound();                  // round 2 with the forced pair
    const r2=state.rounds[1];
    const r2pairs=roundPairs(r2);
    const ids=r2.pairings.flatMap(pg=>[pg.p1,pg.p2]).filter(x=>x!=null);
    out.swissFixed = {forcedInRound2:r2pairs.includes(pk(s1,s6)),
      allSixSeated:new Set(ids).size===6, threeBoards:r2pairs.length===3};
    t=state.id; closeSession(); deleteSession(t);

    // ---- 6: all active players on a requested bye must not crash ----
    createSession("RR all byes","2026-07-06","roundrobin");
    ["X","Y"].forEach(n=>addPlayer(n,1500,true)); save();
    state.players.forEach(p=>p.byeRequest=true); save();
    let crashed=false;
    try{ generateNextRound(); }catch(e){ crashed=true; }
    out.allByes = {noCrash:!crashed,
      roundMade:state.rounds.length===1,
      allHalfByes:!crashed && state.rounds[0].pairings.every(pg=>pg.p2===null && pg.result.byeType==="half")};
    t=state.id; closeSession(); deleteSession(t);

    // ---- 7: a bye request must not perturb the rotation ----
    createSession("RR bye stable","2026-07-06","roundrobin");
    ["A","B","C","D","E"].forEach(n=>addPlayer(n,1500,true)); save();
    generateNextRound(); playRound();                       // round 1, full field
    const pA=state.players[0]; pA.byeRequest=true; save();  // A sits out round 2
    generateNextRound();
    const r2=state.rounds[1];
    const half2=r2.pairings.filter(pg=>pg.p2===null && pg.result.byeType==="half");
    const pb2=r2.pairings.filter(pg=>pg.p2===null && pg.result.byeType==="pairing");
    out.byeStable = {
      requesterHalfBye: half2.length===1 && half2[0].p1===pA.id,
      fieldUnchanged: JSON.stringify(r2.rrField)===JSON.stringify(state.rounds[0].rrField),
      gamesPlusByes: r2.pairings.length>=2,
    };
    r2.pairings.forEach(pg=>{ if(pg.p2!==null) pg.result={winner:"p1",score1:400,score2:350}; }); save();
    for(let i=0;i<5;i++){ generateNextRound(); playRound(); }   // rounds 3-7
    const cov=new Set();
    state.rounds.forEach(rd=>roundPairs(rd).forEach(k=>cov.add(k)));
    out.byeStable.allPairsRecovered = cov.size===10;
    t=state.id; closeSession(); deleteSession(t);

    out.passed = [out.even,out.odd,out.appOdd,out.rrFixed,out.swissFixed,out.allByes,out.byeStable]
      .every(o=>Object.values(o).every(v=>v===true));
  } finally { window.alert=realAlert; window.confirm=realConfirm; }
  return JSON.stringify(out);
})();
