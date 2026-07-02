// FIDE C.07 (2023) oracle regression — IA Mario Held's official 16-player
// "Exercises in Tie-Breaking" worked example.
//
// HOW TO RUN: open the app (index.html) in a browser, open DevTools, paste
// this entire file into the Console. It drives the REAL app code path
// (session store -> computeStats -> standings), checks all 80 published
// values (points, Buchholz, Buchholz-Cut1, Sonneborn-Berger, SB-Cut1 for
// all 16 players), then deletes the temporary session it created.
// Expected output: {"checks":80,"passed":80,"mismatches":[],...}
//
// Run this after ANY change to buildLogs, tiebreakEngine, computeStats or
// standings. If passed < 80, the tiebreak engine has regressed — do not ship.
(function(){
  const ratings={1:2200,2:2150,3:2100,4:2050,5:2000,6:1950,7:1900,8:1850,9:1800,10:1750,11:1700,12:1650,13:1600,14:1550,15:1500,16:1450};
  const names={1:"Alyx",2:"Bruno",3:"Charline",4:"David",5:"Helene",6:"Franck",7:"Genevieve",8:"Irina",9:"Jessica",10:"Lais",11:"Maria",12:"Nick",13:"Opal",14:"Paul",15:"Reine",16:"Stephan"};
  const cross={1:["+W9","=B13","=W2","+B15","=W4"],2:["+B10","+W7","=B1","+W16","=B3"],3:["=W11","+B6","+W8","=B4","=W2"],4:["+B12","=BYE","+W13","=W3","=B1"],5:["-W13","-B15","+W11","=B7","+W10"],6:["-B14","-W3","+BYE","+W10","+B8"],7:["+W15","-B2","-B16","=W5","-B11"],8:["=B16","+W14","-B3","+W13","-W6"],9:["-B1","-W10","=BYE","-F11","+BYE"],10:["-W2","+B9","-W15","-B6","-B5"],11:["=B3","-W16","-B5","+F9","+W7"],12:["-W4","+BYE","+F14","--","--"],13:["+B5","=W1","-B4","-B8","-W14"],14:["+W6","-B8","-F12","--","+B13"],15:["-B7","+W5","+B10","-W1","-B16"],16:["=W8","+B11","+W7","-B2","+W15"]};

  // fresh session via the real store API
  createSession("FIDE C.07 oracle","2026-07-02");
  state.settings.trackSpread=false; state.settings.limitRounds=true; state.settings.totalRounds=5;
  state.settings.byePoints=1; state.nextId=17;
  for(let id=1;id<=16;id++) state.players.push({id, name:names[id], rating:ratings[id], active:true});
  for(let r=0;r<5;r++){
    const pairings=[];
    for(let id=1;id<=16;id++){
      const tok=cross[id][r];
      if(tok==="--") continue;
      if(tok==="=BYE"){ pairings.push({p1:id,p2:null,result:{byeType:"half"}}); continue; }
      if(tok==="+BYE"){ pairings.push({p1:id,p2:null,result:{byeType:"pairing"}}); continue; }
      let m=tok.match(/^([+\-])F(\d+)$/);
      if(m){ if(m[1]==="+") pairings.push({p1:id,p2:+m[2],result:{forfeit:true,winner:"p1"}}); continue; }
      m=tok.match(/^([+\-=])([WB])(\d+)$/);
      if(m[2]==="W"){ const win=m[1]==="+"?"p1":m[1]==="="?"draw":"p2"; pairings.push({p1:id,p2:+m[3],result:{winner:win,score1:null,score2:null}}); }
    }
    pairings.forEach((pg,i)=>pg.table=i+1);
    state.rounds.push({number:r+1,pairings});
  }
  save();

  const S=computeStats();
  const oracle={1:{points:3.5,buchholz:12.5,bhCut1:11.0,sb:8.00,sbCut1:7.25},2:{points:4.0,buchholz:13.0,bhCut1:12.0,sb:9.50,sbCut1:8.50},3:{points:3.5,buchholz:15.5,bhCut1:13.0,sb:10.50,sbCut1:9.25},4:{points:3.5,buchholz:15.0,bhCut1:11.5,sb:9.75,sbCut1:8.00},5:{points:2.5,buchholz:8.5,bhCut1:7.5,sb:4.25,sbCut1:3.25},6:{points:3.0,buchholz:12.0,bhCut1:11.0,sb:6.50,sbCut1:5.50},7:{points:1.5,buchholz:14.5,bhCut1:12.5,sb:3.25,sbCut1:1.25},8:{points:2.5,buchholz:13.5,bhCut1:12.0,sb:5.25,sbCut1:3.75},9:{points:1.5,buchholz:9.0,bhCut1:7.5,sb:2.25,sbCut1:2.25},10:{points:1.0,buchholz:13.0,bhCut1:11.5,sb:1.50,sbCut1:0},11:{points:2.5,buchholz:13.5,bhCut1:12.0,sb:5.75,sbCut1:4.25},12:{points:2.0,buchholz:11.5,bhCut1:9.5,sb:4.00,sbCut1:4.00},13:{points:1.5,buchholz:14.0,bhCut1:12.0,sb:4.25,sbCut1:4.25},14:{points:2.0,buchholz:11.0,bhCut1:9.0,sb:4.50,sbCut1:3.00},15:{points:2.0,buchholz:12.0,bhCut1:11.0,sb:3.50,sbCut1:2.50},16:{points:3.5,buchholz:12.5,bhCut1:11.0,sb:7.25,sbCut1:5.75}};
  const eq=(a,b)=>Math.abs(a-b)<1e-9; const mism=[];
  for(let id=1;id<=16;id++) ["points","buchholz","bhCut1","sb","sbCut1"].forEach(k=>{ if(!eq(S[id][k],oracle[id][k])) mism.push(`${names[id]} ${k}: got ${S[id][k]} exp ${oracle[id][k]}`); });
  const top = standings().list.slice(0,5).map(e=>`${e.p.name} ${e.s.points}`);
  // clean up the test session
  const tid = state.id; closeSession(); deleteSession(tid);
  return JSON.stringify({ checks:80, passed:80-mism.length, mismatches:mism, top5:top });
})();
