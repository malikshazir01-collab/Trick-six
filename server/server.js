import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {attachWebSocketServer} from './ws.js';
import {createGame,beginDealerDraw,finishDealerDraw,dealRound,applyBid,declareColor,askColor,playCard,fallbackAction,botChoice,publicState,legalCards,hasDeadHand,redeal} from '../src/game.js';

const ROOT=new URL('../',import.meta.url).pathname;const PORT=Number(process.env.PORT||3000);const rooms=new Map();const timers=new Map();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
const server=http.createServer(async(req,res)=>{let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';const file=normalize(join(ROOT,path));if(!file.startsWith(ROOT)){res.writeHead(403).end();return;}try{const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-cache'}).end(data);}catch{res.writeHead(404).end('Not found');}});
const wss=attachWebSocketServer(server);
const code=()=>Math.random().toString(36).slice(2,7).toUpperCase();
function send(ws,type,data){if(ws.readyState===1)ws.send(JSON.stringify({type,data}));}
function broadcast(room){const r=rooms.get(room);if(!r)return;for(const ws of r.clients)send(ws,'state',{state:publicState(r.state,ws.seat),you:ws.seat,room});}
function stopTimer(room){const t=timers.get(room);if(t){clearTimeout(t);timers.delete(room);}}
function schedule(room){stopTimer(room);const r=rooms.get(room);if(!r)return;const deadline=r.state.phase==='DEALER_DRAW'?r.state.drawDeadline:r.state.turnDeadline;if(!deadline)return;const revision=r.state.revision;const delay=Math.max(0,deadline-Date.now());const timer=setTimeout(()=>{const live=rooms.get(room);if(!live||live.state.revision!==revision)return;try{if(live.state.phase==='DEALER_DRAW')live.state=finishDealerDraw(live.state,Date.now());else{const s=live.state;const seat=s.phase==='BIDDING'?s.bidTurn:s.phase==='DECLARE_COLOR'?s.bidder:s.turn;live.state=fallbackAction(s,seat,Date.now());}afterMutation(room);}catch(e){console.error('watchdog fallback:',e.message);}},delay);timers.set(room,timer);}
function afterMutation(room){const r=rooms.get(room);if(!r)return;broadcast(room);schedule(room);runBots(room);}
function runBots(room){
 const r=rooms.get(room);if(!r||r.botLoop)return;r.botLoop=true;
 const s=r.state;const seat=s.phase==='BIDDING'?s.bidTurn:s.phase==='DECLARE_COLOR'?s.bidder:s.phase==='PLAYING'?s.turn:null;
 if(seat===null||!s.players[seat]?.isBot){r.botLoop=false;return;}
 setTimeout(()=>{
  const live=rooms.get(room);if(!live)return;
  try{
   const cur=live.state;const currentSeat=cur.phase==='BIDDING'?cur.bidTurn:cur.phase==='DECLARE_COLOR'?cur.bidder:cur.turn;
   if(currentSeat===seat){if(cur.phase==='BIDDING')live.state=applyBid(cur,seat,botChoice(cur,seat));else if(cur.phase==='DECLARE_COLOR')live.state=declareColor(cur,seat,botChoice(cur,seat));else if(cur.phase==='PLAYING'){const id=botChoice(cur,seat);if(id)live.state=playCard(cur,seat,id);}}
  }catch(e){console.error('bot action rejected:',e.message);}
  live.botLoop=false;afterMutation(room);
 },550+Math.random()*550);
}
function createRoom(ws,name){let id=code();while(rooms.has(id))id=code();const names=Array.from({length:6},(_,i)=>i===0?name||'You':`Seat ${i+1}`);const state=createGame({room:id,names,humanSeat:0});state.players.forEach((p,i)=>{p.isBot=false;p.connected=i===0;if(i!==0)p.name=`Seat ${i+1}`;});const r={state,clients:new Set(),botLoop:false};rooms.set(id,r);joinRoom(ws,id,0);return id;}
function joinRoom(ws,id,seat){const r=rooms.get(id);if(!r||seat<0||seat>5)throw new Error('Room or seat not available');if([...r.clients].some(c=>c!==ws&&c.seat===seat))throw new Error('Seat is occupied');if(ws.room){const old=rooms.get(ws.room);old?.clients.delete(ws);}ws.room=id;ws.seat=seat;r.clients.add(ws);r.state.players[seat].name=ws.playerName||r.state.players[seat].name;r.state.players[seat].isBot=false;r.state.players[seat].connected=true;send(ws,'joined',{room:id,seat});broadcast(id);}
function fillBots(room){const r=rooms.get(room);if(!r)return;for(let i=0;i<6;i++){const taken=[...r.clients].some(c=>c.seat===i);if(!taken){r.state.players[i].isBot=true;r.state.players[i].connected=true;}}}
function handle(ws,msg){const {type,data={}}=msg;try{
 if(type==='create'){ws.playerName=(data.name||'You').slice(0,20);const id=createRoom(ws,ws.playerName);return send(ws,'created',{room:id,seat:0});}
 if(type==='join'){ws.playerName=(data.name||'Player').slice(0,20);joinRoom(ws,String(data.room||'').toUpperCase(),Number(data.seat??0));return;}
 if(type==='fillBots'){const r=rooms.get(ws.room);if(!r)throw new Error('Join a room first');if(ws.seat!==0&&[...r.clients].some(c=>c.seat===0))throw new Error('Only the room host can fill empty seats');fillBots(ws.room);send(ws,'botsFilled',{});broadcast(ws.room);return;}
 if(type==='start'){const r=rooms.get(ws.room);if(!r)throw new Error('Join a room first');if(ws.seat!==0&&[...r.clients].some(c=>c.seat===0))throw new Error('Only the room host can start the game');if(r.state.phase!=='WAITING'&&r.state.phase!=='ROUND_OVER'&&r.state.phase!=='MATCH_OVER')throw new Error('A round is already in progress');stopTimer(ws.room);if(r.state.phase==='WAITING'&&r.state.firstDealer===null){r.state=beginDealerDraw(r.state);afterMutation(ws.room);}else{r.state=dealRound(r.state);afterMutation(ws.room);}return;}
 const r=rooms.get(ws.room);if(!r)throw new Error('Join a room first');const deadline=r.state.phase==='DEALER_DRAW'?r.state.drawDeadline:r.state.turnDeadline;if(deadline&&Date.now()>=deadline){if(r.state.phase==='DEALER_DRAW')r.state=finishDealerDraw(r.state,Date.now());else{const active=r.state.phase==='BIDDING'?r.state.bidTurn:r.state.phase==='DECLARE_COLOR'?r.state.bidder:r.state.turn;r.state=fallbackAction(r.state,active,Date.now());}afterMutation(ws.room);throw new Error('Turn timer expired; a fallback move was applied');}const seat=ws.seat;switch(type){case'bid':r.state=applyBid(r.state,seat,data.choice);break;case'declare':r.state=declareColor(r.state,seat,data.suit);break;case'askColor':r.state=askColor(r.state,seat);break;case'play':r.state=playCard(r.state,seat,data.cardId);break;case'redeal':r.state=redeal(r.state,seat);break;case'playAgain':if(r.state.phase!=='MATCH_OVER')throw new Error('Match is not finished');const connectedSeats=new Set([...r.clients].map(c=>c.seat));r.state=createGame({room:r.state.room,names:r.state.players.map(p=>p.name),humanSeat:seat});for(const p of r.state.players){p.isBot=!connectedSeats.has(p.seat);p.connected=connectedSeats.has(p.seat);}break;default:throw new Error('Unknown action');}afterMutation(ws.room);
 }catch(e){send(ws,'error',{message:e.message});}}
wss.on('connection',ws=>{ws.on('message',raw=>{try{handle(ws,JSON.parse(raw.toString()));}catch(e){send(ws,'error',{message:'Invalid request'});}});ws.on('close',()=>{if(ws.room){const r=rooms.get(ws.room);r?.clients.delete(ws);if(r?.state.players[ws.seat])r.state.players[ws.seat].connected=false;broadcast(ws.room);}});});
server.listen(PORT,()=>console.log(`Trick Six listening on http://localhost:${PORT}`));
