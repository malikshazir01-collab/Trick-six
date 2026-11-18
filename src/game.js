export const SUITS = ['♠','♥','♦','♣'];
export const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A'];
export const FACE = new Set(['J','Q','K','A']);
export const CONTRACTS = { SIX:{key:'SIX',label:'Bid 6',points:6,target:6,level:1}, SEVEN:{key:'SEVEN',label:'Bid 7',points:7,target:7,level:2}, HAND_DOWN:{key:'HAND_DOWN',label:'Hand Down',points:16,target:8,level:3,solo:true}, EIGHT:{key:'EIGHT',label:'Bid 8',points:8,target:8,level:4} };
const rank = card => RANKS.indexOf(card.rank);
const next = seat => (seat + 1) % 6;
const clone = value => structuredClone(value);
export function makeDeck(){return SUITS.flatMap(suit=>RANKS.map(r=>({id:`${r}${suit}`,rank:r,suit})));}
export function shuffle(cards, rng=Math.random){const a=[...cards];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function createGame({room='LOCAL',names=[],humanSeat=0}={}){
 const players=Array.from({length:6},(_,seat)=>({seat,name:names[seat]|| (seat===humanSeat?'You':`Bot ${seat+1}`),team:seat%2===0?'A':'B',isBot:seat!==humanSeat,score:0,hand:[],tricksWon:0,connected:true}));
 return {room,players,phase:'WAITING',dealer:0,firstDealer:null,drawCards:[],drawDeadline:null,highestBid:null,bidTurn:null,bidPasses:0,bids:[],contract:null,bidder:null,bidderTeam:null,solo:false,colorDeclared:false,trumpSuit:null,leadSuit:null,currentTrick:[],lastTrick:[],lastWinner:null,trickNo:0,turn:null,turnDeadline:null,askedBy:null,mustPlayTrumpSeat:null,dealerZeroRoundPending:false,dealerTurnsCompleted:[],tricksByTeam:{A:0,B:0},roundNo:0,roundStartScores:null,roundResult:null,actionLock:false,revision:0,matchWinner:null,history:[]};
}
function clearRoundFields(s){s.drawCards=[];s.drawDeadline=null;s.openingTrumpRequired=false;s.mustPlayTrumpSeat=null;s.highestBid=null;s.bidTurn=null;s.bidPasses=0;s.bids=[];s.contract=null;s.bidder=null;s.bidderTeam=null;s.solo=false;s.colorDeclared=false;s.trumpSuit=null;s.leadSuit=null;s.currentTrick=[];s.lastTrick=[];s.lastWinner=null;s.trickNo=0;s.turn=null;s.turnDeadline=null;s.askedBy=null;s.mustPlayTrumpSeat=null;s.tricksByTeam={A:0,B:0};s.roundResult=null;s.players.forEach(p=>{p.hand=[];p.tricksWon=0;});}
export function beginDealerDraw(state,rng=Math.random,now=Date.now()){
 const s=clone(state);clearRoundFields(s);const deck=shuffle(makeDeck(),rng);s.drawCards=deck.splice(0,6);s.drawDeadline=now+3500;s.phase='DEALER_DRAW';s.revision++;return s;
}
export function finishDealerDraw(state,now=Date.now()){
 if(state.phase!=='DEALER_DRAW'||now<state.drawDeadline)throw new Error('Dealer draw is not ready to resolve');
 const s=clone(state);const lowest=Math.min(...s.drawCards.map(rank));const candidates=s.drawCards.map((c,i)=>({c,i})).filter(x=>rank(x.c)===lowest);const chosen=candidates[0].i;s.dealer=chosen;if(s.firstDealer===null)s.firstDealer=chosen;s.drawCards=[];return dealRound(s,Math.random,now);
}
export function dealRound(state,rng=Math.random,now=Date.now()){
 const s=clone(state);clearRoundFields(s);const deck=shuffle(makeDeck(),rng);for(let i=0;i<8;i++)for(let seat=0;seat<6;seat++)s.players[seat].hand.push(deck.pop());s.players.forEach(p=>p.hand.sort((a,b)=>SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit)||rank(a)-rank(b)));s.phase='BIDDING';s.bidTurn=next(s.dealer);s.turnDeadline=now+25000;s.roundNo++;s.roundStartScores=s.players.map(p=>p.score);s.revision++;return s;
}
export function hasDeadHand(player){return player.hand.every(c=>!FACE.has(c.rank));}
export function redeal(state,seat,now=Date.now()){
 if(state.phase!=='BIDDING'||state.highestBid||seat<0||seat>5||!hasDeadHand(state.players[seat]))throw new Error('Dead Hand re-deal is not legal');
 const s=clone(state);return dealRound(s,Math.random,now);
}
export function legalBids(state,seat){if(state.phase!=='BIDDING'||state.bidTurn!==seat)return[];const current=state.highestBid?.level||0;return Object.entries(CONTRACTS).filter(([,c])=>c.level>current).map(([key])=>key).concat('PASS');}
export function applyBid(state,seat,choice,now=Date.now()){
 if(state.phase!=='BIDDING'||state.bidTurn!==seat)throw new Error('Not this player\'s bidding turn');
 if(!legalBids(state,seat).includes(choice))throw new Error('Illegal bid');
 const s=clone(state);if(choice==='PASS'){s.bidPasses++;s.bids.push({seat,choice});if(s.highestBid&&s.bidPasses>=5){s.phase='PLAYING';s.solo=s.highestBid.key==='HAND_DOWN';s.bidder=s.highestBid.seat;s.bidderTeam=s.players[s.bidder].team;s.contract=CONTRACTS[s.highestBid.key];if(s.solo){s.phase='DECLARE_COLOR';s.turn=s.bidder;s.askedBy=null;}else{s.turn=next(s.bidder);s.turnDeadline=now+25000;}}else if(!s.highestBid&&s.bidPasses>=6){return dealRound(s,Math.random,now);}else{s.bidTurn=next(seat);s.turnDeadline=now+25000;}}
 else {const c=CONTRACTS[choice];s.highestBid={key:choice,level:c.level,points:c.points,seat};s.bidder=seat;s.bidderTeam=s.players[seat].team;s.contract=c;s.bidPasses=0;s.bids.push({seat,choice});if(choice==='EIGHT'){s.phase='PLAYING';s.turn=next(seat);s.turnDeadline=now+25000;}else if(choice==='HAND_DOWN'){s.solo=true;s.phase='DECLARE_COLOR';s.turn=seat;s.turnDeadline=now+25000;}else{s.bidTurn=next(seat);s.turnDeadline=now+25000;}}
 s.revision++;return s;
}
export function declareColor(state,seat,suit,now=Date.now()){
 if(state.phase!=='DECLARE_COLOR'||seat!==state.bidder||!SUITS.includes(suit))throw new Error('Only the highest bidder may declare a valid suit');
 if(state.solo&&!state.players[seat].hand.some(c=>c.suit===suit))throw new Error('Hand Down requires a trump card in the bidder’s hand');
 const s=clone(state);s.trumpSuit=suit;s.colorDeclared=true;s.phase='PLAYING';if(s.solo){s.turn=s.bidder;s.openingTrumpRequired=true;}else{s.turn=s.askedBy??s.turn??next(s.bidder);s.mustPlayTrumpSeat=s.askedBy;}s.askedBy=null;s.turnDeadline=now+25000;s.revision++;return s;
}
export function canAskColor(state,seat){if(state.phase!=='PLAYING'||state.colorDeclared||state.turn!==seat||!state.currentTrick.length)return false;const led=state.leadSuit;return !state.players[seat].hand.some(c=>c.suit===led);}
export function askColor(state,seat,now=Date.now()){
 if(!canAskColor(state,seat))throw new Error('Ask Color is not available');const s=clone(state);s.askedBy=seat;s.phase='DECLARE_COLOR';s.turn=s.bidder;s.turnDeadline=now+25000;s.revision++;return s;
}
export function legalCards(state,seat){
 if(state.phase!=='PLAYING'||state.turn!==seat)return[];const hand=state.players[seat].hand;if(!hand.length)return[];
 if(state.solo&&state.openingTrumpRequired&&state.trickNo===0&&seat===state.bidder)return hand.filter(c=>c.suit===state.trumpSuit);
 if(state.mustPlayTrumpSeat===seat&&state.trumpSuit){const trumps=hand.filter(c=>c.suit===state.trumpSuit);if(trumps.length)return trumps;}
 if(!state.currentTrick.length)return hand;
 const follows=hand.filter(c=>c.suit===state.leadSuit);return follows.length?follows:hand;
}
function winnerOfTrick(trick,trump){let best=trick[0];for(const play of trick.slice(1)){const a=play.card,b=best.card;const aTrump=trump&&a.suit===trump,bTrump=trump&&b.suit===trump;if(aTrump&&!bTrump){best=play;continue;}if(aTrump===bTrump){if(a.suit===best.card.suit&&rank(a)>rank(b))best=play;else if(!trump&&a.suit===best.card.suit&&rank(a)>rank(b))best=play;}}return best.seat;}
function roundThreshold(state){const target=state.contract.target;const defenders=state.bidderTeam==='A'?'B':'A';const bidderTricks=state.solo?state.players[state.bidder].tricksWon:state.tricksByTeam[state.bidderTeam];const defenderTricks=state.solo?state.trickNo-bidderTricks:state.tricksByTeam[defenders];const failAt=state.contract.key==='SIX'?3:state.contract.key==='SEVEN'?2:1;if(defenderTricks>=failAt)return'FAILED';if(bidderTricks>=target)return'WON';return null;}
function scoreRound(s,result){const completedDealer=s.dealer;const amount=s.contract.points;const bidder=s.bidder;const bidderTeam=s.bidderTeam;const bidderPlayer=s.players[bidder];const success=result==='WON';bidderPlayer.score+=success?amount:-amount;const dealerPlayer=s.players[s.dealer];if(dealerPlayer.seat!==bidder&&dealerPlayer.team!==bidderTeam){if(success)dealerPlayer.score-=amount;else dealerPlayer.score=Math.min(0,dealerPlayer.score+amount);}else if(dealerPlayer.seat!==bidder&&dealerPlayer.team===bidderTeam&&success&&dealerPlayer.score<0){dealerPlayer.score=Math.min(0,dealerPlayer.score+amount);}
 s.roundResult=result;s.phase='ROUND_OVER';s.turn=null;s.turnDeadline=null;const dealerStart=s.roundStartScores?.[s.dealer]??dealerPlayer.score;const dealerEnd=dealerPlayer.score;const pending=s.dealerZeroRoundPending;if(pending){if(dealerStart>=0&&dealerEnd>=0){s.dealer=next(s.dealer);s.dealerZeroRoundPending=false;}}else if(dealerStart<0&&dealerEnd>=0){s.dealerZeroRoundPending=true;}else if(dealerStart>=0&&dealerEnd>=0){s.dealer=next(s.dealer);}s.history.push({round:s.roundNo,result,contract:s.contract.label,bidder:bidderPlayer.name,points:amount});if(!s.dealerTurnsCompleted.includes(completedDealer))s.dealerTurnsCompleted.push(completedDealer);const reached=s.players.find(p=>p.score>=24);if(reached){s.matchWinner=reached.seat;s.phase='MATCH_OVER';}else if(s.dealerTurnsCompleted.length===6){s.matchWinner=[...s.players].sort((a,b)=>b.score-a.score)[0].seat;s.phase='MATCH_OVER';}return s;}
export function playCard(state,seat,cardId,now=Date.now()){
 if(state.phase!=='PLAYING'||state.turn!==seat)throw new Error('Not this player\'s turn');const legal=legalCards(state,seat);const card=legal.find(c=>c.id===cardId);if(!card)throw new Error('Illegal card play');
 const s=clone(state);s.lastTrick=[];const hand=s.players[seat].hand;const idx=hand.findIndex(c=>c.id===cardId);const [played]=hand.splice(idx,1);if(!s.currentTrick.length)s.leadSuit=played.suit;s.currentTrick.push({seat,card:played});s.openingTrumpRequired=false;if(s.mustPlayTrumpSeat===seat)s.mustPlayTrumpSeat=null;s.turnDeadline=now+25000;s.revision++;
 if(s.currentTrick.length===6){const winner=winnerOfTrick(s.currentTrick,s.colorDeclared?s.trumpSuit:null);s.lastWinner=winner;s.lastTrick=s.currentTrick.map(p=>({...p}));s.players[winner].tricksWon++;s.tricksByTeam[s.players[winner].team]++;s.trickNo++;s.history.push({trick:s.trickNo,winner});s.currentTrick=[];s.leadSuit=null;const result=roundThreshold(s);if(result)return scoreRound(s,result);if(s.trickNo===8)return scoreRound(s,s.players[s.bidder].tricksWon>=s.contract.target?'WON':'FAILED');s.turn=winner;}else{s.turn=next(seat);}s.turnDeadline=now+25000;return s;
}
export function fallbackAction(state,seat,now=Date.now()){
 if(state.phase==='BIDDING'&&state.bidTurn===seat)return applyBid(state,seat,'PASS',now);
 if(state.phase==='DECLARE_COLOR'&&seat===state.bidder){const counts=SUITS.map(s=>({s,n:state.players[seat].hand.filter(c=>c.suit===s).length})).sort((a,b)=>b.n-a.n||SUITS.indexOf(a.s)-SUITS.indexOf(b.s));return declareColor(state,seat,counts[0].s,now);}
 if(state.phase==='PLAYING'&&state.turn===seat){const legal=legalCards(state,seat).sort((a,b)=>rank(a)-rank(b)||SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit));if(legal[0])return playCard(state,seat,legal[0].id,now);}
 return state;
}
export function botChoice(state,seat){
 if(state.phase==='BIDDING'&&state.bidTurn===seat){const p=state.players[seat];const face=p.hand.filter(c=>FACE.has(c.rank)).length;const legal=legalBids(state,seat);if(legal.includes('EIGHT')&&face>=5)return'EIGHT';if(legal.includes('HAND_DOWN')&&face>=6)return'HAND_DOWN';if(legal.includes('SEVEN')&&face>=4)return'SEVEN';if(legal.includes('SIX')&&face>=3)return'SIX';return'PASS';}
 if(state.phase==='DECLARE_COLOR'&&state.bidder===seat){const counts=SUITS.map(s=>({s,n:state.players[seat].hand.filter(c=>c.suit===s).length})).sort((a,b)=>b.n-a.n);return counts[0].s;}
 if(state.phase==='PLAYING'&&state.turn===seat){const legal=legalCards(state,seat);if(!legal.length)return null;return [...legal].sort((a,b)=>rank(a)-rank(b))[0].id;}
 return null;
}
export function publicState(state,viewer=0){const s=clone(state);s.players=s.players.map(p=>({...p,hand:p.seat===viewer?p.hand:p.hand.map(()=>({hidden:true}))}));return s;}
