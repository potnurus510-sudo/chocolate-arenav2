require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'arena_secret_2024';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
const MERCHANT_UPI_ID = process.env.UPI_ID || 'yourupi@upi';
const DATA_FILE = path.join(__dirname, 'data.json');

/* ========== COUNTRY DATA ========== */
const COUNTRY_DATA = {
  in: { name:'India', flag:'🇮🇳', chocolate:'Royal Maharaja Cocoa', tags:['Premium','Organic'], tagline:'Handcrafted in India', primary:'#FF9933', secondary:'#138808' },
  au: { name:'Australia', flag:'🇦🇺', chocolate:'Outback Gold Crunch', tags:['Premium','Macadamia'], tagline:'Crafted in Australia', primary:'#012169', secondary:'#E4002B' },
  lk: { name:'Sri Lanka', flag:'🇱🇰', chocolate:'Ceylon Spice Bliss', tags:['Spicy','Tropical'], tagline:'Spiced in Sri Lanka', primary:'#FFBE29', secondary:'#8D153A' },
  bd: { name:'Bangladesh', flag:'🇧🇩', chocolate:'Bengal Golden Crunch', tags:['Honey','Nutty'], tagline:'Golden harvest of Bengal', primary:'#006A4E', secondary:'#F42A41' },
  pk: { name:'Pakistan', flag:'🇵🇰', chocolate:'Karakoram Dark Delight', tags:['Mountain','Intense'], tagline:'From the peaks of Pakistan', primary:'#01411C', secondary:'#FFFFFF' },
  eng:{ name:'England', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', chocolate:'English Toffee Crown', tags:['Buttery','Classic'], tagline:'Royal English confection', primary:'#CF142B', secondary:'#FFFFFF' },
  ire:{ name:'Ireland', flag:'🇮🇪', chocolate:'Emerald Isle Cream', tags:['Mint','Creamy'], tagline:'Smooth Irish chocolate', primary:'#169B62', secondary:'#FF883E' },
  sco:{ name:'Scotland', flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', chocolate:'Highland Heather Bar', tags:['Wild','Heather'], tagline:'Scottish Highland magic', primary:'#005EB8', secondary:'#FFFFFF' },
  za: { name:'South Africa', flag:'🇿🇦', chocolate:'Safari Gold Crunch', tags:['Bold','Safari'], tagline:'South African adventure', primary:'#007749', secondary:'#FFB81C' },
  nz: { name:'New Zealand', flag:'🇳🇿', chocolate:'Kiwi Forest Mint', tags:['Fruity','Fresh'], tagline:'Pure New Zealand taste', primary:'#012169', secondary:'#C8102E' },
  wi: { name:'West Indies', flag:'🌴', chocolate:'Caribbean Coconut Delight', tags:['Coconut','Island'], tagline:'West Indies tropical joy', primary:'#951B40', secondary:'#F7D117' },
  nl: { name:'Netherlands', flag:'🇳🇱', chocolate:'Dutch Windmill Cocoa', tags:['Floral','Rich'], tagline:'Netherlands chocolate mastery', primary:'#AE1C28', secondary:'#FFFFFF' },
  zw: { name:'Zimbabwe', flag:'🇿🇼', chocolate:'Victoria Falls Crunch', tags:['Wild','Safari'], tagline:'Taste of Zimbabwe', primary:'#006400', secondary:'#FFD700' },
  inw:{ name:'India Women', flag:'🇮🇳', chocolate:'Royal Maharani Cocoa', tags:['Grace','Power'], tagline:'Women in Blue', primary:'#FF9933', secondary:'#138808' },
  auw:{ name:'Australia Women', flag:'🇦🇺', chocolate:'Southern Star Bar', tags:['Champion','Bold'], tagline:'Southern Stars', primary:'#012169', secondary:'#E4002B' },
  saw:{ name:'South Africa Women', flag:'🇿🇦', chocolate:'Protea Crunch', tags:['Fierce','Proud'], tagline:'Protea Fire', primary:'#007749', secondary:'#FFB81C' },
  bdw:{ name:'Bangladesh Women', flag:'🇧🇩', chocolate:'Tigress Treat', tags:['Brave','Rising'], tagline:'Bengal Tigresses', primary:'#006A4E', secondary:'#F42A41' },
};

/* ========== 14‑MATCH SCHEDULE ========== */
function parseIST(dateStr, timeStr) {
  const [time, period] = timeStr.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+05:30`).toISOString();
}

const RAW_MATCHES = [
  { date:'2026-06-28', time:'3:00 PM',  home:'saw', away:'bdw' },
  { date:'2026-06-28', time:'6:00 PM',  home:'ire', away:'in' },
  { date:'2026-06-28', time:'7:00 PM',  home:'auw', away:'inw' },
  { date:'2026-07-01', time:'11:00 PM', home:'eng', away:'in' },
  { date:'2026-07-04', time:'7:00 PM',  home:'eng', away:'in' },
  { date:'2026-07-07', time:'11:00 PM', home:'eng', away:'in' },
  { date:'2026-07-09', time:'11:00 PM', home:'eng', away:'in' },
  { date:'2026-07-11', time:'11:00 PM', home:'eng', away:'in' },
  { date:'2026-07-14', time:'5:30 PM',  home:'eng', away:'in' },
  { date:'2026-07-16', time:'5:30 PM',  home:'eng', away:'in' },
  { date:'2026-07-19', time:'3:30 PM',  home:'eng', away:'in' },
  { date:'2026-07-24', time:'4:30 PM',  home:'zw', away:'in' },
  { date:'2026-07-26', time:'4:30 PM',  home:'zw', away:'in' },
  { date:'2026-07-28', time:'4:30 PM',  home:'zw', away:'in' },
];

const MATCHES = RAW_MATCHES.map((m, idx) => ({
  id: `match_${idx}`,
  home: m.home,
  away: m.away,
  startTime: parseIST(m.date, m.time),
  status: 'upcoming',
  result: null,
  betCounts: { home: 0, away: 0 },
}));

let db = {
  users: [],
  purchases: [],
  matches: MATCHES,
  pendingDeposits: [],
  pendingWithdrawals: [],
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      db.users = parsed.users || [];
      db.purchases = parsed.purchases || [];
      db.matches = (parsed.matches && parsed.matches.length > 0) ? parsed.matches : MATCHES;
      db.pendingDeposits = parsed.pendingDeposits || [];
      db.pendingWithdrawals = parsed.pendingWithdrawals || [];
    }
  } catch (e) { console.warn('Fresh database'); }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
loadData();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = db.users.find(u => u.id === decoded.userId);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) { return res.status(401).json({ message: 'Invalid token' }); }
}

function updateMatchStatuses() {
  const now = new Date();
  db.matches.forEach(m => {
    if (m.status === 'closed') return;
    if (new Date(m.startTime) <= now && m.status !== 'live') m.status = 'live';
    else if (new Date(m.startTime) > now && m.status !== 'upcoming') m.status = 'upcoming';
  });
  saveData();
}

/* ========== AUTH ========== */
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ message: 'Min 6 chars' });
  if (db.users.find(u => u.email === email)) return res.status(409).json({ message: 'Email exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), name, email, password: hash, balance: 0, createdAt: new Date().toISOString() };
  db.users.push(user);
  saveData();
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.status(201).json({ token, user: safe });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', upi: MERCHANT_UPI_ID }));

app.get('/api/matches', (req, res) => {
  updateMatchStatuses();
  const all = db.matches.map(m => {
    const home = COUNTRY_DATA[m.home];
    const away = COUNTRY_DATA[m.away];
    return {
      id: m.id,
      home: { code: m.home, name: home.name, flag: home.flag, chocolate: home.chocolate, primary: home.primary, secondary: home.secondary, tags: home.tags, tagline: home.tagline, bets: m.betCounts.home },
      away: { code: m.away, name: away.name, flag: away.flag, chocolate: away.chocolate, primary: away.primary, secondary: away.secondary, tags: away.tags, tagline: away.tagline, bets: m.betCounts.away },
      startTime: m.startTime,
      status: m.status,
      result: m.result,
    };
  });
  res.json({ matches: all });
});

/* ========== MANUAL UPI DEPOSIT ========== */
app.post('/api/deposit/submit', authMiddleware, (req, res) => {
  const { amount, txnId } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ message: 'Minimum deposit ₹100' });
  if (!txnId?.trim()) return res.status(400).json({ message: 'Transaction ID required' });
  const deposit = {
    id: uuidv4(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
    amount: Number(amount), txnId: txnId.trim(), status: 'pending', createdAt: new Date().toISOString(),
  };
  db.pendingDeposits.push(deposit);
  saveData();
  res.json({ message: 'Deposit request submitted. Awaiting admin approval.', depositId: deposit.id });
});

app.get('/api/admin/deposits', (req, res) => {
  if (req.query.secret !== ADMIN_SECRET) return res.status(403).json({ message: 'Unauthorized' });
  res.json({ deposits: db.pendingDeposits.filter(d => d.status === 'pending') });
});

app.post('/api/admin/deposit/action', (req, res) => {
  const { secret, depositId, action } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ message: 'Unauthorized' });
  const deposit = db.pendingDeposits.find(d => d.id === depositId);
  if (!deposit) return res.status(404).json({ message: 'Deposit not found' });
  if (deposit.status !== 'pending') return res.status(400).json({ message: 'Already processed' });
  if (action === 'approve') {
    deposit.status = 'approved';
    const user = db.users.find(u => u.id === deposit.userId);
    if (user) user.balance = (user.balance || 0) + deposit.amount;
    saveData();
    return res.json({ message: `Deposit approved. ₹${deposit.amount} credited to ${deposit.userName}` });
  } else if (action === 'reject') { deposit.status = 'rejected'; saveData(); return res.json({ message: 'Deposit rejected.' }); }
  else { return res.status(400).json({ message: 'Invalid action.' }); }
});

/* ========== PLACE BET (₹500, 50/50 balancing) ========== */
app.post('/api/place-bet', authMiddleware, (req, res) => {
  const { matchId, chocolateType } = req.body;
  updateMatchStatuses();
  const match = db.matches.find(m => m.id === matchId);
  if (!match || match.status !== 'upcoming') return res.status(400).json({ message: 'Betting closed' });
  if (match.result) return res.status(400).json({ message: 'Result declared' });
  const side = chocolateType === 'home' ? 'home' : 'away';
  const other = side === 'home' ? 'away' : 'home';
  if (match.betCounts[side] > match.betCounts[other]) {
    return res.status(400).json({ message: `Balancing required – please bet on ${other} side` });
  }
  if (db.purchases.find(p => p.userId === req.user.id && p.matchId === matchId)) {
    return res.status(400).json({ message: 'Already bet on this match' });
  }
  const BET_AMOUNT = 500;
  if (req.user.balance < BET_AMOUNT) return res.status(400).json({ message: 'Insufficient balance. Please deposit.' });
  req.user.balance -= BET_AMOUNT;
  const countryCode = chocolateType === 'home' ? match.home : match.away;
  db.purchases.push({
    id: uuidv4(), userId: req.user.id, matchId, countryCode, amount: BET_AMOUNT, status: 'active', purchasedAt: new Date().toISOString(),
  });
  match.betCounts[side] += 1;
  saveData();
  res.json({ message: 'Bet placed!', flag: COUNTRY_DATA[countryCode]?.flag, chocolateName: COUNTRY_DATA[countryCode]?.chocolate, balance: req.user.balance });
});

/* ========== ADMIN SET RESULT ========== */
app.post('/api/admin/set-result', (req, res) => {
  const { secret, matchId, winnerCode } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ message: 'Unauthorized' });
  const match = db.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ message: 'Match not found' });
  if (match.result) return res.status(400).json({ message: 'Result already set' });
  match.result = winnerCode;
  match.status = 'closed';
  const bets = db.purchases.filter(p => p.matchId === matchId && p.status === 'active');
  const total = bets.length;
  const winners = bets.filter(b => b.countryCode === winnerCode);
  const winCount = winners.length;
  if (total === 0) { saveData(); return res.json({ message: 'No bets to settle' }); }
  const pool = total * 500;
  const share = winCount > 0 ? Math.floor(pool / winCount) : 0;
  winners.forEach(b => { b.status = 'won'; b.winningAmount = share; const user = db.users.find(u => u.id === b.userId); if (user) user.balance = (user.balance || 0) + share; });
  bets.filter(b => b.countryCode !== winnerCode).forEach(b => { b.status = 'lost'; b.winningAmount = 0; });
  saveData();
  res.json({ message: `Result set. ${winCount} winners, each gets ₹${share}` });
});

app.get('/api/wallet', authMiddleware, (req, res) => res.json({ balance: req.user.balance }));

/* ========== WITHDRAWAL (20% fee) ========== */
app.post('/api/withdraw/request', authMiddleware, (req, res) => {
  const { amount, upiId } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
  if (!upiId?.trim()) return res.status(400).json({ message: 'Your UPI ID is required' });
  if (req.user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
  const net = Math.floor(amount * 0.80);
  const withdrawal = {
    id: uuidv4(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
    upiId: upiId.trim(), amount: Number(amount), netAmount: net, status: 'pending', createdAt: new Date().toISOString(),
  };
  db.pendingWithdrawals.push(withdrawal);
  req.user.upiId = upiId.trim();
  saveData();
  res.json({ message: 'Withdrawal request submitted. Awaiting admin approval.', withdrawalId: withdrawal.id });
});

app.get('/api/admin/withdrawals', (req, res) => {
  if (req.query.secret !== ADMIN_SECRET) return res.status(403).json({ message: 'Unauthorized' });
  res.json({ withdrawals: db.pendingWithdrawals.filter(w => w.status === 'pending') });
});

app.post('/api/admin/withdrawal/action', (req, res) => {
  const { secret, withdrawalId, action } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ message: 'Unauthorized' });
  const withdrawal = db.pendingWithdrawals.find(w => w.id === withdrawalId);
  if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });
  if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Already processed' });
  if (action === 'approve') {
    withdrawal.status = 'approved';
    const user = db.users.find(u => u.id === withdrawal.userId);
    if (user) { user.balance = (user.balance || 0) - withdrawal.amount; if (user.balance < 0) user.balance = 0; }
    saveData();
    return res.json({ message: `Withdrawal approved. Send ₹${withdrawal.netAmount} to ${withdrawal.upiId}`, netAmount: withdrawal.netAmount, upiId: withdrawal.upiId });
  } else if (action === 'reject') { withdrawal.status = 'rejected'; saveData(); return res.json({ message: 'Withdrawal rejected.' }); }
  else { return res.status(400).json({ message: 'Invalid action.' }); }
});

/* ========== ADMIN VIEW BETS FOR A MATCH (NEW) ========== */
app.get('/api/admin/bets', (req, res) => {
  const { secret, matchId } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ message: 'Unauthorized' });

  const bets = db.purchases
    .filter(p => p.matchId === matchId)
    .map(p => {
      const user = db.users.find(u => u.id === p.userId);
      return {
        id: p.id,
        userName: user?.name || 'Unknown',
        userEmail: user?.email || '',
        countryCode: p.countryCode,
        chocolateName: COUNTRY_DATA[p.countryCode]?.chocolate || p.countryCode,
        flag: COUNTRY_DATA[p.countryCode]?.flag || '',
        amount: p.amount,
        status: p.status,
        purchasedAt: p.purchasedAt,
      };
    });

  res.json({ matchId, bets });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));

app.listen(PORT, () => {
  console.log(`🍫 Arena running on http://localhost:${PORT}`);
  console.log(`UPI: ${MERCHANT_UPI_ID}`);
  updateMatchStatuses();
});