// Token Radar value model and board builder (Node 22, standard library only).
//
// One sealed DefiLlama snapshot in, one ranked board out. The board holds every watchlist slug plus
// the highest-TVL rankable pre-token protocols below the watchlist floor. Protocols whose token already
// trades are kept apart in a live set and are never ranked.
//
// IMPLIED VALUE (model "radar-2"): every factor is read from the snapshot's own fields.
//
//   base      = tvl_usd x 0.25
//   g         = clamp(change_7d ?? 0, -40, +60)                       (per cent)
//   growth    = 1 + g / 100 x 0.6                                     (0.76 .. 1.36)
//   age       = days from listed_at to as_of (unknown: 365)
//   maturity  = 0.55 + 0.45 x min(age, 1095) / 1095                   (0.55 .. 1.00)
//   chains    = min(1.25, 1 + 0.05 x log2(max(1, n_chains)))          (1.00 .. 1.25)
//   category  = CATEGORY_FACTOR[family(category)]                     (0.70 .. 1.20)
//   implied   = round(base x growth x maturity x chains x category)
//
// Maturity rewards a long run with no token: more accrued usage the token would be priced on. The
// chains factor is small and logarithmic: reach adds a little, never dominates TVL. The category factor
// reflects how much of a family's TVL is fee-bearing activity the protocol itself controls (a DEX or
// perp venue earns on its own flow; a curator's TVL sits inside someone else's lending market; RWA TVL
// is mostly off-chain assets). No protocol name is ever special-cased: one function scores every row.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-2';

export const MODEL = {
  base_multiple: 0.25,
  growth_floor: -40,
  growth_cap: 60,
  growth_weight: 0.6,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
  chains_step: 0.05,
  chains_cap: 1.25,
} as const;

export type ModelConstants = typeof MODEL;

/** Farm/valuation families: every DefiLlama category maps to one. */
export type Family =
  | 'derivatives' | 'prediction' | 'dex' | 'lending' | 'chain' | 'staking' | 'stable'
  | 'yield' | 'bridge' | 'vault' | 'rwa' | 'payments' | 'other';

export const CATEGORY_FACTOR: Record<Family, number> = {
  derivatives: 1.2,
  prediction: 1.15,
  dex: 1.15,
  lending: 1.1,
  chain: 1.1,
  staking: 1.0,
  stable: 1.0,
  yield: 0.95,
  bridge: 0.9,
  payments: 0.9,
  other: 0.9,
  vault: 0.8,
  rwa: 0.7,
};

export const FAMILY_LABEL: Record<Family, string> = {
  derivatives: 'Perps & derivatives', prediction: 'Prediction markets', dex: 'DEX & liquidity',
  lending: 'Lending markets', chain: 'Chains', staking: 'Staking & restaking', stable: 'CDP & stablecoins',
  yield: 'Yield & basis', bridge: 'Bridges', payments: 'Payments & services', other: 'Other',
  vault: 'Curators & vaults', rwa: 'Real-world assets',
};

const FAMILY_OF: Record<string, Family> = {
  'Derivatives': 'derivatives', 'Interest Rate Derivatives': 'derivatives', 'Options Vault': 'derivatives', 'Options': 'derivatives', 'Perpetuals': 'derivatives',
  'Prediction Market': 'prediction',
  'Dexs': 'dex', 'Liquidity Manager': 'dex', 'OTC Marketplace': 'dex', 'DEX Aggregator': 'dex',
  'Lending': 'lending', 'Uncollateralized Lending': 'lending', 'CDP Manager': 'lending', 'NFT Lending': 'lending',
  'Chain': 'chain',
  'Staking Pool': 'staking', 'Restaking': 'staking', 'Liquid Staking': 'staking', 'Liquid Restaking': 'staking',
  'Restaked BTC': 'staking', 'Anchor BTC': 'staking', 'Decentralized BTC': 'staking', 'Collateral Markets': 'staking',
  'CDP': 'stable', 'Dual-Token Stablecoin': 'stable', 'Stablecoin Wrapper': 'stable', 'Algo-Stables': 'stable',
  'Yield': 'yield', 'Basis Trading': 'yield', 'Farm': 'yield', 'Leveraged Farming': 'yield', 'CeDeFi': 'yield',
  'Bridge': 'bridge', 'Canonical Bridge': 'bridge', 'Cross Chain Bridge': 'bridge',
  'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault', 'Yield Aggregator': 'vault', 'Indexes': 'vault',
  'RWA': 'rwa',
  'Payments': 'payments', 'Crypto Card Issuer': 'payments', 'Privacy': 'payments', 'Insurance': 'payments',
  'Governance Incentives': 'payments',
};

export function familyOf(category: string | null): Family {
  return (category !== null && FAMILY_OF[category]) || 'other';
}

/** Rows on the board beyond the watchlist, and rows in the live-token view. */
export const EARLY_ROWS = 260;
export const LIVE_ROWS = 24;

export interface FarmStep { action: string; cost: string; time: string }

export interface ModelBreakdown {
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chains_multiplier: number;
  category_multiplier: number;
  family: Family;
  age_days: number | null;
  age_used: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number; change_7d: number | null; symbol: string | null; mcap_tvl: number | null;
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

const DAY_MS = 86_400_000;
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The whole model for one protocol: the factors and the implied value they multiply to. */
export function score(p: SnapshotProtocol, asOf: string, m: ModelConstants = MODEL): { implied: number; model: ModelBreakdown } {
  const age = ageDays(asOf, p.listed_at);
  const ageUsed = age ?? m.unknown_age_days;
  const g = Math.min(m.growth_cap, Math.max(m.growth_floor, p.change_7d ?? 0));
  const growth = 1 + (g / 100) * m.growth_weight;
  const maturity = m.maturity_floor + m.maturity_range * (Math.min(ageUsed, m.maturity_days) / m.maturity_days);
  const chains = Math.min(m.chains_cap, 1 + m.chains_step * Math.log2(Math.max(1, p.chains.length)));
  const family = familyOf(p.category);
  const category = CATEGORY_FACTOR[family];
  const base = p.tvl_usd * m.base_multiple;
  const implied = Math.max(1, Math.round(base * growth * maturity * chains * category));
  return {
    implied,
    model: {
      base_usd: Math.round(base),
      growth_pct: r4(g),
      growth_multiplier: r4(growth),
      maturity_multiplier: r4(maturity),
      chains_multiplier: r4(chains),
      category_multiplier: category,
      family,
      age_days: age,
      age_used: ageUsed,
    },
  };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

// ---------------------------------------------------------------------------------------------------
// Farm plans. Derived from category family, chains, TVL and age; never from a protocol's name.

type GasTier = 'l1' | 'btc' | 'cheap' | 'tiny';
const L1_EXPENSIVE = new Set(['Ethereum']);
const BTC_LIKE = new Set(['Bitcoin', 'Lightning', 'Litecoin', 'Doge']);
const TINY_GAS = new Set(['Solana', 'Sui', 'Aptos', 'Near', 'Algorand', 'Stellar', 'TON', 'Ton', 'Hedera', 'Bittensor', 'Stacks', 'Starknet', 'Sei', 'Injective', 'Osmosis', 'Noble', 'Cosmos', 'Hyperliquid L1', 'XRPL', 'Cardano', 'Tron', 'Eclipse', 'Movement', 'Fogo']);
const NON_EVM = new Set(['Solana', 'Sui', 'Aptos', 'Near', 'Algorand', 'Stellar', 'TON', 'Ton', 'Hedera', 'Bittensor', 'Stacks', 'Starknet', 'Injective', 'Osmosis', 'Noble', 'Cosmos', 'XRPL', 'Cardano', 'Tron', 'Bitcoin', 'Lightning', 'Eclipse', 'Movement', 'Fogo']);

function gasTier(chain: string): GasTier {
  if (L1_EXPENSIVE.has(chain)) return 'l1';
  if (BTC_LIKE.has(chain)) return 'btc';
  if (TINY_GAS.has(chain)) return 'tiny';
  return 'cheap';
}
const GAS_PER_TX: Record<GasTier, number> = { l1: 6, btc: 3, cheap: 0.2, tiny: 0.02 };
const TIER_ORDER: Record<GasTier, number> = { tiny: 0, cheap: 1, btc: 2, l1: 3 };

const money = (n: number): string => (n >= 1 ? `$${Math.round(n).toLocaleString('en-US')}` : n >= 0.1 ? `$${n.toFixed(2)}` : 'under $0.10');
const usdShort = (n: number): string => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
/** A gas estimate in words: "under $0.10" or "about $N". */
const gas = (n: number): string => (n < 0.1 ? 'under $0.10' : `about ${money(n)}`);

/**
 * The chain to farm on. DefiLlama lists a protocol's chains largest-TVL first, so the first chain is
 * where its liquidity (and any points programme) lives. The one exception: when that is Ethereum
 * mainnet, a cheaper chain among the next two listed is used instead, since mainnet gas eats a small
 * position.
 */
function farmChain(chains: string[]): string {
  if (chains.length === 0) return 'its main chain';
  const first = chains[0]!;
  if (gasTier(first) !== 'l1') return first;
  const alt = chains.slice(1, 3).find((c) => TIER_ORDER[gasTier(c)] <= TIER_ORDER.cheap);
  return alt ?? first;
}

function capitalFor(tvl: number): number {
  if (tvl >= 1e9) return 1000;
  if (tvl >= 250e6) return 500;
  if (tvl >= 50e6) return 300;
  if (tvl >= 20e6) return 200;
  return 100;
}

function holdDays(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 90;
  if (age < 365) return 60;
  if (age < 1095) return 45;
  return 30;
}

interface Ctx { name: string; chain: string; gas: number; cap: number; hold: number; tvl: number; nChains: number; evm: boolean; age: number | null; category: string }

/** Steps 3 and 4: the family's own core action and its recurring follow-up. */
function familySteps(f: Family, c: Ctx): [FarmStep, FarmStep] {
  const g = (k: number): string => gas(c.gas * k);
  const half = Math.round(c.cap / 2);
  switch (f) {
    case 'lending':
      return [
        { action: `Supply ${money(c.cap)} of USDC to ${c.name}'s main market on ${c.chain}, then enable it as collateral and borrow ${money(Math.round(c.cap * 0.3))} of a second stablecoin (30% loan-to-value, health factor above 2.5).`, cost: `${money(c.cap)} of capital, ${g(3)} gas for supply, enable and borrow`, time: '20 minutes' },
        { action: `Every week, repay part of the loan and re-borrow so the account shows both supply and borrow activity; check the health factor stays above 2.0 after each change.`, cost: `${g(2)} gas a week, plus the borrow rate on ${money(Math.round(c.cap * 0.3))} (roughly $1 to $3 a month)`, time: '10 minutes a week' },
      ];
    case 'dex':
      return [
        { action: `Provide ${money(c.cap)} of liquidity to ${c.name}'s deepest stablecoin or major-pair pool on ${c.chain}; if it offers concentrated ranges, set a wide range (about ±10%) so the position stays in range.`, cost: `${money(c.cap)} of capital, ${g(3)} gas for approvals and deposit; impermanent loss on a volatile pair can run 1% to 5%`, time: '20 minutes' },
        { action: `Make 3 to 5 swaps of $25 to $50 on ${c.name} each week across different pairs, so the wallet shows trading volume as well as liquidity.`, cost: `swap fees of about 0.05% to 0.3% plus ${g(4)} gas a week`, time: '15 minutes a week' },
      ];
    case 'derivatives':
      return [
        { action: `Deposit ${money(half)} of USDC as margin on ${c.name} (${c.chain}) and open one delta-neutral pair: a 1x long and an equal 1x short on two correlated majors, or a single 2x position with a stop.`, cost: `${money(half)} of margin, taker fees of about 0.05% per side and ${g(2)} gas`, time: '25 minutes' },
        { action: `Close and reopen the positions twice a week to build trading volume, and put the other ${money(c.cap - half)} into ${c.name}'s liquidity or insurance vault if it runs one.`, cost: `about $1 to $3 a week in fees and funding at this size`, time: '15 minutes, twice a week' },
      ];
    case 'prediction':
      return [
        { action: `Deposit ${money(half)} of USDC to ${c.name} on ${c.chain} and take 4 to 6 small positions ($20 to $40) in markets that resolve within 30 days.`, cost: `${money(half)} at risk, ${g(2)} gas, trading fees under 2%`, time: '30 minutes' },
        { action: `Each week, trade at least one new market and provide limit-order liquidity on one existing market so the wallet shows both taker and maker activity.`, cost: `${g(2)} gas and $1 of fees a week`, time: '15 minutes a week' },
      ];
    case 'vault':
      return [
        { action: `Deposit ${money(c.cap)} of USDC (or ETH) into the largest ${c.name} vault on ${c.chain}; read the vault's listed markets and caps first and avoid vaults with one dominant collateral.`, cost: `${money(c.cap)} of capital, ${g(2)} gas; the vault's performance fee is taken from yield, often 10% to 15%`, time: '20 minutes' },
        { action: `Once a month, check the vault's allocation and APY against a second ${c.name} vault and move half into it if it pays more, so the wallet spans two vaults.`, cost: `${g(4)} gas a month`, time: '15 minutes a month' },
      ];
    case 'rwa':
      return [
        { action: `Complete ${c.name}'s onboarding (many RWA issuers need KYC and a whitelisted wallet), then mint or buy ${money(c.cap)} of its yield-bearing asset on ${c.chain}.`, cost: `${money(c.cap)} of capital, ${g(2)} gas; some issuers set a higher minimum or charge a 0.1% to 0.5% mint fee`, time: '1 to 3 days for KYC, then 20 minutes' },
        { action: `Hold the asset and, if ${c.name}'s token is accepted as collateral or in a pool on ${c.chain}, place half of it there for a second source of activity.`, cost: `${g(3)} gas`, time: '15 minutes' },
      ];
    case 'staking':
      return [
        { action: `Stake ${money(c.cap)} of the underlying asset (the chain's native token or BTC, as ${c.name} accepts) through ${c.name} on ${c.chain} and keep the receipt token in the same wallet.`, cost: `${money(c.cap)} of capital, ${g(2)} gas; unstaking can take 1 to 21 days depending on the chain`, time: '20 minutes, plus the unbonding period on exit' },
        { action: `Deploy the receipt token once: deposit half of it in a lending market or pool that lists it on ${c.chain}, so the position earns ${c.name}'s points and a second protocol's.`, cost: `${g(3)} gas; adds the second protocol's smart-contract risk`, time: '15 minutes' },
      ];
    case 'stable':
      return [
        { action: `Mint ${money(half)} of ${c.name}'s stablecoin on ${c.chain} against collateral at under 40% loan-to-value, or swap ${money(half)} of USDC into it if minting is closed.`, cost: `${money(c.cap)} of collateral or capital, ${g(3)} gas; a stability fee of a few per cent a year`, time: '20 minutes' },
        { action: `Put the stablecoin in ${c.name}'s savings or staking module (or its main pool) and check once a week that it trades within 0.5% of $1.`, cost: `${g(2)} gas`, time: '5 minutes a week' },
      ];
    case 'yield':
      return [
        { action: `Deposit ${money(c.cap)} of USDC into ${c.name}'s main yield product on ${c.chain}, after reading where the yield comes from (basis, lending, incentives) and the withdrawal delay.`, cost: `${money(c.cap)} of capital, ${g(2)} gas; a 7 to 14 day withdrawal queue is common`, time: '20 minutes' },
        { action: `If ${c.name} issues a receipt token, use half of it once in a pool or lending market that lists it; otherwise top up by $50 after two weeks so the wallet shows repeat deposits.`, cost: `$50 more capital or ${g(3)} gas`, time: '10 minutes' },
      ];
    case 'bridge':
      return [
        { action: `Bridge ${money(half)} of USDC through ${c.name} from ${c.chain} to a second chain it serves, then bridge it back a week later.`, cost: `bridge fees of roughly 0.05% to 0.1% plus ${g(2)} gas each way`, time: '20 minutes per transfer' },
        { action: `Repeat one round trip each week across a different pair of chains, keeping each transfer between $50 and ${money(half)}.`, cost: `about $1 to $4 a week in fees and gas`, time: '15 minutes a week' },
      ];
    case 'chain':
      return [
        { action: `Bridge ${money(c.cap)} to ${c.chain} through its canonical bridge, then use 3 of its largest apps: one swap, one lending deposit and one liquidity position.`, cost: `${money(c.cap)} of capital, about $2 to $8 of bridge fees and gas`, time: '45 minutes' },
        { action: `Transact on ${c.chain} at least twice a week for the hold period and, if it stakes or delegates, delegate a small amount to a validator.`, cost: `${g(4)} gas a week`, time: '10 minutes a week' },
      ];
    case 'payments':
      return [
        { action: `Open an account or wallet with ${c.name} on ${c.chain} and route ${money(half)} of real payments, transfers or cover purchases through it (${c.category}).`, cost: `${money(half)} moved, ${g(3)} gas and any service fee ${c.name} lists`, time: '30 minutes' },
        { action: `Use ${c.name} for at least one real transaction each week; services in this category tend to reward recurring use over a single large deposit.`, cost: `${g(2)} gas a week`, time: '10 minutes a week' },
      ];
    default:
      return [
        { action: `Deposit ${money(c.cap)} into ${c.name}'s main product on ${c.chain} (${c.category}), after reading its documentation for lock-ups and withdrawal terms.`, cost: `${money(c.cap)} of capital, ${g(2)} gas`, time: '20 minutes' },
        { action: `Interact once a week (top up, claim, rebalance or vote) so the wallet shows recurring activity, not a single deposit.`, cost: `${g(2)} gas a week`, time: '10 minutes a week' },
      ];
  }
}

export function farmPlan(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = farmChain(p.chains);
  const tier = gasTier(chain);
  const c: Ctx = {
    name: p.name, chain, gas: GAS_PER_TX[tier], cap: capitalFor(p.tvl_usd), hold: holdDays(age), tvl: p.tvl_usd,
    nChains: p.chains.length, evm: !NON_EVM.has(chain), age, category: p.category ?? 'uncategorised',
  };
  const family = familyOf(p.category);
  const others = p.chains.filter((x) => x !== chain);
  const reach = others.length === 0
    ? `${p.name} lists only ${chain}, so all activity goes there.`
    : chain === p.chains[0]
    ? `${p.name} lists ${p.chains.length} chains; ${chain} is listed first (its largest TVL), so farm there${p.chains.length > 1 ? ` and add ${p.chains[1]} later if you want a second position` : ''}.`
    : `${p.name} lists ${p.chains.length} chains led by Ethereum; ${chain} is used instead to keep gas low at this position size, with Ethereum as the fallback if liquidity on ${chain} is thin.`;
  const [core, repeat] = familySteps(family, c);
  const ageNote = age === null
    ? 'its listing date is unknown'
    : age < 90 ? `it was listed only ${age} days ago, so any points season is likely still early`
    : `it has run ${age} days with no token recorded, so a snapshot could land at any time`;
  const sizing = p.tvl_usd < 20e6
    ? `TVL is only ${usdShort(p.tvl_usd)}: keep this to at most 2% of your farm budget and test a $20 withdrawal on day one.`
    : p.tvl_usd < 100e6
    ? `TVL is ${usdShort(p.tvl_usd)}: keep this to at most 5% of your farm budget and test a small withdrawal in week one.`
    : `TVL is ${usdShort(p.tvl_usd)}: exit liquidity is deep at this size, but cap it at 10% of your farm budget.`;
  return [
    {
      action: `Set up a dedicated ${c.evm ? 'EVM wallet (Rabby or MetaMask)' : `${chain}-native wallet`} used only for farming, and fund it on ${chain}. ${reach}`,
      cost: `${gas(c.gas * 2)} of gas for the funding transfers${tier === 'l1' ? ' (Ethereum mainnet: batch actions to save gas)' : ''}`,
      time: '15 minutes',
    },
    core,
    repeat,
    {
      action: `Hold the position for at least ${c.hold} days: ${ageNote}. Check ${p.name}'s own app or docs for a points or rewards dashboard and note your balance each week.`,
      cost: `capital stays deployed for ${c.hold} days; checking is free`,
      time: `${c.hold} days, 5 minutes a week`,
    },
    {
      action: `Risk check: ${sizing} Revoke unused token approvals monthly.`,
      cost: `${gas(c.gas * 2)} gas for the test withdrawal and revokes`,
      time: '10 minutes',
    },
    {
      action: `Exit or roll: if a token or claim is announced, claim only from the link on ${p.name}'s official site or docs, then decide whether to keep farming. Log every transaction, date and amount for taxes.`,
      cost: `${gas(c.gas * 3)} gas to claim and withdraw; never pay a fee to claim`,
      time: '20 minutes at the end of the hold',
    },
  ];
}

export function stepText(s: FarmStep): string {
  let t = `${s.action} Cost: ${s.cost}. Time: ${s.time}.`.replace(/\s+/g, ' ').trim();
  if (t.length > 600) t = `${t.slice(0, 597).trimEnd()}...`;
  return t;
}

// ---------------------------------------------------------------------------------------------------

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { rows: BoardRow[]; plans: Map<string, FarmStep[]> } {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || cmp(a.slug, b.slug))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...score(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || cmp(a.p.slug, b.p.slug));
  const plans = new Map<string, FarmStep[]>();
  const rows = scored.map((s, i): BoardRow => {
    const plan = farmPlan(s.p, s.model.age_days);
    plans.set(s.p.slug, plan);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: null,
      listed_at: s.p.listed_at,
      gecko_id: null,
      symbol: null,
      token_status: 'pre-token',
      on_watchlist: watch.has(s.p.slug),
      implied_value_usd: s.implied,
      model: s.model,
      farm_steps: plan.map(stepText),
    };
  });
  return { rows, plans };
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || cmp(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!, change_7d: p.change_7d, symbol: p.symbol,
      mcap_tvl: p.tvl_usd > 0 ? r4(p.mcap_usd! / p.tvl_usd) : null,
    }));
}

/** Median market-cap / TVL of every protocol with a recorded token: shown as context, never used. */
function marketMedian(snapshot: Snapshot): number | null {
  const ratios = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return null;
  const mid = ratios.length >> 1;
  return r4(ratios.length % 2 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2);
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL) {
  const { rows, plans } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    category_factor: CATEGORY_FACTOR,
    family_label: FAMILY_LABEL,
    protocols_total: snapshot.protocols.length,
    pre_token_total: snapshot.protocols.filter(isPreToken).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    live_median_mcap_tvl: marketMedian(snapshot),
    rows: rows.map((r) => ({
      rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl: r.tvl_usd,
      d7: r.change_7d, listed: r.listed_at, watch: r.on_watchlist, value: r.implied_value_usd, m: r.model,
      steps: plans.get(r.slug)!.map((s) => [s.action, s.cost, s.time]),
    })),
    live,
  };
  return { board: rows, radar };
}

export type RadarData = ReturnType<typeof buildRadar>['radar'];

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' && v !== '-' ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const protocols = o.protocols.map((v, i): SnapshotProtocol => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || num(p.tvl_usd) === null) throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: str(p.category),
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd as number,
      change_7d: num(p.change_7d),
      mcap_usd: num(p.mcap_usd),
      listed_at: str(p.listed_at),
      gecko_id: str(p.gecko_id),
      symbol: str(p.symbol),
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why the gate would refuse this board, or null when it passes every board check. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows; the gate takes 100 to 4,000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not a snapshot protocol`;
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    if (!/^\S{1,128}$/.test(r.slug)) return `${r.slug} is not a valid slug`;
    if (r.name.trim() === '') return `${r.slug} has an empty name`;
    seen.add(r.slug);
  }
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${i + 1} is worth more than rank ${i}`;
  }
  if (byRank.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every row has the same implied value';
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const n = s.trim().length;
      if (n < 20 || n > 600) return `${r.slug} has a farm step of ${n} characters`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
