/* Signal Lab core: traffic model + optimisers. Works in browser (window.TL) and Node (module.exports). */
(function (root) {
  'use strict';
  // ---------- Network ----------
  const G = 3, N = G * G, NQ = N * 4;   // 3x3 grid, 4 approaches per junction
  const C = 60;      // cycle length (s)
  const Y = 3;       // amber + all-red lost time per phase (s)
  const SAT = 0.5;   // saturation flow per approach (veh/s) = 1800 veh/h
  const TAU = 8;     // free-flow travel time between junctions (s)
  const T = 900;     // simulated horizon (s) = 15 min
  const D = N * 2;   // decision variables: (green split, offset) per junction
  const MP_DEFAULT = { minGreen: 10, threshold: 1 };
  const HEAD = [[1, 0], [0, -1], [-1, 0], [0, 1]]; // heading S, W, N, E (approach index = heading)
  const TURNS = [0.76, 0.12, 0.12];                 // straight, left, right

  // ROUTE[q] = [dest0, frac0, dest1, frac1, dest2, frac2]; dest -1 = leaves the network
  const ROUTE = [];
  const UPSTREAM_OUT = new Uint8Array(NQ);
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / G), c = i % G;
    for (let a = 0; a < 4; a++) {
      const outs = [];
      const hs = [a, (a + 3) % 4, (a + 1) % 4];
      for (let k = 0; k < 3; k++) {
        const h = hs[k], nr = r + HEAD[h][0], nc = c + HEAD[h][1];
        outs.push(nr < 0 || nr >= G || nc < 0 || nc >= G ? -1 : (nr * G + nc) * 4 + h, TURNS[k]);
      }
      ROUTE.push(outs);
      const ur = r - HEAD[a][0], uc = c - HEAD[a][1];
      UPSTREAM_OUT[i * 4 + a] = (ur < 0 || ur >= G || uc < 0 || uc >= G) ? 1 : 0;
    }
  }

  const SCENARIOS = {
    arterial: {
      name: 'Arterial rush hour',
      note: 'Heavy eastbound commuter flow on the middle arterial, lighter cross streets.',
      rate(r, c, a) { if (r === 1 && a === 3) return 0.30; if (r === 1 && a === 1) return 0.19; return 0.10; }
    },
    balanced: {
      name: 'Balanced grid',
      note: 'Equal demand from every edge. Hardest case for green waves.',
      rate() { return 0.145; }
    },
    inbound: {
      name: 'Morning inbound',
      note: 'Commuters pour in from the north and west towards the centre.',
      rate(r, c, a) { if (a === 0) return 0.21; if (a === 3) return 0.17; return 0.07; }
    }
  };
  const profile = t => 0.65 + 0.65 * Math.exp(-Math.pow((t - T / 2) / (T / 4.5), 2)); // peak in the middle

  function makeContext(scenKey, demand) {
    const sc = SCENARIOS[scenKey];
    const arr = new Float64Array(T * NQ);
    let total = 0;
    for (let t = 0; t < T; t++) {
      const p = profile(t) * demand;
      for (let q = 0; q < NQ; q++) if (UPSTREAM_OUT[q]) {
        const i = q >> 2, v = sc.rate(Math.floor(i / G), i % G, q & 3) * p;
        arr[t * NQ + q] = v; total += v;
      }
    }
    return { arr, total, q: new Float64Array(NQ), pend: new Float64Array(TAU * NQ), g: new Float64Array(N), o: new Float64Array(N), key: scenKey, demand };
  }

  const fix = x => x.map((v, j) => j % 2 === 0 ? Math.min(1, Math.max(0, v)) : ((v % 1) + 1) % 1);
  const splitSec = v => (0.2 + 0.6 * v) * C;   // north-south green boundary inside the cycle

  // Fast fixed-time evaluation: average delay per vehicle (s)
  function evaluate(x, ctx) {
    const q = ctx.q.fill(0), pend = ctx.pend.fill(0), arr = ctx.arr, g = ctx.g, o = ctx.o;
    for (let i = 0; i < N; i++) { g[i] = splitSec(Math.min(1, Math.max(0, x[2 * i]))); o[i] = (((x[2 * i + 1] % 1) + 1) % 1) * C; }
    let delay = 0;
    for (let t = 0; t < T; t++) {
      const base = (t % TAU) * NQ, ab = t * NQ;
      for (let k = 0; k < NQ; k++) { q[k] += pend[base + k] + arr[ab + k]; pend[base + k] = 0; }
      for (let i = 0; i < N; i++) {
        const tc = (t + o[i]) % C;
        const ph = tc < g[i] - Y ? 0 : (tc >= g[i] && tc < C - Y ? 1 : -1);
        if (ph < 0) continue;
        for (let a = ph; a < 4; a += 2) {
          const k = i * 4 + a, d = q[k] < SAT ? q[k] : SAT;
          if (d <= 0) continue;
          q[k] -= d;
          const R = ROUTE[k];
          if (R[0] >= 0) pend[base + R[0]] += d * R[1];
          if (R[2] >= 0) pend[base + R[2]] += d * R[3];
          if (R[4] >= 0) pend[base + R[4]] += d * R[5];
        }
      }
      for (let k = 0; k < NQ; k++) delay += q[k];
    }
    let resid = 0;
    for (let k = 0; k < NQ; k++) resid += q[k];
    for (let k = 0; k < pend.length; k++) resid += pend[k];
    return (delay + resid * 90) / ctx.total;   // vehicles still in the network are charged 90 s extra
  }

  // ---------- Stepwise simulator (live view + max-pressure) ----------
  class Sim {
    constructor(ctx, ctrl) { this.ctx = ctx; this.ctrl = ctrl; this.reset(); }
    reset() {
      this.t = 0; this.q = new Float64Array(NQ); this.pend = new Float64Array(TAU * NQ);
      this.phase = new Int8Array(N); this.cur = new Int8Array(N); this.yel = new Int8Array(N);
      this.next = new Int8Array(N); this.el = new Int16Array(N); this.delay = 0; this.arrived = 0;
    }
    setParams(x) { this.ctrl = { type: 'fixed', x: x.slice() }; }
    step() {
      const { q, pend } = this, ctx = this.ctx, tt = this.t % T;
      const base = (this.t % TAU) * NQ, ab = tt * NQ;
      for (let k = 0; k < NQ; k++) { q[k] += pend[base + k] + ctx.arr[ab + k]; this.arrived += ctx.arr[ab + k]; pend[base + k] = 0; }
      for (let i = 0; i < N; i++) {
        let ph;
        if (this.ctrl.type === 'fixed') {
          const x = this.ctrl.x, g = splitSec(Math.min(1, Math.max(0, x[2 * i]))), o = (((x[2 * i + 1] % 1) + 1) % 1) * C;
          const tc = (this.t + o) % C;
          ph = tc < g - Y ? 0 : (tc >= g && tc < C - Y ? 1 : -1);
        } else ph = this.mpDecide(i);
        this.phase[i] = ph;
        if (ph < 0) continue;
        for (let a = ph; a < 4; a += 2) {
          const k = i * 4 + a, d = Math.min(q[k], SAT);
          if (d <= 0) continue;
          q[k] -= d;
          const R = ROUTE[k];
          for (let j = 0; j < 6; j += 2) if (R[j] >= 0) pend[base + R[j]] += d * R[j + 1];
        }
      }
      for (let k = 0; k < NQ; k++) this.delay += q[k];
      this.t++;
    }
    pressure(i, ph) {
      const q = this.q; let p = 0;
      for (let a = ph; a < 4; a += 2) {
        const k = i * 4 + a, R = ROUTE[k]; let down = 0;
        for (let j = 0; j < 6; j += 2) if (R[j] >= 0) down += R[j + 1] * q[R[j]];
        p += q[k] - down;
      }
      return p;
    }
    // Max-Pressure (Varaiya 2013): serve the phase whose upstream-minus-downstream queue is largest
    mpDecide(i) {
      if (this.yel[i] > 0) { this.yel[i]--; if (this.yel[i] === 0) { this.cur[i] = this.next[i]; this.el[i] = 0; } return -1; }
      this.el[i]++;
      const c = this.cur[i];
      const mp = this.ctrl.opts || MP_DEFAULT;
      if (this.el[i] >= mp.minGreen && this.pressure(i, 1 - c) > this.pressure(i, c) + mp.threshold) {
        this.next[i] = 1 - c; this.yel[i] = Y - 1; return -1;
      }
      return c;
    }
  }

  function evaluateMaxPressure(ctx, opts) {
    const s = new Sim(ctx, { type: 'mp', opts: opts || MP_DEFAULT });
    for (let t = 0; t < T; t++) s.step();
    let resid = 0;
    for (let k = 0; k < NQ; k++) resid += s.q[k];
    for (let k = 0; k < s.pend.length; k++) resid += s.pend[k];
    return (s.delay + resid * 90) / ctx.total;
  }

  // ---------- Random numbers ----------
  function rngFrom(seed) {
    let a = seed >>> 0;
    const u = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    let spare = null;
    u.gauss = () => { if (spare !== null) { const s = spare; spare = null; return s; } let x, y, r; do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f; };
    return u;
  }
  const randVec = (rng) => Array.from({ length: D }, () => rng());

  // ---------- Optimisers (generators: yield a candidate, receive its fitness) ----------
  function* GA(rng, budget, o, st) {
    const P = o.pop, elite = Math.min(o.elite, P - 1), pm = o.pm, K = o.tour;
    let pop = [], fit = [];
    st.pop = pop; st.fit = fit; st.gen = 0;
    for (let i = 0; i < P; i++) { const x = randVec(rng); pop.push(x); fit.push(yield x); }
    const tour = () => { let b = Math.floor(rng() * P); for (let k = 1; k < K; k++) { const c = Math.floor(rng() * P); if (fit[c] < fit[b]) b = c; } return pop[b]; };
    while (true) {
      const order = pop.map((_, i) => i).sort((a, b) => fit[a] - fit[b]);
      const np = [], nf = [];
      for (let e = 0; e < elite; e++) { np.push(pop[order[e]]); nf.push(fit[order[e]]); }
      while (np.length < P) {
        const a = tour(), b = tour(), child = new Array(D);
        for (let j = 0; j < D; j++) {  // BLX-0.3 crossover
          const lo = Math.min(a[j], b[j]), hi = Math.max(a[j], b[j]), w = hi - lo;
          child[j] = rng() < o.pc ? lo - 0.3 * w + rng() * 1.6 * w : a[j];
          if (rng() < pm) child[j] += rng.gauss() * o.ms;
        }
        const cx = fix(child);
        np.push(cx); nf.push(yield cx);
      }
      pop = np; fit = nf; st.pop = pop; st.fit = fit; st.gen++;
    }
  }

  function* ACO(rng, budget, o, st) {  // MAX-MIN Ant System over discretised timing levels
    const L = o.levels, M = o.ants, rho = o.rho, tmin = 0.05, tmax = 4, al = o.alpha;
    const tau = Array.from({ length: D }, () => new Float64Array(L).fill(1));
    let gBest = null, gBestF = Infinity;
    st.tau = tau; st.L = L; st.iter = 0;
    while (true) {
      let iBest = null, iBestF = Infinity;
      for (let m = 0; m < M; m++) {
        const lv = new Array(D), x = new Array(D);
        for (let j = 0; j < D; j++) {
          let s = 0; for (let l = 0; l < L; l++) s += Math.pow(tau[j][l], al);
          let r = rng() * s, l = 0;
          while (l < L - 1 && (r -= Math.pow(tau[j][l], al)) > 0) l++;
          lv[j] = l; x[j] = (l + rng()) / L;
        }
        const f = yield x;
        if (f < iBestF) { iBestF = f; iBest = lv; }
        if (f < gBestF) { gBestF = f; gBest = lv; }
      }
      for (let j = 0; j < D; j++) {
        for (let l = 0; l < L; l++) tau[j][l] *= (1 - rho);
        tau[j][iBest[j]] += o.q; tau[j][gBest[j]] += o.q;
        for (let l = 0; l < L; l++) tau[j][l] = Math.min(tmax, Math.max(tmin, tau[j][l]));
      }
      st.iter++;
    }
  }

  function* PSO(rng, budget, o, st) {
    const S = o.swarm, w = o.w, c1 = o.c1, c2 = o.c2, vmax = o.vmax;
    const X = [], V = [], P = [], PF = [];
    st.X = X; st.V = V; st.P = P;
    let gX = null, gF = Infinity;
    for (let i = 0; i < S; i++) {
      const x = randVec(rng); X.push(x); V.push(x.map(() => (rng() - 0.5) * 0.2));
      const f = yield x; P.push(x.slice()); PF.push(f); if (f < gF) { gF = f; gX = x.slice(); }
    }
    while (true) {
      for (let i = 0; i < S; i++) {
        for (let j = 0; j < D; j++) {
          let v = w * V[i][j] + c1 * rng() * (P[i][j] - X[i][j]) + c2 * rng() * (gX[j] - X[i][j]);
          V[i][j] = Math.max(-vmax, Math.min(vmax, v));
          X[i][j] += V[i][j];
        }
        X[i] = fix(X[i]);
        const f = yield X[i];
        if (f < PF[i]) { PF[i] = f; P[i] = X[i].slice(); }
        if (f < gF) { gF = f; gX = X[i].slice(); }
        st.g = gX;
      }
    }
  }

  function* SA(rng, budget, o, st) {
    let x = randVec(rng), f = yield x, k = 0;
    const T0 = o.t0, T1 = Math.min(o.t1, T0), md = o.dims;
    while (true) {
      const frac = Math.min(1, k / budget), temp = T0 * Math.pow(T1 / T0, frac), sig = o.sig * (1 - frac) + 0.02;
      st.temp = temp; st.x = x; st.f = f;
      const y = x.slice(), n = 1 + Math.floor(rng() * md);
      for (let s = 0; s < n; s++) { const j = Math.floor(rng() * D); y[j] += rng.gauss() * sig; }
      const yx = fix(y), fy = yield yx; k++;
      if (fy < f || rng() < Math.exp((f - fy) / temp)) { x = yx; f = fy; }
    }
  }

  // Jacobi eigen-decomposition for symmetric matrices
  function eigSym(A) {
    const n = A.length, a = A.map(r => r.slice()), V = a.map((r, i) => r.map((_, j) => i === j ? 1 : 0));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { vals: a.map((r, i) => r[i]), vecs: V };
  }

  // CMA-ES (Hansen & Ostermeier 2001), full covariance with rank-one + rank-mu updates
  function* CMAES(rng, budget, o, st) {
    const n = D, lam = Math.max(4, Math.round(o.lam)), mu = Math.floor(lam / 2);
    let w = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
    const ws = w.reduce((s, v) => s + v, 0); w = w.map(v => v / ws);
    const mueff = 1 / w.reduce((s, v) => s + v * v, 0);
    const cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), cs = (mueff + 2) / (n + mueff + 5);
    const c1 = 2 / ((n + 1.3) ** 2 + mueff), cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff));
    const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
    const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    let m = randVec(rng), sigma = o.sigma0;
    let pc = new Array(n).fill(0), ps = new Array(n).fill(0);
    let B = m.map((_, i) => m.map((_, j) => i === j ? 1 : 0)), Dg = new Array(n).fill(1);
    let Cm = B.map(r => r.slice()), invSq = B.map(r => r.slice());
    let count = 0, eigenAt = 0;
    const pen = x => { let p = 0; for (let j = 0; j < n; j += 2) { if (x[j] < 0) p += x[j] * x[j]; if (x[j] > 1) p += (x[j] - 1) ** 2; } return 40 * p; };
    while (true) {
      st.m = m; st.sigma = sigma; st.C = Cm;
      const X = [], F = [];
      for (let k = 0; k < lam; k++) {
        const z = Array.from({ length: n }, () => rng.gauss());
        const x = new Array(n);
        for (let i = 0; i < n; i++) { let y = 0; for (let j = 0; j < n; j++) y += B[i][j] * Dg[j] * z[j]; x[i] = m[i] + sigma * y; }
        X.push(x); F.push((yield fix(x)) + pen(x)); count++;
      }
      const idx = F.map((_, i) => i).sort((a, b) => F[a] - F[b]);
      const old = m.slice();
      m = new Array(n).fill(0);
      for (let i = 0; i < mu; i++) for (let j = 0; j < n; j++) m[j] += w[i] * X[idx[i]][j];
      const yw = m.map((v, j) => (v - old[j]) / sigma);
      const c = Math.sqrt(cs * (2 - cs) * mueff);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += invSq[i][j] * yw[j]; ps[i] = (1 - cs) * ps[i] + c * s; }
      const psn = Math.sqrt(ps.reduce((s, v) => s + v * v, 0));
      const hsig = psn / Math.sqrt(1 - Math.pow(1 - cs, 2 * count / lam)) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
      const cp = Math.sqrt(cc * (2 - cc) * mueff);
      for (let i = 0; i < n; i++) pc[i] = (1 - cc) * pc[i] + hsig * cp * yw[i];
      const art = idx.slice(0, mu).map(k => X[k].map((v, j) => (v - old[j]) / sigma));
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
        let rmu = 0; for (let k = 0; k < mu; k++) rmu += w[k] * art[k][i] * art[k][j];
        const v = (1 - c1 - cmu) * Cm[i][j] + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * Cm[i][j]) + cmu * rmu;
        Cm[i][j] = v; Cm[j][i] = v;
      }
      sigma = Math.min(0.6, sigma * Math.exp((cs / damps) * (psn / chiN - 1)));
      if (count - eigenAt > lam / (c1 + cmu) / n / 10) {
        eigenAt = count;
        const e = eigSym(Cm); B = e.vecs; Dg = e.vals.map(v => Math.sqrt(Math.max(v, 1e-20)));
        invSq = B.map((_, i) => B.map((_, j) => { let s = 0; for (let k = 0; k < n; k++) s += B[i][k] * B[j][k] / Dg[k]; return s; }));
      }
    }
  }

  const P = (key, label, min, max, step, def, hint) => ({ key, label, min, max, step, def, hint });
  const ALGOS = [
    { id: 'ga', name: 'Genetic Algorithm', short: 'GA', make: GA, syllabus: true, params: [
      P('pop', 'Population size', 10, 80, 2, 30, 'Timing plans alive per generation'),
      P('pc', 'Crossover rate', 0.3, 1, 0.05, 0.9, 'Chance each gene is blended from both parents'),
      P('pm', 'Mutation rate', 0.01, 0.4, 0.01, 0.08, 'Chance each gene gets a random kick'),
      P('ms', 'Mutation size', 0.02, 0.4, 0.01, 0.15, 'Standard deviation of the kick'),
      P('tour', 'Tournament size', 2, 8, 1, 3, 'Higher = stronger selection pressure'),
      P('elite', 'Elites kept', 0, 6, 1, 2, 'Best plans copied unchanged')] },
    { id: 'aco', name: 'Ant Colony (MMAS)', short: 'ACO', make: ACO, syllabus: true, params: [
      P('ants', 'Ants per iteration', 4, 40, 1, 15, 'Plans built per colony iteration'),
      P('levels', 'Timing levels', 6, 24, 1, 12, 'Each split/offset is discretised into this many bins'),
      P('rho', 'Evaporation ρ', 0.01, 0.4, 0.01, 0.08, 'Fraction of pheromone lost per iteration'),
      P('q', 'Deposit amount', 0.1, 2, 0.05, 0.6, 'Pheromone added on the best trails'),
      P('alpha', 'Pheromone weight α', 0.5, 3, 0.1, 1, 'How strongly ants follow pheromone')] },
    { id: 'pso', name: 'Particle Swarm', short: 'PSO', make: PSO, syllabus: true, params: [
      P('swarm', 'Swarm size', 6, 60, 1, 24, 'Number of particles'),
      P('w', 'Inertia w', 0.2, 1, 0.01, 0.72, 'How much a particle keeps its velocity'),
      P('c1', 'Cognitive c₁', 0, 3, 0.05, 1.49, 'Pull towards its own best'),
      P('c2', 'Social c₂', 0, 3, 0.05, 1.49, 'Pull towards the swarm best'),
      P('vmax', 'Max velocity', 0.02, 0.5, 0.01, 0.2, 'Speed limit per step')] },
    { id: 'sa', name: 'Simulated Annealing', short: 'SA', make: SA, syllabus: true, params: [
      P('t0', 'Start temperature', 0.1, 20, 0.1, 3, 'Higher accepts more uphill moves early'),
      P('t1', 'End temperature', 0.001, 0.5, 0.001, 0.01, 'Temperature at the end of the budget'),
      P('sig', 'Step size', 0.02, 0.5, 0.01, 0.18, 'Initial neighbour move size (shrinks over time)'),
      P('dims', 'Genes per move', 1, 8, 1, 3, 'Max variables changed per neighbour')] },
    { id: 'cma', name: 'CMA-ES', short: 'CMA-ES', make: CMAES, syllabus: false, params: [
      P('lam', 'Offspring λ', 6, 48, 1, 4 + Math.floor(3 * Math.log(D)), 'Samples per generation (default 4+3·ln n)'),
      P('sigma0', 'Initial step σ₀', 0.05, 0.6, 0.01, 0.25, 'Starting search radius; adapts itself after')] }
  ];
  const MP_PARAMS = [
    P('minGreen', 'Minimum green (s)', 4, 25, 1, 10, 'Shortest green before a switch is allowed'),
    P('threshold', 'Switch threshold', 0, 6, 0.1, 1, 'Pressure advantage needed to switch phase')];
  const defaults = list => Object.fromEntries(list.map(p => [p.key, p.def]));

  // A single optimisation run, advanced a few evaluations at a time
  class Run {
    constructor(algo, ctx, seed, budget, opts) {
      this.algo = algo; this.ctx = ctx; this.budget = budget;
      this.opts = Object.assign(defaults(algo.params), opts || {});
      this.state = {}; this.trail = [];
      this.gen = algo.make(rngFrom(seed), budget, this.opts, this.state);
      this.cur = this.gen.next().value;
      this.evals = 0; this.bestF = Infinity; this.bestX = null; this.hist = []; this.ms = 0; this.improved = false;
    }
    get done() { return this.evals >= this.budget; }
    advance(k) {
      const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      for (let s = 0; s < k && !this.done; s++) {
        const x = fix(this.cur), f = evaluate(x, this.ctx);
        this.evals++;
        this.trail.push(x[8], x[9], f); if (this.trail.length > 900) this.trail.splice(0, 3);
        if (f < this.bestF) { this.bestF = f; this.bestX = x; this.improved = true; this.hist.push([this.evals, f]); }
        this.cur = this.gen.next(f).value;
      }
      if (this.done && this.hist.length && this.hist[this.hist.length - 1][0] !== this.evals) this.hist.push([this.evals, this.bestF]);
      this.ms += (typeof performance !== 'undefined' ? performance : Date).now() - t0;
    }
  }

  const baselineX = () => Array.from({ length: D }, (_, j) => j % 2 === 0 ? 0.5 : 0);

  const api = { G, N, NQ, C, Y, SAT, TAU, T, D, HEAD, ROUTE, UPSTREAM_OUT, SCENARIOS, ALGOS, MP_PARAMS, MP_DEFAULT, defaults, makeContext, evaluate, evaluateMaxPressure, Sim, Run, fix, splitSec, baselineX, rngFrom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TL = api;
})(typeof window !== 'undefined' ? window : globalThis);
