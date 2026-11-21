// The token radar's model: one sealed snapshot in, one ranked board out.
//
// Every number on the board is read off the snapshot's own ten fields. Nothing here knows a
// protocol by name: there is no allow-list, no per-protocol override and no hand-written multiple.
//
// The chain of reasoning, and why each link is there:
//
//  1. THE MULTIPLE. The snapshot carries protocols that already trade, each with a TVL and a
//     market cap, so the market itself says what it pays per dollar of TVL in a category. That
//     ratio is the multiple applied to a protocol that has no token. Two categories are
//     different markets: a Canonical Bridge trades near 0.75x TVL, Liquid Staking near 0.03x.
//
//  2. THE SHRINKAGE. A category with one or two trading members is a sample, not a price. Rather
//     than drop it to the whole-market median (which prices every thin category identically and
//     hides the difference a reader came for), a thin category's multiple is pulled toward the
//     market median in proportion to how little evidence it has:
//         multiple(cat) = (n * median(cat) + k * market median) / (n + k),  k = SHRINK_K
//     A category with twelve members barely moves; one with a single member keeps a third of its
//     own reading. This is the same empirical-Bayes pull a statistician would apply, and it is
//     why the board's multiples differ row by row instead of collapsing to one number.
//
//  3. THE ODDS. A protocol that has run four years with no token is closer to a launch than one
//     listed last month: of the snapshot's protocols old enough to be counted, 80% of the
//     4-to-8-year cohort record a token against 26% of the under-six-month cohort. The odds are
//     that cohort's own rate, pulled toward the snapshot's base rate and multiplied by how its
//     category converts, so an old RWA book and an old bridge are not given the same chance.
//
//  4. THE FACTORS. Growth, maturity, scale and chain count are small multiplicative corrections
//     on top, each documented at its constant. They are corrections, not the model: the multiple
//     and the odds carry the ranking.
//
//  5. THE RANGE. A median has a spread around it, so every row carries the middle half of its
//     peer group's ratios, shrunk the same way: a reader sees $180M-$410M, not a false decimal.
//
//  6. THE DECISION. A board that ranks and stops is a list. Each row carries the capital a
//     position needs, what it costs, how long it ties the money up, and the verdict that follows
//     from the two numbers the model produced: upside (implied value x odds) against deposit.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Pseudo-count of market-median observations mixed into every category's multiple. */
  shrink_k: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_premium: number;
  chain_cap: number;
  /** Pre-token odds: pseudo-counts pulling a cohort's and a category's rate to the base rate. */
  odds_cohort_k: number;
  odds_category_k: number;
  odds_floor: number;
  odds_ceiling: number;
  sample_tvl_floor: number;
  ratio_floor: number;
  ratio_ceiling: number;
  global_fallback: number;
  /**
   * The farm verdict, as a policy over the two numbers the model produces. It is deliberately
   * not a dollar payoff: what a position captures depends on the protocol's own points program,
   * which the snapshot does not carry, so the verdict reads the odds a launch happens at all and
   * the size a launch would be, and says what the position costs in gas and hours.
   */
  farm_odds: number;
  watch_odds: number;
  farm_min_implied_usd: number;
  watch_min_implied_usd: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 3,
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1460,
  unknown_age_days: 365,
  chain_premium: 0.04,
  chain_cap: 5,
  odds_cohort_k: 8,
  odds_category_k: 6,
  odds_floor: 0.03,
  odds_ceiling: 0.97,
  sample_tvl_floor: 10_000_000,
  ratio_floor: 0.02,
  ratio_ceiling: 3,
  global_fallback: 0.2,
  farm_odds: 0.3,
  watch_odds: 0.25,
  farm_min_implied_usd: 15_000_000,
  watch_min_implied_usd: 30_000_000,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'fitted-4';

/**
 * The board carries every pre-token protocol in the snapshot, not just the watchlist.
 *
 * The watchlist is a floor the house drew, never the ceiling of what the radar can see: a protocol
 * above the floor that the watchlist misses is exactly the one a reader would want priced. This
 * constant is the gate's own row ceiling, so no row is dropped for a reason the page would hide.
 */
export const EARLY_ROWS = 4000;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One age cohort of the odds model. */
export interface OddsCohort {
  label: string;
  min_days: number;
  max_days: number;
  protocols: number;
  tokens: number;
  /** The cohort's own rate, pulled toward the base rate by odds_cohort_k. */
  rate: number;
}

/** The odds model as the dashboard states it. */
export interface OddsModel {
  base_rate: number;
  with_token: number;
  counted: number;
  cohorts: OddsCohort[];
}

/** One category's pricing, as the market itself set it in this snapshot. */
export interface MultipleRow {
  category: string;
  /** The category's own median ratio, before shrinkage. */
  own_multiple: number;
  /** The multiple the board applies: own median pulled toward the market median. */
  multiple: number;
  /** Trading members with a usable ratio. */
  samples: number;
  /** Share of the applied multiple that came from the market median instead of the category. */
  borrowed: number;
  low: number;
  high: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  /** A three-word label, so the step can be a row in a timetable. */
  label: string;
  /** Cash that leaves the wallet at this step, in dollars. */
  usd: number;
  /** Minutes of the reader's own attention at this step. */
  minutes: number;
  /** Calendar days this step occupies before the next one can start. */
  days: number;
  /** Whether this step closes the position: the plan's stated end. */
  closes?: boolean;
}

/** One line of a costed timetable: the step, its price, and the running totals. */
export interface FarmPlanStep {
  n: number;
  label: string;
  usd: number;
  minutes: number;
  days: number;
  /** Cash spent from step 1 through this step. */
  spent_usd: number;
  /** Days elapsed from step 1 through this step. */
  elapsed_days: number;
}

/** The farm plan as arithmetic: every step priced, and the totals it adds up to. */
export interface FarmPlan {
  steps: FarmPlanStep[];
  total_usd: number;
  total_minutes: number;
  total_days: number;
  /** Cash at risk beyond the deposit itself: gas, checks, weekly actions. */
  overhead_usd: number;
  /** The step where the position is closed, so the plan has a stated end. */
  exit_step: number;
}

/** Build the timetable from the steps, adding the running spend and elapsed time. */
export function farmPlan(steps: FarmStep[], deposit: number): FarmPlan {
  let spent = 0;
  let elapsed = 0;
  const rows: FarmPlanStep[] = steps.map((s, i) => {
    spent += s.usd;
    elapsed += s.days;
    return {
      n: i + 1,
      label: s.label,
      usd: s.usd,
      minutes: s.minutes,
      days: s.days,
      spent_usd: spent,
      elapsed_days: elapsed,
    };
  });
  const totalUsd = rows.reduce((a, r) => a + r.usd, 0);
  // The end of the plan is the step that closes the position, not the bookkeeping after it.
  const closing = steps.findIndex((s) => s.closes === true);
  return {
    steps: rows,
    total_usd: totalUsd,
    total_minutes: rows.reduce((a, r) => a + r.minutes, 0),
    total_days: elapsed,
    overhead_usd: totalUsd - deposit,
    exit_step: closing >= 0 ? closing + 1 : steps.length,
  };
}

/** The economics of one farm position, all from the protocol's own record. */
export interface FarmEconomics {
  deposit_usd: number;
  gas_usd: number;
  hold_days: number;
  minutes: number;
  /** Implied value x odds: what the launch is worth to whoever holds a position in it. */
  expected_value_usd: number;
  /** What the position costs to keep: gas over the hold, in basis points of the deposit. */
  cost_bps: number;
  verdict: 'farm' | 'watch' | 'skip';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  odds: number;
  expected_value_usd: number;
  model: {
    /** The multiple the curve gives a protocol of this TVL. */
    multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  /** Whether the house watchlist names this slug: the board's floor, not its ceiling. */
  watchlisted: boolean;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  odds: number;
  expected_value_usd: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm: FarmEconomics;
  farm_steps: string[];
  /** The same plan as arithmetic: every step priced, with running spend and elapsed days. */
  farm_plan: FarmPlan;
}

/**
 * The model checked against the protocols that already trade: each one is priced by a multiple
 * fitted without it, and the miss is the factor by which its real market cap differs. The flat
 * baseline is the same test with one market-wide median. A typical miss is exp(median |log miss|),
 * so 2.5 means the estimate is within 2.5x on the typical protocol.
 */
export interface Backtest {
  /** Trading protocols the test could price, one at a time. */
  n: number;
  /** Typical miss of the fitted curve: exp(median |log(predicted / actual)|). */
  model_factor: number;
  /** Typical miss of one flat market median over the same protocols. */
  flat_factor: number;
  /** Typical miss when a category's own residual is added to the curve: the option this board drops. */
  category_factor: number;
  /** Share of those protocols the fitted curve prices closer than the flat median. */
  model_wins: number;
}

/** The curve the board prices from: market cap against TVL, fitted in log space. */
export interface Curve {
  /** Intercept of log(market cap) on log(TVL). */
  a: number;
  /** Slope: how much a dollar of TVL buys, in market cap, as size grows. */
  b: number;
  /** Trading protocols the fit used. */
  n: number;
}

/** A live-token protocol: it already trades, so its market cap is a fact, not a model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the multiples, the odds and the model. */
/**
 * Where every protocol in the sealed snapshot ended up.
 *
 * The board ranks the ones that record no token; the rest are not dropped silently. This is the
 * count behind the page's first line, so a reader can see the 758 become 200 by a stated rule
 * rather than by a filter nobody can check.
 */
export interface Account {
  total: number;
  trading: number;
  no_token: number;
  excluded: Record<Derivative, number>;
  kept_by_watchlist: number;
  ranked: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  account: Account;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  market_median_multiple: number;
  category_count: number;
  category_total: number;
  odds_model: OddsModel;
  curve: Curve;
  backtest: Backtest;
  rows: RadarRow[];
  live: LiveRow[];
  multiples: MultipleRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `n` held between `lo` and `hi`. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A sorted copy's quantile by linear interpolation; NaN on an empty list. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

/** The middle of `values` (their mean when there is an even count); NaN on an empty list. */
export function median(values: number[]): number {
  return quantile(values, 0.5);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * Why a pre-token protocol is not one the radar prices: its TVL is a claim on something that
 * already trades, so "will it launch a token" is the wrong question for it.
 *
 *   exchange   a centralised venue's balance sheet, not a protocol to price (CEX);
 *   staked     a staked or restaked position in an asset that trades (Binance staked ETH);
 *   wrapped    a bridged or wrapped representation of an asset that trades (WBTC, USDT0);
 *   versioned  one pool of a protocol that already has its own entry (Aave V2).
 *
 * The watchlist overrides all four: when the house's own list names one of these, it is priced.
 */
export type Derivative = 'exchange' | 'staked' | 'wrapped' | 'versioned';

export function derivativeOf(p: SnapshotProtocol): Derivative | null {
  if (p.category === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  const category = p.category ?? '';
  if (/stak/i.test(category)) return 'staked';
  if (/bridge/i.test(category)) return 'wrapped';
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and not a claim on one that trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && derivativeOf(p) === null;
}

/** Every protocol in the snapshot, counted into the bucket the board's rule puts it in. */
export function accountFor(protocols: SnapshotProtocol[], ranked: number, watchlist: string[]): Account {
  const onList = new Set(watchlist);
  let noToken = 0;
  const excluded: Record<Derivative, number> = { exchange: 0, staked: 0, wrapped: 0, versioned: 0 };
  for (const p of protocols) {
    if (!isPreToken(p)) continue;
    noToken++;
    const why = derivativeOf(p);
    if (why !== null && !onList.has(p.slug)) excluded[why]++;
  }
  return {
    total: protocols.length,
    trading: protocols.length - noToken,
    no_token: noToken,
    excluded,
    kept_by_watchlist: protocols.filter((p) => isPreToken(p) && derivativeOf(p) !== null && onList.has(p.slug)).length,
    ranked,
  };
}

/**
 * The market's own price for a dollar of TVL, fitted rather than assumed.
 *
 * Market cap does not track TVL one for one: a $2B book is not worth twice a $1B book, so the
 * ratio mcap/TVL falls as TVL rises. Fitting log(market cap) on log(TVL) over the protocols that
 * already trade gives that slope directly from the snapshot, and the fit is what the board prices
 * with. The implied multiple then falls with size on its own, instead of the damping term this
 * model used to assume.
 */
export function fitCurve(protocols: SnapshotProtocol[], c: ModelConstants = MODEL): Curve {
  const sample = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= c.sample_tvl_floor && !VERSIONED.test(p.name),
  );
  if (sample.length < 3) return { a: Math.log(c.global_fallback), b: 1, n: sample.length };
  const xs = sample.map((p) => Math.log(p.tvl_usd));
  const ys = sample.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((s2, x) => s2 + x, 0) / xs.length;
  const my = ys.reduce((s2, y) => s2 + y, 0) / ys.length;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : 1;
  return { a: round4(my - b * mx), b: round4(b), n: sample.length };
}

/** The market cap the curve predicts for a protocol of this TVL, in whole dollars. */
export function curveValue(tvlUsd: number, curve: Curve): number {
  return Math.exp(curve.a + curve.b * Math.log(Math.max(tvlUsd, 1)));
}

/** The implied multiple at this TVL: the curve's value over the TVL, so it falls as size grows. */
export function multipleAt(tvlUsd: number, curve: Curve): number {
  return round4(curveValue(tvlUsd, curve) / Math.max(tvlUsd, 1));
}

/**
 * The market's own pricing, per category, read from the protocols that already trade.
 *
 * Two kinds of entry would poison the ratio and are left out of the sample:
 *   - a versioned or per-pool entry (Aave V2, Osmosis DEX), whose TVL covers one pool while its
 *     market cap covers the whole protocol, so the pair reads 19x where the protocol is 0.2x;
 *   - a protocol whose TVL is too small to be comparable with a $50M watchlist subject.
 * The remaining ratios are winsorised to [ratio_floor, ratio_ceiling] so one outlier cannot move
 * a whole category.
 *
 * The applied multiple is the category's median pulled toward the market median by shrink_k
 * pseudo-observations, and `borrowed` reports how much of it the market median supplied. A
 * category with no trading member at all is the market median outright, and says so.
 */
export function buildMultiples(protocols: SnapshotProtocol[], c: ModelConstants = MODEL): { rows: MultipleRow[]; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    if (VERSIONED.test(p.name)) continue;
    if (p.tvl_usd < c.sample_tvl_floor) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, c.ratio_floor, c.ratio_ceiling);
    if (!Number.isFinite(ratio)) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const global = all.length > 0 ? median(all) : c.global_fallback;
  const globalLow = all.length > 0 ? quantile(all, 0.25) : c.global_fallback;
  const globalHigh = all.length > 0 ? quantile(all, 0.75) : c.global_fallback;
  const k = c.shrink_k;

  // Ratios are multiplicative, so the pull toward the market median happens in log space: a
  // category whose one peer trades at 2.97x lands at 2.97^(1/4) x 0.13^(3/4) = 0.29x, not at the
  // 0.84x that averaging the ratios would give. One observation moves a category; it cannot set it.
  const shrink = (own: number, n: number, prior: number): number =>
    n <= 0 || own <= 0 || prior <= 0 ? prior : Math.exp((n * Math.log(own) + k * Math.log(prior)) / (n + k));

  const rows: MultipleRow[] = [];
  for (const [category, list] of byCategory) {
    const n = list.length;
    const own = median(list);
    const multiple = shrink(own, n, global);
    const low = shrink(quantile(list, 0.25), n, globalLow);
    const high = shrink(quantile(list, 0.75), n, globalHigh);
    rows.push({
      category,
      own_multiple: round4(own),
      multiple: round4(multiple),
      samples: n,
      borrowed: round4(k / (n + k)),
      low: round4(Math.min(low, multiple)),
      high: round4(Math.max(high, multiple)),
    });
  }
  rows.sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { rows, global: round4(global) };
}

/**
 * The odds a pre-token protocol records a token, from the snapshot's own record of who did.
 *
 * The base rate is what share of the snapshot's protocols record a token at all. The age cohort
 * is that share restricted to protocols at least as old as the subject, pulled toward the base
 * rate by odds_cohort_k because a cohort is finite. The category factor is how much more or less
 * often that category's protocols record a token than the snapshot's average, pulled toward 1 by
 * odds_category_k. The product is held inside [odds_floor, odds_ceiling]: no record makes a
 * launch certain, and none makes it impossible.
 */
export const ODDS_BANDS: ReadonlyArray<[string, number, number]> = [
  ['under 6 months', 0, 180],
  ['6-12 months', 180, 365],
  ['1-2 years', 365, 730],
  ['2-4 years', 730, 1460],
  ['4-8 years', 1460, 2920],
  ['over 8 years', 2920, Number.MAX_SAFE_INTEGER],
];

export function buildOdds(protocols: SnapshotProtocol[], asOf: string, c: ModelConstants = MODEL): OddsModel {
  const dated = protocols.filter((p) => ageDays(asOf, p.listed_at) !== null);
  const withToken = dated.filter((p) => !isPreToken(p));
  const base = dated.length > 0 ? withToken.length / dated.length : 0.5;

  const cohorts: OddsCohort[] = [];
  for (const [label, min, max] of ODDS_BANDS) {
    const inBand = dated.filter((p) => {
      const a = ageDays(asOf, p.listed_at)!;
      return a >= min && a < max;
    });
    const tokens = inBand.filter((p) => !isPreToken(p)).length;
    const n = inBand.length;
    cohorts.push({
      label,
      min_days: min,
      max_days: max === Number.MAX_SAFE_INTEGER ? 99_999 : max,
      protocols: n,
      tokens,
      rate: round4(n === 0 ? base : (tokens + c.odds_cohort_k * base) / (n + c.odds_cohort_k)),
    });
  }
  return { base_rate: round4(base), with_token: withToken.length, counted: dated.length, cohorts };
}

/**
 * The model's own out-of-sample test, on the only protocols whose answer is known.
 *
 * Every protocol that already trades carries both a TVL and a market cap, so its market cap can be
 * predicted from its TVL and the multiples fitted from the *other* protocols, then compared with
 * what the market actually paid. The multiple for the held-out protocol's category is refitted
 * without it (leave-one-out), so the test never scores a number the model was shown.
 *
 * The flat baseline runs the same test with one market-wide median, the model this board replaces.
 * A typical miss of 2.5x against the baseline's 4.0x says the category structure earns its place;
 * if the two were equal, the board would be claiming a structure it does not have.
 */
export function backtest(protocols: SnapshotProtocol[], c: ModelConstants = MODEL): Backtest {
  const sample = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= c.sample_tvl_floor && !VERSIONED.test(p.name),
  );
  if (sample.length < 10) {
    return { n: sample.length, model_factor: 1, flat_factor: 1, category_factor: 1, model_wins: 0 };
  }
  const ratios = new Map<SnapshotProtocol, number>();
  for (const p of sample) ratios.set(p, clamp(p.mcap_usd! / p.tvl_usd, c.ratio_floor, c.ratio_ceiling));

  const fitted: number[] = [];
  const flat: number[] = [];
  const withCategory: number[] = [];
  let wins = 0;

  for (const held of sample) {
    const peers = sample.filter((p) => p !== held);
    const curve = fitCurve(peers, c);
    const actual = Math.log(held.mcap_usd!);
    const predicted = curve.a + curve.b * Math.log(held.tvl_usd);
    const flatMultiple = median([...ratios.values()].filter((_, i) => sample[i] !== held));
    const flatPredicted = Math.log(held.tvl_usd) + Math.log(flatMultiple);

    // The option the board drops: the held-out protocol's category residual, shrunk like the rest.
    const residuals = peers.map((p) => Math.log(p.mcap_usd!) - (curve.a + curve.b * Math.log(p.tvl_usd)));
    const inCategory = peers.map((p, i) => ({ p, r: residuals[i]! })).filter((x) => x.p.category === held.category).map((x) => x.r);
    const k = c.shrink_k;
    const adjust = inCategory.length > 0 ? (inCategory.length * median(inCategory)) / (inCategory.length + k) : 0;

    const miss = Math.abs(predicted - actual);
    const flatMiss = Math.abs(flatPredicted - actual);
    fitted.push(miss);
    flat.push(flatMiss);
    withCategory.push(Math.abs(predicted + adjust - actual));
    if (miss < flatMiss) wins++;
  }
  const factor = (ms: number[]): number => Math.round(Math.exp(median(ms)) * 100) / 100;
  return {
    n: sample.length,
    model_factor: factor(fitted),
    flat_factor: factor(flat),
    category_factor: factor(withCategory),
    model_wins: Math.round((wins / sample.length) * 1000) / 1000,
  };
}

/** The category's token conversion rate against the snapshot's, pulled toward 1. */
function categoryFactor(protocols: SnapshotProtocol[], category: string | null, base: number, c: ModelConstants): number {
  if (category === null) return 1;
  const inCat = protocols.filter((p) => p.category === category);
  if (inCat.length === 0) return 1;
  const tokens = inCat.filter((p) => !isPreToken(p)).length;
  const rate = (tokens + c.odds_category_k * base) / (inCat.length + c.odds_category_k);
  if (base <= 0) return 1;
  return clamp(rate / base, 0.45, 2);
}

/** The odds one protocol gets, from its age cohort and its category's conversion. */
export function oddsFor(
  p: SnapshotProtocol,
  age: number | null,
  odds: OddsModel,
  protocols: SnapshotProtocol[],
  c: ModelConstants = MODEL,
): number {
  const a = age ?? c.unknown_age_days;
  let cohort = odds.cohorts[odds.cohorts.length - 1]!;
  for (const band of odds.cohorts) {
    if (a >= band.min_days && a < band.max_days) {
      cohort = band;
      break;
    }
  }
  const factor = categoryFactor(protocols, p.category, odds.base_rate, c);
  return round4(clamp(cohort.rate * factor, c.odds_floor, c.odds_ceiling));
}

/** The fitted multiple, the three corrections and the implied value one protocol gets. */
export interface ImpliedResult {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
}

/**
 * The implied value: the curve's price for this TVL, corrected by the record the curve cannot see.
 *
 * `miss` is the backtest's typical multiplicative miss, and it sets the band: the row shows what
 * the number is worth, not a false decimal. A 4x miss means the board's own test says an estimate
 * of this kind lands within a factor of four on the typical protocol, and the band says so.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  c: ModelConstants,
  multiple: number,
  miss: number,
): ImpliedResult {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? c.unknown_age_days;
  const growthPct = clamp(finite(protocol.change_7d, 0), c.growth_floor, c.growth_cap);
  const growthMult = 1 + (growthPct / 100) * c.growth_weight;
  const maturityMult = c.maturity_floor + (clamp(ageForModel, 0, c.maturity_days) / c.maturity_days) * c.maturity_range;
  const chainMult = 1 + c.chain_premium * Math.min(Math.max(protocol.chains.length - 1, 0), c.chain_cap);
  const factors = growthMult * maturityMult * chainMult;
  const at = (m: number): number => Math.max(1, Math.round(protocol.tvl_usd * m * factors));
  return {
    implied: at(multiple),
    low: at(multiple / Math.max(1, miss)),
    high: at(multiple * Math.max(1, miss)),
    multiple,
    growthPct,
    growthMult: round4(growthMult),
    maturityMult: round4(maturityMult),
    chainMult: round4(chainMult),
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * What one farm position needs, and the verdict that follows from the protocol's own record.
 *
 * The verdict is a policy, and it is stated as one: a position is worth the trouble when a launch
 * is likely enough (farm_odds) and large enough (farm_min_implied_usd) to matter, worth watching
 * when either is only half true, and skipped otherwise. What the position actually captures
 * depends on the protocol's points programme, which the snapshot does not carry, so no dollar
 * payoff is claimed here: the reader gets the cost in gas, the hours, and the reason.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, implied: number, odds: number, c: ModelConstants = MODEL): FarmEconomics {
  const deposit = depositFor(p);
  const gas = deposit >= 150 ? 8 : 4;
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  // The sum of the plan's own minute column: wallet 5, open 15, record check, weekly actions, hold 0,
  // claim 10, log 5. Kept equal to the timetable so the headline and the table cannot disagree.
  const minutes = 35 + recordMinutes(p.change_7d) + 10 * weeks;
  const gasTotal = 3 + gas + 2 * weeks;
  const falling = p.change_7d !== null && p.change_7d <= -20;
  const verdict = falling
    ? 'skip'
    : odds >= c.farm_odds && implied >= c.farm_min_implied_usd
      ? 'farm'
      : odds >= c.watch_odds || implied >= c.watch_min_implied_usd
        ? 'watch'
        : 'skip';
  return {
    deposit_usd: deposit,
    gas_usd: gas,
    hold_days: hold,
    minutes,
    expected_value_usd: Math.round(implied * odds),
    cost_bps: Math.round((gasTotal / deposit) * 10_000),
    verdict,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; multiples: MultipleRow[]; global: number; odds: OddsModel; curve: Curve; test: Backtest } {
  const index = bySlug(snapshot.protocols);
  const { rows: multipleRows, global } = buildMultiples(snapshot.protocols, model);
  const odds = buildOdds(snapshot.protocols, snapshot.as_of, model);
  const curve = fitCurve(snapshot.protocols, model);
  const test = backtest(snapshot.protocols, model);

  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is covered, whatever else the board carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the snapshot holds, whatever its size. The
  // watchlist is the floor, so a protocol above it that the watchlist misses is the one worth
  // pricing most, and dropping it would make the board's coverage a filter instead of a claim.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const multiple = multipleAt(p.tvl_usd, curve);
    const r = impliedValue(p, snapshot.as_of, model, multiple, test.model_factor);
    const rowOdds = oddsFor(p, r.age, odds, snapshot.protocols, model);
    return { p, r, rowOdds };
  });
  scored.sort((a, b) => b.r.implied - a.r.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => {
    const farm = farmEconomics(s.p, s.r.age, s.r.implied, s.rowOdds, model);
    const steps = farmSteps(s.p, s.r.age, farm, s.rowOdds, model);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.r.age,
      implied_value_usd: s.r.implied,
      implied_low_usd: s.r.low,
      implied_high_usd: s.r.high,
      odds: s.rowOdds,
      expected_value_usd: farm.expected_value_usd,
      model: {
        multiple: s.r.multiple,
        growth_pct: s.r.growthPct,
        growth_multiplier: s.r.growthMult,
        maturity_multiplier: s.r.maturityMult,
        chain_multiplier: s.r.chainMult,
        age_days: s.r.age,
      },
      farm,
      farm_steps: steps.map(stepText),
      farm_plan: farmPlan(steps, farm.deposit_usd),
    };
  });
  return { board, multiples: multipleRows, global, odds, curve, test };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function depositFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold: younger protocols need a longer window to show up in more than one snapshot. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${deposit} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${deposit} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${deposit} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${deposit} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${deposit} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${deposit} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${deposit} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${deposit} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${deposit} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${deposit} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${deposit} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * The step that reads the protocol's own seven-day record, so two protocols in one category do
 * not get the same plan. Which sentence it carries is decided by change_7d and by the odds.
 */
/** Minutes the record check takes: a deposit split in two needs a second confirmation. */
export function recordMinutes(change: number | null): number {
  return change !== null && change <= -5 && change > -20 ? 10 : 5;
}

function recordStep(p: SnapshotProtocol, odds: number): FarmStep {
  const ch = p.change_7d;
  const minutes = recordMinutes(ch);
  if (ch === null) {
    return {
      text: `The snapshot carries no seven-day change for ${p.name}, so treat its TVL as unconfirmed: open the position small and check the protocol's own TVL page before adding to it.`,
      cost: 'the first deposit only',
      time: '5 minutes to check',
      label: 'Confirm TVL',
      usd: 0,
      minutes,
      days: 0,
    };
  }
  if (ch <= -20) {
    return {
      text: `TVL fell ${ch.toFixed(1)}% in seven days, the fastest drawdown a farm should wait out: hold the deposit small and add only after two weekly snapshots stop falling.`,
      cost: 'the $' + depositFor(p) + ' stays in the position',
      time: '14 days of watching, inside the hold window',
      label: 'Wait out drawdown',
      usd: 0,
      minutes,
      days: 0,
    };
  }
  if (ch <= -5) {
    return {
      text: `TVL is down ${ch.toFixed(1)}% over seven days, so the position is early rather than confirmed: deposit half now and half when the next snapshot turns up.`,
      cost: 'half the deposit now, half later',
      time: '7 to 14 days between halves, both inside the hold',
      label: 'Split the deposit',
      usd: 0,
      minutes,
      days: 0,
    };
  }
  if (ch >= 20) {
    return {
      text: `TVL is up ${ch.toFixed(1)}% in seven days, so adoption is already moving: deposit in one go and expect the points window to be shorter than a quiet protocol's.`,
      cost: 'the whole deposit at once',
      time: '5 minutes to confirm',
      label: 'Move in once',
      usd: 0,
      minutes,
      days: 0,
    };
  }
  return {
    text: `TVL moved ${ch >= 0 ? '+' : ''}${ch.toFixed(1)}% in seven days, a steady record: a plain deposit held through the window is enough${
      odds >= 0.6 ? ', and the odds say the wait is worth it' : ''
    }.`,
    cost: 'the deposit only',
    time: '5 minutes to confirm',
    label: 'Plain deposit',
    usd: 0,
    minutes,
    days: 0,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age, seven-day change, odds). No name is
 * hand-written, and no two categories get the same second step.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farm: FarmEconomics, odds: number, c: ModelConstants = MODEL): FarmStep[] {
  const chain = chainOf(p);
  const action = actionFor(p, farm.deposit_usd, chain);
  const weeks = Math.max(1, Math.round(farm.hold_days / 7));
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline: ${
        farm.verdict === 'farm'
          ? `the model puts ${(odds * 100).toFixed(0)}% on a launch here, so this wallet should hold nothing else`
          : `the model puts only ${(odds * 100).toFixed(0)}% on a launch here, so keep the deposit small`
      }.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
      label: 'Fresh wallet',
      usd: 3,
      minutes: 5,
      days: 0,
    },
    {
      text: action,
      cost: `$${farm.deposit_usd} of capital and about $${farm.gas_usd} of gas`,
      time: '15 minutes to set up',
      label: 'Open position',
      usd: farm.deposit_usd + farm.gas_usd,
      minutes: 15,
      days: 0,
    },
    recordStep(p, odds),
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep every receipt in one folder.`,
      cost: `about $2 of gas a week for ${weeks} weeks`,
      time: '10 minutes a week',
      label: `Weekly action \u00d7${weeks}`,
      usd: 2 * weeks,
      minutes: 10 * weeks,
      days: 0,
    },
    {
      text: `Hold for at least ${farm.hold_days} days (this protocol is ${
        age === null ? 'of unknown age' : `${age} days old`
      }) so the activity appears in more than one snapshot; the whole position costs ${
        farm.minutes >= 120 ? `${(farm.minutes / 60).toFixed(1)} hours` : `${farm.minutes} minutes`
      } of your time, and its gas is ${(farm.cost_bps / 100).toFixed(0)}% of the deposit.`,
      cost: `the $${farm.deposit_usd} stays in the position`,
      time: `${farm.hold_days} days`,
      label: `Hold ${farm.hold_days} days`,
      usd: 0,
      minutes: 0,
      days: farm.hold_days,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes: never pay to claim, and never sign a claim you did not start.`,
      cost: 'no fee to check',
      time: '10 minutes',
      label: 'Claim, then exit',
      usd: 0,
      minutes: 10,
      days: 0,
      closes: true,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, so the position can be repeated, sized up or unwound without guessing which deposits counted.`,
      cost: 'nothing but the log',
      time: '5 minutes',
      label: 'Farm log',
      usd: 0,
      minutes: 5,
      days: 0,
    },
  ];
}

/** The live-token protocols, by market cap, with the ratio the model reads off them. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd === null || p.tvl_usd <= 0 ? null : round4(p.mcap_usd / p.tvl_usd),
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: readonly string[]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    watchlisted: watchlist.includes(row.slug),
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    odds: row.odds,
    expected_value_usd: row.expected_value_usd,
    multiple: row.model.multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm: row.farm,
    farm_steps: row.farm_steps,
    farm_plan: row.farm_plan,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, multiples, global, odds, curve, test } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    account: accountFor(snapshot.protocols, board.length, snapshot.watchlist),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    market_median_multiple: global,
    category_count: multiples.filter((m) => m.samples > 0).length,
    category_total: multiples.length,
    odds_model: odds,
    curve,
    backtest: test,
    rows: board.map((row) => radarRow(row, snapshot.watchlist)),
    live,
    multiples,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows: the gate takes 100 or more`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
