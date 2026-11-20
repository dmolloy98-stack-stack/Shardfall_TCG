// Self-test for the rules: plays many automatic games and reports anything broken.
//   node tools/selftest.js . ai 4        every starter deck against every other, 4 games each,
//                                        with the computer playing both sides
//   node tools/selftest.js . rand 1000   1000 games of random legal moves, which reach odd
//                                        situations the computer avoids
// It reports crashes, games that never end, characters left on the table with no health,
// and other broken states. "problems": {} means it found none.
// The same seeds always replay the same games, so add a file name as a last argument to
// save one line per game, run it again after a change, and compare the two files: if they
// match, the change did not alter how the game plays.
const fs=require('fs');const dir=process.argv[2];const mode=process.argv[3]||'ai';const N=+process.argv[4]||6;
eval(fs.readFileSync(dir+'/js/data.js','utf8')+';DATA=buildData(Object.fromEntries(DATA_FILES.map(n=>[n,fs.readFileSync(dir+"/data/"+n+".csv","utf8")])));'+['engine','rules-champions','rules-events','rules-shard','effects','champions','ai'].map(f=>fs.readFileSync(dir+'/js/'+f+'.js','utf8')).join('\n')+`
const decks=DATA.deckOrder.filter(id=>DATA.decks[id].isPlayable);
let seedR=1; const rnd=()=>{seedR=(seedR*16807)%2147483647;return (seedR-1)/2147483646;}; const pick=a=>a[Math.floor(rnd()*a.length)];
const problems={}; const note=(k,d)=>{ (problems[k]=problems[k]||[]).length<3 && problems[k].push(d); problems[k].n=(problems[k].n||0)+1; };
function check(tag){
  for(const p of S.players){
    if(!(p.mana>=0)) note("negative or NaN mana",tag);
    if(p.hand.length>RULES.maxHand) note("hand over limit",tag);
    if(!Number.isFinite(p.health)) note("NaN health",tag);
    for(const c of p.field.chars){ const r=rawStats(c); if(!Number.isFinite(r.a)||!Number.isFinite(r.h)) note("NaN stats "+c.name,tag);
      if(c.owner!==p.idx) note("owner mismatch "+c.name,tag);
      if(r.h<=0 && !S.pending && !S.over) note("dead character still on field: "+c.name,tag); }
    const uids=[...p.hand,...p.deck,...p.grave,...p.field.chars,...p.field.areas,...p.field.equips].map(c=>c.uid);
  }
  const all=S.players.flatMap(p=>[...p.hand,...p.deck,...p.field.chars,...p.field.areas,...p.field.equips]).map(c=>c.uid);
  if(new Set(all).size!==all.length) note("duplicate card uid in play",tag);
  if(S.queue.length && !S.pending) note("queued choice with nothing pending",tag);
}
const hash=s=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h;};
const fp=[];
// Every finished game is also written down as a move list (see "The front door for moves" in
// js/engine.js), turned into text and back, and replayed from the start. The replay must end in
// exactly the same position, or the move list is missing something.
const stateKey=()=>JSON.stringify(S,(k,v)=>k==="isAI"?undefined:v);
function replayCheck(tag){
  const want=stateKey(), rec=JSON.parse(JSON.stringify(matchRecord())), saved=S, keep=listeners; listeners=[];
  try{ replayMatch(rec); if(stateKey()!==want) note("replay ends somewhere else",tag); }catch(e){ note("REPLAY "+e.message,tag); }
  S=saved; listeners=keep;
}
if("${mode}"==="ai"){
  for(const a of decks)for(const b of decks)for(let g=0;g<${N};g++){
    const seed=1000+g*7+decks.indexOf(a)*100+decks.indexOf(b)*10;
    const fullLog=[]; listeners=[]; onGameEvent((t,d)=>{ if(t==="log") fullLog.push(d.msg); });
    newGame({deckId:a,opponentDeckId:b,mode:'ai',seed}); S.players[0].isAI=true;
    let steps=0; try{ while(!S.over&&steps<6000){aiStep();steps++;check(a+" v "+b+" seed "+seed);} }catch(e){ note("CRASH "+e.message,a+" v "+b+" seed "+seed+" "+(e.stack||"").split("\\n")[1]); }
    if(!S.over) note("game never ended",a+" v "+b+" seed "+seed);
    fp.push([a,b,seed,S.winner,S.round,S.players[0].health,S.players[1].health,steps,hash(fullLog.join("|"))].join(","));
    replayCheck(a+" v "+b+" seed "+seed);
  }
} else {
  for(let g=0;g<${N};g++){
    seedR=g+1; const a=pick(decks), b=pick(decks); const seed=5000+g; const trail=[];
    newGame({deckId:a,opponentDeckId:b,mode:'hotseat',seed});
    let steps=0;
    try{ while(!S.over&&steps<1500){ steps++;
      const p=active(); const pd=S.pending; let did;
      if(pd){
        if(pd.kind==="target"){ const ts=validTargets(pendingEffect(pd),{card:pd.source,owner:S.players[pd.owner],spell:pd.spell});
          if(ts.length&&rnd()<0.85){ const t=pick(ts); did="target "+pd.source.name; if(!move("target",t.isPlayer?t:{uid:t.uid})) note("valid target refused: "+pd.source.name,"seed "+seed); }
          else { did="cancel "+pd.source.name; if(!move("cancel")){ if(!ts.length){ note("STUCK: required target with no valid targets: "+pd.source.name,"seed "+seed); break; } } } }
        else { const k=Math.floor(rnd()*((pd.pick||1)+1)); const picks=pd.cards.slice().sort(()=>rnd()-0.5).slice(0,pd.required?Math.max(1,k):k).map(c=>c.uid);
          const opt=pd.options?pick(pd.options).id:"ok"; did="choice "+pd.resolve; move("choose",picks,opt); }
      } else if(S.phase===PHASE.DRAW){ did="draw"; move("draw"); }
      else { const r=rnd();
        if(S.phase===PHASE.SETUP||S.phase===PHASE.BATTLE){
          const opts=[];
          for(const c of p.hand) if(canPlay(c,p)){ if(c.type==="Equipment"){ for(const t of p.field.chars) opts.push(["equip "+c.name,()=>move("play",c.uid,{target:{uid:t.uid}})]); opts.push(["store "+c.name,()=>move("play",c.uid,{toField:true})]); } else opts.push(["play "+c.name,()=>move("play",c.uid)]); }
          for(const e of p.field.equips) if(canAttachFromField(e,p)) for(const t of p.field.chars) opts.push(["attach "+e.name,()=>move("attach",e.uid,t.uid)]);
          for(const ar of p.field.areas) if(canActivateArea(ar,p)) opts.push(["activate "+ar.name,()=>move("area",ar.uid)]);
          if(p.manaToken) opts.push(["token",()=>move("token")]);
          if(S.phase===PHASE.BATTLE){ for(const c of p.field.chars){ if(canAttack(c)){ for(const t of [null,...opponent().field.chars]) opts.push(["attack "+c.name+" -> "+(t?t.name:"face"),()=>move("attack",c.uid,t?t.uid:null)]); if(S.shard) opts.push(["attack "+c.name+" -> shard",()=>move("attack",c.uid,"shard")]); } if(canUseBlade(c)) opts.push(["blade",()=>move("blade",c.uid)]); } }
          if(opts.length&&r<0.8){ const o=pick(opts); did=o[0]; o[1](); }
          else if(r<0.93){ did="advance"; move("next"); } else { did="endTurn"; move("end"); }
        } else { did="endTurn"; move("end"); }
      }
      trail.push(did); check("random seed "+seed+" after: "+trail.slice(-3).join(" > "));
    } }catch(e){ note("CRASH "+e.message,"random seed "+seed+" after: "+trail.slice(-4).join(" > ")+" @"+(e.stack||"").split("\\n")[1].trim()); }
    fp.push([seed,S.winner,S.round,steps].join(","));
    replayCheck("random seed "+seed);
  }
}
const keys=Object.keys(problems);
console.log(JSON.stringify({games:fp.length,fingerprint:hash(fp.join(";")),problems:Object.fromEntries(keys.map(k=>[k+" x"+problems[k].n,problems[k].slice(0,2)]))},null,1));
if(process.argv[5]) fs.writeFileSync(process.argv[5],fp.join("\\n"));
`);
