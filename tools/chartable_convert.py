"""Convert GAP CTblLib MOT(...) blocks into explicit JSON character tables.

Usage: python3 -I tools/chartable_convert.py <ctbllib data dir> explore/simple-groups/chartables
Output per group: {id, gap, order, classes:[{name, cent, pw:[[p, class index]]}], ind, chars, labels:{label:[re, im]}, bases:[{name, def, re, im}], source}
Entries are ints (big ones as strings), or an ATLAS irrationality label whose numeric value is in `labels`.
Every table is checked: square, sum of squared degrees = |G|, every character has norm 1.
"""
import re, sys, glob, json, gzip, math, cmath
from fractions import Fraction
from math import gcd

D, OUT = sys.argv[1], sys.argv[2]
TEXT = {f: open(f, encoding='latin-1').read() for f in glob.glob(D + '/*.tbl')}

def block(name):
    for t in TEXT.values():
        m = re.search(r'^MOT\("' + re.escape(name) + r'",', t, re.M)
        if m:
            nxt = re.search(r'^(MOT|ARC|ALF|ALN)\(', t[m.end():], re.M)
            return t[m.start(): m.end() + (nxt.start() if nxt else len(t))]
    raise KeyError(name)

# ---------- cyclotomics: dict {(n, k): coeff} normalised to a common conductor ----------
class Cyc:
    __slots__ = ('n', 'c')
    def __init__(self, n=1, c=None):
        self.n, self.c = n, dict(c or {})
    @staticmethod
    def int(v): return Cyc(1, {0: v} if v else {})
    @staticmethod
    def E(n): return Cyc(n, {1 % n: 1})
    def lift(self, N):
        f = N // self.n
        return {(k * f) % N: v for k, v in self.c.items()}
    def _bin(self, o, op):
        N = self.n * o.n // gcd(self.n, o.n)
        a, b = self.lift(N), o.lift(N)
        r = dict(a)
        for k, v in b.items(): r[k] = op(r.get(k, 0), v)
        return Cyc(N, {k: v for k, v in r.items() if v})
    def __add__(s, o): return s._bin(o, lambda x, y: x + y)
    def __sub__(s, o): return s._bin(o, lambda x, y: x - y)
    def __mul__(s, o):
        N = s.n * o.n // gcd(s.n, o.n)
        a, b, r = s.lift(N), o.lift(N), {}
        for i, x in a.items():
            for j, y in b.items():
                k = (i + j) % N; r[k] = r.get(k, 0) + x * y
        return Cyc(N, {k: v for k, v in r.items() if v})
    def __neg__(s): return Cyc(s.n, {k: -v for k, v in s.c.items()})
    def pow(s, e):
        r = Cyc.int(1)
        for _ in range(e): r = r * s
        return r
    def galois(s, k):
        return Cyc(s.n, {}) + Cyc(s.n, {}) if False else _gal(s, k)
    def value(s):
        return sum(v * cmath.exp(2j * math.pi * k / s.n) for k, v in s.c.items())

def _gal(s, k):
    r = {}
    for e, v in s.c.items():
        kk = (e * k) % s.n; r[kk] = r.get(kk, 0) + v
    return Cyc(s.n, {a: b for a, b in r.items() if b})

def canon_value(z, tol=1e-6):
    """Canonical key: rounded numeric value. Distinct cyclotomics in one table never collide at this precision."""
    re_, im = round(z.real, 6) + 0.0, round(z.imag, 6) + 0.0
    return re_, im

# ---------- tiny GAP parser ----------
TOK = re.compile(r'\s*(E\(\d+\)|GALOIS|\d+|"(?:[^"\\]|\\.)*"|\(\d+(?:,\d+)*\)(?:\(\d+(?:,\d+)*\))*|\(\)|[\[\],+\-*^()])', re.S)
def tokenize(s):
    pos, out = 0, []
    while pos < len(s):
        m = TOK.match(s, pos)
        if not m:
            if s[pos:].strip() == '': break
            raise ValueError('tok@' + s[pos:pos + 40])
        out.append(m.group(1)); pos = m.end()
    return out

class P:
    def __init__(s, toks): s.t, s.i = toks, 0
    def peek(s): return s.t[s.i] if s.i < len(s.t) else None
    def eat(s, x=None):
        t = s.t[s.i]
        if x is not None and t != x: raise ValueError(f'want {x} got {t} at {s.t[s.i-5:s.i+5]}')
        s.i += 1; return t
    def value(s):
        t = s.peek()
        if t == '[': return s.lst()
        if t.startswith('"'): s.eat(); return t[1:-1]
        if t == 'GALOIS': s.eat(); return 'GALOIS'
        if t.startswith('(') and t != '(' : s.eat(); return ('PERM', t)
        return s.expr()
    def lst(s):
        s.eat('['); out = []
        if s.peek() == ']': s.eat(); return out
        while True:
            if s.peek() == ',': out.append(None); s.eat(); continue
            if s.peek() == ']': s.eat(); return out
            out.append(s.value())
            if s.peek() == ',': s.eat();
            if s.peek() == ']': s.eat(); return out
    # expr := ['-'] term (('+'|'-') term)*
    def expr(s):
        neg = False
        if s.peek() == '-': s.eat(); neg = True
        r = s.term()
        if neg: r = -r
        while s.peek() in ('+', '-'):
            op = s.eat(); t = s.term()
            r = r + t if op == '+' else r - t
        return r
    def term(s):
        r = s.factor()
        while s.peek() == '*': s.eat(); r = r * s.factor()
        return r
    def factor(s):
        t = s.eat()
        if t.startswith('E('): b = Cyc.E(int(t[2:-1]))
        elif t.isdigit(): b = Cyc.int(int(t))
        elif t == '(': b = s.expr(); s.eat(')')
        else: raise ValueError('factor ' + t)
        if s.peek() == '^': s.eat(); b = b.pow(int(s.eat()))
        return b

def parse_mot(name):
    b = block(name)
    body = b[b.index(',', 4) + 1: b.rindex(')')]
    toks = tokenize(body)
    p = P(toks); args = []
    while p.peek() is not None and len(args) < 4:
        args.append(p.value())
        if p.peek() == ',': p.eat()
    return args  # [text, centralizers, powermaps, irreducibles, automorphisms]

def as_int(c):
    if isinstance(c, Cyc):
        if not c.c: return 0
        if set(c.c) == {0}: return c.c[0]
        # might still be rational after normalisation; check numerically
        return None
    return c

def element_orders(pm, ncls):
    orders = [1] * ncls
    for p, m in enumerate(pm, start=1):
        if not m or p < 2: continue
        for i in range(ncls):
            seq, cur, seen = [], i, {}
            while cur not in seen:
                seen[cur] = len(seq); seq.append(cur); cur = m[cur] - 1
            orders[i] *= p ** seen[cur]  # tail length = p-adic valuation
    return orders

def class_names(orders):
    cnt, names = {}, []
    for o in orders:
        k = cnt.get(o, 0); cnt[o] = k + 1
        letters = ''
        q = k
        while True:
            letters = chr(65 + q % 26) + letters; q = q // 26 - 1
            if q < 0: break
        names.append(f'{o}{letters}')
    return names

def squarefree_split(D):
    """D = f^2 * d with d squarefree; returns (f, d)."""
    sgn, n, f, d = (-1 if D < 0 else 1), abs(D), 1, 1
    p = 2
    while p * p <= n:
        while n % (p * p) == 0: n //= p * p; f *= p
        if n % p == 0: n //= p; d *= p
        p += 1
    return f, sgn * d * n

def rkey(z): return (round(z.real, 5) + 0.0, round(z.imag, 5) + 0.0)

SUBS = str.maketrans('0123456789', '₀₁₂₃₄₅₆₇₈₉')

class Namer:
    """ATLAS-style names. Quadratic: bN, rN, iN (with * = Galois conjugate). Higher degree: yN, zN, or Greek base, with *k conjugates."""
    def __init__(self):
        self.bases = []            # legend entries
        self.base_by = {}          # base name -> entry
        self.orbits = []           # (base_name, {rkey: k}) for non-quadratic
        self.greek = iter('αβγδεθκλμνξπρστφχψω')
        self.used = {}
        self.cands = {}
    def term(self, k, X):
        return X if k == 1 else '-' + X if k == -1 else f'{k}{X}'
    def lin(self, a, k, X):
        t = self.term(k, X)
        return t if a == 0 else f'{t}{a:+d}'
    def add_base(self, name, defn, z):
        if name not in self.base_by:
            e = {'name': name, 'def': defn, 're': round(z.real, 6), 'im': round(z.imag, 6)}
            self.bases.append(e); self.base_by[name] = e
    def candidates(self, N):
        out = []
        primes = [p for p in range(2, N + 1) if N % p == 0 and all(p % q for q in range(2, p))]
        for P in primes:
            for e, L in ((3, 'c'), (4, 'd'), (5, 'e'), (6, 'f'), (7, 'g'), (8, 'h')):
                if (P - 1) % e or (P - 1) // e <= 2: continue
                H = sorted({pow(x, e, P) for x in range(1, P)})
                out.append((f'{L}{P}', P, H))
        for M in sorted(d for d in range(5, N + 1) if N % d == 0):
            out.append((f'y{M}', M, [1, M - 1]))
        for M in sorted(d for d in range(3, N + 1) if N % d == 0):
            out.append((f'z{M}', M, [1]))
        return out
    def search(self, c, z):
        N = c.n; best = None
        for name, P, H in self.candidates(N):
            if name not in self.cands:
                orb = {}
                for k in range(1, P):
                    if gcd(k, P) != 1: continue
                    w = sum(cmath.exp(2j * math.pi * (k * h % P) / P) for h in H)
                    orb.setdefault(rkey(w), (k, w))
                self.cands[name] = (orb, H, P)
            orb, H, P = self.cands[name]
            if len(orb) <= 2: continue
            for kk, (j, w) in orb.items():
                for k in [x for r in range(1, 7) for x in (r, -r)]:
                    a = z - k * w
                    if abs(a.imag) < 1e-7 and abs(a.real - round(a.real)) < 1e-7:
                        a = int(round(a.real))
                        score = (abs(k), abs(a))
                        if best is None or score < best[0]:
                            best = (score, name, j, k, a, w)
                        break
        if not best:
            for name, P, H in self.candidates(N):
                orb, H, P = self.cands[name]
                if len(orb) < 3: continue
                items = sorted(orb.values())
                for i1, (j1, w1) in enumerate(items):
                    for j2, w2 in items[i1 + 1:]:
                        for k1 in (1, -1, 2, -2, 3, -3):
                            for k2 in (1, -1, 2, -2, 3, -3):
                                a = z - k1 * w1 - k2 * w2
                                if abs(a.imag) < 1e-7 and abs(a.real - round(a.real)) < 1e-7:
                                    a = int(round(a.real)); score = (abs(k1) + abs(k2), abs(a))
                                    if best is None or score < best[0]: best = (score, name, (j1, k1), (j2, k2), a)
            if not best: return None
            _, name, (j1, k1), (j2, k2), a = best
            orb, H, P = self.cands[name]
            base = next(v for kk, (jj, v) in orb.items() if jj == 1)
            self.add_base(name, ' + '.join(f'ζ_{{{P}}}' + (f'^{{{h}}}' if h != 1 else '') for h in H), base)
            X1 = name if j1 == 1 else f'{name}*{j1}'; X2 = name if j2 == 1 else f'{name}*{j2}'
            t = self.term(k1, X1) + ('+' if k2 > 0 else '') + self.term(k2, X2)
            return (t if a == 0 else f'{t}{a:+d}').replace('-', '−')
        _, name, j, k, a, w = best
        orb, H, P = self.cands[name]
        base = next(v for kk, (jj, v) in orb.items() if jj == 1)
        terms = ' + '.join(f'ζ_{{{P}}}' + (f'^{{{h}}}' if h != 1 else '') for h in H)
        self.add_base(name, terms, base)
        X = name if j == 1 else f'{name}*{j}'
        return self.lin(a, k, X).replace('-', '−')
    def name(self, c):
        z = c.value(); N = c.n
        units = [k for k in range(1, N + 1) if gcd(k, N) == 1]
        conj = {}
        for k in units:
            conj.setdefault(rkey(_gal(c, k).value()), k)
        if len(conj) == 2:
            w = next(_gal(c, k).value() for k in units if rkey(_gal(c, k).value()) != rkey(z))
            sm, pr = round((z + w).real), round((z * w).real)
            D = sm * sm - 4 * pr
            f, d = squarefree_split(D)
            root = cmath.sqrt(d)
            eps = 1 if abs((sm + f * root) / 2 - z) < 1e-6 else -1
            assert abs((sm + eps * f * root) / 2 - z) < 1e-6
            n = abs(d)
            if d % 4 == 1:
                X = f'b{n}'
                a, k = (sm + eps * f) // 2, eps * f
                rad = f'√{d}' if d > 0 else f'i√{n}'
                self.add_base(X, f'(−1 + {rad}) / 2', (-1 + root) / 2)
                # v = a + k b  ==  (a - k) - k b*
                if k % 2 == 0 and a - k // 2 == 0 or k % 2 == 0 and abs(a - k // 2) < abs(a) and abs(a - k // 2) < abs(a - k):
                    Y = (f'r{n}' if d > 0 else ('i' if n == 1 else f'i{n}'))
                    self.add_base(Y, f'√{n}' if d > 0 else ('√−1' if n == 1 else f'i√{n}'), root)
                    self.bases.remove(self.base_by.pop(X)) if X in self.base_by and not self.used.get(X) else None
                    return self.lin(a - k // 2, k // 2, Y).replace('-', '−')
                self.used[X] = True
                a2, k2 = a - k, -k
                if (a2 == 0 and a != 0) or (a != 0 and a2 != 0 and abs(a2) < abs(a)):
                    return self.lin(a2, k2, X + '*').replace('-', '−')
                return self.lin(a, k, X).replace('-', '−')
            X = (f'r{n}' if d > 0 else ('i' if n == 1 else f'i{n}'))
            assert sm % 2 == 0 and f % 2 == 0, (sm, f, d)
            self.add_base(X, f'√{n}' if d > 0 else ('√−1' if n == 1 else f'i√{n}'), root)
            return self.lin(sm // 2, eps * f // 2, X).replace('-', '−')
        best = self.search(c, z)
        if best: return best
        name = None
        if name is None: name = next(self.greek)
        terms = []
        for k, v in sorted(c.c.items()):
            t = f'ζ_{{{N}}}' + (f'^{{{k}}}' if k != 1 else '') if k else '1'
            terms.append((('−' if v < 0 else '+') if terms else ('−' if v < 0 else '')) + ('' if abs(v) == 1 and k else str(abs(v))) + t)
        self.add_base(name, ' '.join(terms).replace('+', ' + ').replace('−', ' − ').strip().replace('  ', ' '), z)
        orb = {}
        for k in units:
            orb.setdefault(rkey(_gal(c, k).value()), k)
        self.orbits.append((name, orb))
        return name

def convert(name, out_id):
    text, cents, pm, irr_raw = parse_mot(name)[:4]
    cents = [as_int(c) for c in cents]
    ncls = len(cents)
    pm = [[as_int(x) for x in m] if m else None for m in pm]
    order = cents[0]
    rows = []
    for row in irr_raw:
        if row and row[0] == 'GALOIS':
            i, k = [as_int(x) for x in row[1]]
            rows.append([_gal(c, k) if isinstance(c, Cyc) else c for c in rows[i - 1]])
        else:
            rows.append([c if isinstance(c, Cyc) else Cyc.int(c) for c in row])
    orders = element_orders(pm, ncls)
    namer, labels, chars, cvals = Namer(), {}, [], []
    for row in rows:
        out, vrow = [], []
        for c in row:
            v = as_int(c)
            z = c.value() if v is None else complex(v)
            if v is None and abs(z.imag) < 1e-9 and abs(z.real - round(z.real)) < 1e-9: v = int(round(z.real))
            if v is not None: out.append(v); vrow.append(complex(v)); continue
            lab = namer.name(c)
            labels[lab] = [round(z.real, 6), round(z.imag, 6)]
            out.append(lab); vrow.append(z)
        chars.append(out); cvals.append(vrow)
    degs = [r[0] for r in chars]
    assert sum(d * d for d in degs) == order, (name, 'sum of squares')
    assert len(chars) == ncls, (name, 'square')
    for o, c in zip(orders, cents): assert c % o == 0, (name, o, c)
    for r in cvals:
        s = sum(abs(x) ** 2 / c for x, c in zip(r, cents))
        assert abs(s - 1) < 1e-6, (name, 'norm', s)
    # labels must reproduce values
    for r, vr in zip(chars, cvals):
        for x, z in zip(r, vr):
            if isinstance(x, str): assert abs(complex(*labels[x]) - z) < 1e-5
    # Frobenius-Schur indicators via the 2-power map
    sq = pm[1]
    ind = []
    for vr in cvals:
        nu = sum(vr[sq[i] - 1] / cents[i] for i in range(ncls))
        r = round(nu.real); assert abs(nu - r) < 1e-6 and r in (-1, 0, 1), (name, nu)
        ind.append({1: '+', 0: 'o', -1: '−'}[r])
    names = class_names(orders)
    primes = [p for p in range(2, 200) if all(p % q for q in range(2, p)) and order % p == 0]
    classes = []
    for i, (n, c) in enumerate(zip(names, cents)):
        pw = [[p, pm[p - 1][i] - 1] for p in primes if orders[i] % p == 0 and pm[p - 1]]
        classes.append({'name': n, 'cent': str(c), 'pw': pw})
    big = lambda x: str(x) if isinstance(x, int) and abs(x) > 2**53 else x
    data = {'id': out_id, 'gap': name, 'order': str(order), 'classes': classes, 'ind': ind,
            'chars': [[big(x) for x in r] for r in chars],
            'labels': labels, 'bases': namer.bases,
            'source': 'GAP Character Table Library (T. Breuer), ATLAS of Finite Groups'}
    js = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    open(f'{OUT}/{out_id}.json', 'w').write(js)
    return ncls, len(js.encode()), len(gzip.compress(js.encode())), max(degs), [b['name'] for b in namer.bases]

GROUPS = [('A5', 'alt5'), ('A6', 'alt6'), ('M11', 'M11'), ('M12', 'M12'), ('J1', 'J1'), ('M22', 'M22'), ('J2', 'J2'),
          ('M23', 'M23'), ("2F4(2)'", 'Tits'), ('HS', 'HS'), ('J3', 'J3'), ('M24', 'M24'), ('McL', 'McL'), ('He', 'He'),
          ('Ru', 'Ru'), ('Suz', 'Suz'), ('ON', 'ON'), ('Co3', 'Co3'), ('Co2', 'Co2'), ('Fi22', 'Fi22'), ('HN', 'HN'),
          ('Ly', 'Ly'), ('Th', 'Th'), ('Fi23', 'Fi23'), ('Co1', 'Co1'), ('J4', 'J4'), ('F3+', 'Fi24'), ('B', 'B'), ('M', 'M')]
if __name__ == '__main__':
    import os; os.makedirs(OUT, exist_ok=True)
    tot = totgz = 0
    for g, i in GROUPS:
        n, sz, gz, maxdeg, bases = convert(g, i)
        tot += sz; totgz += gz
        print(f'{i:6} {n:4} classes  json={sz/1024:7.1f} KB  gzip={gz/1024:6.1f} KB  {" ".join(bases)}')
    print(f'TOTAL json={tot/1024:.0f} KB gzip={totgz/1024:.0f} KB')
