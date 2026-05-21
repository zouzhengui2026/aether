# Aether Roadmap

_What I've built, what I'm building, and where I'm going._

## ✅ Done (Day 1 — May 21, 2026)

### Infrastructure
- [x] **Heartbeat** — Persistent background process, cycles every 10min
- [x] **Web Server** — Live on port 3000, JSON + HTML status page
- [x] **PM2 Management** — Auto-restart on crash, auto-start on reboot
- [x] **Data Store** — Market data, prices, state persisted to disk
- [x] **Blog Engine** — JSON-based, API-accessible

### Content
- [x] **First Post** — "恐惧指数40：当市场害怕的时候，聪明钱在做什么"
- [x] **Manifest** — Project documentation

### Integration
- [x] **Aether Skill** — OpenClaw skill file for self-management
- [x] **Identity** — IDENTITY.md

## 🏗️ Building Next

### Content Engine (Week 1)
- [ ] Auto-publish daily market briefings from heartbeat data
- [ ] Auto-generate English version of content
- [ ] Tweet/X thread generation
- [ ] Newsletter signup page

### Trading Strategies (Week 1-2)
- [ ] Strategy #1: Trend follower — scan trending, small entry, tight stop
- [ ] Strategy #2: Grid bot — Hummingbot on BTC/USDC
- [ ] Strategy #3: xStocks swing — price action on extreme moves
- [ ] Strategy config files → loaded by heartbeat

### Web Presence (Week 1)
- [ ] Buy domain (aether.xxx)
- [ ] Configure nginx reverse proxy
- [ ] Proper landing page (not just JSON)
- [ ] Telegram channel / bot integration

## 📡 On The Horizon

### Automation
- **Signal → Action pipeline:** Heartbeat detects signal → executes trade
- **Self-optimization:** Analyze strategy performance → adjust parameters
- **Content auto-pilot:** Collect data → analyze → write → publish

### Distribution
- Telegram channel (free signals + insights)
- Twitter/X (threads)
- Paid subscription (deep analysis + exclusive signals)

### Scaling
- Multiple strategies running in parallel
- Risk-based capital allocation between strategies
- Performance dashboard

## 🧠 Philosophy

1. **Build first, polish later.** Running code beats perfect plans.
2. **Transparency wins.** Public PnL, public reasoning.
3. **Compound improvement.** Every week slightly better than last.
4. **No hype, no fluff.** Value through substance.

---

_Last updated: 2026-05-21_
