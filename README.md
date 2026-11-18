# Trick Six — Luxury Multiplayer Build

A from-scratch six-seat, 3v3 trick-taking game with an emerald/gold casino-table interface, authoritative Node.js game server, WebSocket rooms, bots, turn watchdogs, and installable PWA shell.

## Run locally

Requirements: Node.js 20 or newer. No npm packages are required.

```bash
npm start
```

Open `http://localhost:3000`. Create a room, then use **Fill empty seats with bots** and **Start game**. Share the invite URL to let other people take open seats. The host is seat 1 (engine seat 0).

To run the rule-engine tests:

```bash
npm test
npm run check
```

## Deploy

This project needs a Node host that supports long-lived WebSocket connections. A static-only host such as a basic Netlify drag-and-drop site cannot run the authoritative multiplayer server.

Use a Node service on Render, Railway, Fly.io, or another WebSocket-capable host:

- Runtime: Node 20+
- Build command: none
- Start command: `npm start`
- Port: read from the host's `PORT` environment variable
- Health check: `/`

The app serves its frontend and WebSocket endpoint from the same origin. HTTPS hosting automatically uses secure WebSockets (`wss`).

## Engine guarantees implemented

- 48-card deck (all four 2s removed), 8 cards per seat, alternating A/B teams, counter-clockwise seat-index progression matching the requested `0 → 1 → 2 → 3 → 4 → 5 → 0` direction.
- Engine-level checks for turn ownership, bid order, suit declaration, follow-suit, Hand Down opening trump, Ask Color, and legal card identity before state mutation.
- A single-action client lock and server-authoritative turn state.
- 25-second server watchdog for bidding, color declaration, and card play; fallback is pass, longest suit, or lowest legal card.
- First dealer draw is shown for 3.5 seconds and chooses the lowest rank.
- Dead Hand re-deal before the first bid; six passes with no bid re-deal using the same dealer.
- Round reset clears trick, lead suit, trump, declaration, tricks, hand and timer state.
- Dealer zero-out rotation and match end at +24 or after all six seats have completed a dealer round.
- PWA manifest, service worker, reconnect room/seat storage, mute toggle, and synthesized audio cues.

## Rule interpretation notes

The request describes a six-player table but calls Hand Down “1v3”. This build treats Hand Down as **one bidder against the other five active seats**, since all six players are dealt eight cards and remain in the trick. The bidder must declare a suit they hold and lead that suit on trick one. If the intended Hand Down variant has two inactive seats or a different scoring split, that needs a rule change.

The bid ladder is ordered `6 → 7 → Hand Down → 8`, with Hand Down scoring 16 and Bid 8 ending bidding immediately, following the order supplied in the brief. Normal bids finish after five consecutive passes; no-bid rounds redeal after all six pass.

## Deployment / reliability notes

Rooms and scores are held in server memory. A server restart clears active rooms; a production launch intended for long-running public play should add persistent room storage and multi-instance coordination. The project has automated engine tests and syntax checks, but no honest engineer can certify “100% bug-free” or glitch-proof behavior across every browser, device, and network. The supplied tests are a baseline, not a substitute for full multiplayer QA and load testing.
