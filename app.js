const KEY="moneyTrackerProV2";
const DEFAULT_BOT=10000;
let state=loadState();

function defaultState(){
  return {version:2,players:[],running:[],pot:0,bot:DEFAULT_BOT,history:[],undo:[],redo:[],round:1,historyHidden:false};
}
function loadState(){
  try{return JSON.parse(localStorage.getItem(KEY))||defaultState()}catch(e){return defaultState()}
}
const $=id=>document.getElementById(id);
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD");
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function cloneData(){return JSON.stringify({players:state.players,running:state.running,pot:state.pot,bot:state.bot,history:state.history,round:state.round})}
function restoreData(s){const p=JSON.parse(s);Object.assign(state,p)}
function snapshot(){
  state.undo.push(cloneData()); if(state.undo.length>100)state.undo.shift(); state.redo=[];
}
function action(label,fn){
  snapshot(); fn(); state.history.unshift({text:label,time:new Date().toLocaleString()}); save();
}
function player(id){return state.players.find(p=>p.id===id)}
function runningPlayers(){return state.players.filter(p=>state.running.includes(p.id))}
function loanDue(p){return p.loans.reduce((a,l)=>a+(Number(l.due)||0),0)}
function totalWon(p){return p.stats?.won||0}
function totalLost(p){return p.stats?.lost||0}
function netResult(p){return (p.balance+loanDue(p))-Number(p.startingMoney||0)}

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function ensurePlayer(p){
  p.loans=p.loans||[];
  p.stats=p.stats||{won:0,lost:0,fold:0,borrowed:0,repaid:0};
  p.startingMoney=Number(p.startingMoney??p.balance??0);
  p.createdAt=p.createdAt||new Date().toISOString();
}
state.players.forEach(ensurePlayer);

function populate(){
  const selects=[$("actionPlayer"),$("loanPlayer")];
  selects.forEach(s=>{
    const old=s.value;s.innerHTML="";
    runningPlayers().forEach(p=>s.add(new Option(`${p.name} (${money(p.balance)})`,p.id)));
    if(old && [...s.options].some(o=>o.value===old))s.value=old;
  });
  const ex=$("existingPlayerSelect");ex.innerHTML="";
  state.players.filter(p=>!state.running.includes(p.id)).forEach(p=>ex.add(new Option(`${p.name} — ${money(p.balance)}`,p.id)));
  $("addExistingBox").classList.toggle("hidden",state.players.filter(p=>!state.running.includes(p.id)).length===0);
}
function render(){
  populate();
  $("statRunning").textContent=runningPlayers().length;
  $("statPlayers").textContent=state.players.length;
  $("potAmount").textContent=money(state.pot);
  $("potAmount2").textContent=money(state.pot);
  $("botBalance").textContent=money(state.bot);
  $("botBalance2").textContent=money(state.bot);
  $("roundBadge").textContent=`Round ${state.round}`;

  $("runningPlayers").innerHTML=runningPlayers().map(p=>`
    <div class="player-row">
      <span><strong>${esc(p.name)}</strong> <span class="money">${money(p.balance)}</span>
      ${loanDue(p)>0?`<small class="muted"> • Loan due ${money(loanDue(p))}</small>`:""}</span>
      <button onclick="removeRunning('${p.id}')">Remove</button>
    </div>`).join("")||"<p class='muted'>No running players.</p>";

  const q=($("playerSearch").value||"").toLowerCase();
  $("playerDetails").innerHTML=state.players.filter(p=>p.name.toLowerCase().includes(q)).map(p=>{
    const net=netResult(p);
    return `<tr>
      <td><strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.note||"")}</small></td>
      <td>${money(p.balance)}</td><td>${money(loanDue(p))}</td>
      <td>${state.running.includes(p.id)?"✅ Yes":"— No"}</td>
      <td>${p.stats.won}</td><td>${p.stats.lost+p.stats.fold}</td>
      <td class="${net>=0?"positive":"negative"}">${net>=0?"+":""}${money(net)}</td>
      <td>${state.running.includes(p.id)
        ?`<button onclick="removeRunning('${p.id}')">Remove</button>`
        :`<button onclick="addExisting('${p.id}')">Add</button>`}
        <button onclick="deletePlayer('${p.id}')" class="danger">Delete</button></td>
    </tr>`}).join("")||"<tr><td colspan='8' class='muted'>No players found.</td></tr>";

  $("loans").innerHTML=state.players.flatMap(p=>p.loans.filter(l=>l.due>0).map(l=>`
    <div class="loan"><strong>${esc(p.name)}</strong>: Borrowed ${money(l.borrowed)} + Interest ${money(l.interest)}
    = <strong>Due ${money(l.due)}</strong>
    <br><button onclick="repay('${p.id}','${l.id}')">Repay Full</button>
    <button onclick="repayPartial('${p.id}','${l.id}')">Partial Repay</button></div>`)).join("")||"<p class='muted'>No active loans.</p>";

  $("history").innerHTML=state.historyHidden?"<p class='muted'>History display is hidden.</p>":
    state.history.map((h,i)=>`<div class="history-item"><strong>${esc(h.text)}</strong><div class="muted">${h.time}</div></div>`).join("")||"<p class='muted'>No transactions yet.</p>";

  const totalBalance=state.players.reduce((a,p)=>a+p.balance,0);
  const totalDebt=state.players.reduce((a,p)=>a+loanDue(p),0);
  const totalWonMoney=state.players.reduce((a,p)=>a+(p.stats?.wonMoney||0),0);
  $("summary").innerHTML=[
    ["Total Player Balance",money(totalBalance)],
    ["Total Loan Debt",money(totalDebt)],
    ["Pot",money(state.pot)],
    ["Bank Balance",money(state.bot)],
    ["Total Won Payouts",money(totalWonMoney)],
    ["History Entries",state.history.length]
  ].map(x=>`<div class="summary-item"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");
}
function addPlayer(){
  const name=$("playerName").value.trim(),amt=Number($("moneyGiven").value),note=$("playerNote").value.trim();
  if(!name||!Number.isFinite(amt)||amt<0)return alert("Enter a valid player name and starting money.");
  if(state.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return alert("Player already exists. Use Add Existing Player.");
  action(`Added new player ${name} with ${money(amt)}`,()=>{
    const id=crypto.randomUUID();
    state.players.push({id,name,note,balance:amt,startingMoney:amt,loans:[],stats:{won:0,lost:0,fold:0,borrowed:0,repaid:0,wonMoney:0},createdAt:new Date().toISOString()});
    state.running.push(id);
  });
  $("playerName").value="";$("moneyGiven").value="";$("playerNote").value="";
}
function addExisting(id){
  const p=player(id);if(!p||state.running.includes(id))return;
  action(`Added ${p.name} back to running bid with existing balance ${money(p.balance)}`,()=>state.running.push(id));
}
function removeRunning(id){
  const p=player(id);if(!p)return;
  action(`Removed ${p.name} from running bid. Master record preserved.`,()=>state.running=state.running.filter(x=>x!==id));
}
function deletePlayer(id){
  const p=player(id);if(!p)return;
  if(state.running.includes(id))return alert("Remove the player from running first.");
  if(!confirm(`Permanently delete ${p.name} and their master record? This can be undone.`))return;
  action(`Deleted master record for ${p.name}`,()=>state.players=state.players.filter(x=>x.id!==id));
}
function selected(){return player($("actionPlayer").value)}
function doBid(type,amt){
  const p=selected();
  if(!p)return alert("Select a running player.");
  if(!Number.isFinite(amt)||amt<0||amt>p.balance)return alert("Invalid amount.");
  if(amt===0)return alert("Enter an amount greater than 0.");
  action(`${p.name} ${type}: ${money(amt)}`,()=>{
    p.balance-=amt;state.pot+=amt;
    if(type==="Fold")p.stats.fold++;
    else p.stats.lost++;
  });
}
function openWinner(){
  if(state.pot<=0)return alert("Running pot is ৳0.");
  $("winnerBox").classList.remove("hidden");$("winnerPot").textContent=money(state.pot);
  $("winnerList").innerHTML=runningPlayers().map(p=>`
    <label class="winner-option"><input type="checkbox" value="${p.id}"> ${esc(p.name)} — ${money(p.balance)}</label>`).join("");
}
function confirmWinners(){
  const ids=[...$("winnerList").querySelectorAll("input:checked")].map(x=>x.value);
  if(!ids.length)return alert("Select at least one winner.");
  const pot=state.pot,base=Math.floor(pot/ids.length),rem=pot%ids.length;
  action(`Round ${state.round} winner payout: ${ids.map(id=>player(id).name).join(", ")} received ${money(pot)} total`,()=>{
    ids.forEach((id,i)=>{const p=player(id),pay=base+(i===0?rem:0);p.balance+=pay;p.stats.won++;p.stats.wonMoney=(p.stats.wonMoney||0)+pay});
    state.pot=0;state.round++;
  });
  $("winnerBox").classList.add("hidden");
}
function borrow(){
  const p=player($("loanPlayer").value),amt=Number($("loanAmount").value);
  if(!p||!Number.isFinite(amt)||amt<=0||amt>state.bot)return alert("Invalid borrow amount.");
  const interest=amt*.20,due=amt+interest;
  action(`${p.name} borrowed ${money(amt)} from Bot; total due ${money(due)}`,()=>{
    p.balance+=amt;state.bot-=amt;p.stats.borrowed+=amt;
    p.loans.push({id:crypto.randomUUID(),borrowed:amt,interest,due,createdAt:new Date().toISOString()});
  });
  $("loanAmount").value="";
}
function repay(pid,lid){
  const p=player(pid),l=p?.loans.find(x=>x.id===lid);if(!l)return;
  if(p.balance<l.due)return alert(`Insufficient balance. Need ${money(l.due)}.`);
  const due=l.due;
  action(`${p.name} repaid loan ${money(due)} to Bot`,()=>{
    p.balance-=due;state.bot+=due;p.stats.repaid+=due;l.due=0;
  });
}
function repayPartial(pid,lid){
  const p=player(pid),l=p?.loans.find(x=>x.id===lid);if(!l)return;
  const amount=Number(prompt(`Loan due: ${money(l.due)}\nEnter amount to repay:`));
  if(!Number.isFinite(amount)||amount<=0||amount>l.due||amount>p.balance)return alert("Invalid repayment amount.");
  action(`${p.name} partially repaid ${money(amount)} to Bot`,()=>{
    p.balance-=amount;state.bot+=amount;l.due-=amount;p.stats.repaid+=amount;
  });
}
function undo(){
  if(!state.undo.length)return alert("Nothing to undo.");
  state.redo.push(cloneData());restoreData(state.undo.pop());save();
}
function redo(){
  if(!state.redo.length)return alert("Nothing to redo.");
  state.undo.push(cloneData());restoreData(state.redo.pop());save();
}
function resetGame(){
  const first=confirm("⚠️ RESET GAME?\n\nThis will clear the current game data and master player records.\n\nClick OK to continue.");
  if(!first)return;
  const second=confirm("⚠️ SECOND CONFIRMATION\n\nAre you absolutely sure you want to reset everything?\n\nClick OK to continue.");
  if(!second)return;
  const third=confirm("🚨 FINAL CONFIRMATION\n\nThis is the FINAL confirmation. All saved game data will be reset.\n\nClick OK to RESET.");
  if(!third)return;
  snapshot();state=defaultState();save();
}
function clearHistory(){
  action("Cleared transaction history display",()=>state.history=[]);
}
function exportJSON(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`money-tracker-${Date.now()}.json`;a.click();URL.revokeObjectURL(a.href);
}
function importJSON(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const incoming=JSON.parse(reader.result);
      if(!incoming.players||!Array.isArray(incoming.players))throw new Error();
      snapshot();state={...defaultState(),...incoming};
      state.players.forEach(ensurePlayer);save();alert("Game data imported successfully.");
    }catch(e){alert("Invalid Money Tracker JSON file.")}
  };reader.readAsText(file);
}

$("addPlayerBtn").onclick=addPlayer;
$("addExistingBtn").onclick=()=>{const id=$("existingPlayerSelect").value;if(id)addExisting(id)};
$("foldBtn").onclick=()=>doBid("Fold",Number($("foldAmount").value));
$("lostBtn").onclick=()=>doBid("Lost Bid",Number($("lostAmount").value));
$("wonBtn").onclick=openWinner;
$("confirmWinnerBtn").onclick=confirmWinners;
$("selectAllWinnersBtn").onclick=()=>document.querySelectorAll("#winnerList input").forEach(x=>x.checked=true);
$("clearWinnersBtn").onclick=()=>document.querySelectorAll("#winnerList input").forEach(x=>x.checked=false);
$("borrowBtn").onclick=borrow;
$("undoBtn").onclick=undo;
$("redoBtn").onclick=redo;
$("resetBtn").onclick=resetGame;
$("clearHistoryBtn").onclick=clearHistory;
$("exportBtn").onclick=exportJSON;
$("importFile").onchange=e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=""};
$("playerSearch").oninput=render;
render();
