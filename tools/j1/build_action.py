import numpy as np, random, json, math
from sympy.combinatorics import Permutation, PermutationGroup
p=11
Y=np.roll(np.eye(7,dtype=np.int64),1,axis=1)
Z=np.array([[-3,2,-1,-1,-3,-1,-3],[-2,1,1,3,1,3,3],[-1,-1,-3,-1,-3,-3,2],[-1,-3,-1,-3,-3,2,-1],[-3,-1,-3,-3,2,-1,-1],[1,3,3,-2,1,1,3],[3,3,-2,1,1,3,1]])%p
def norm(v):
    v=v%p; nz=np.nonzero(v)[0][0]; inv=pow(int(v[nz]),-1,p); return tuple(int(x) for x in (v*inv)%p)
def orbit(v,limit=3000):
    s={norm(v):0};lst=[norm(v)];i=0
    while i<len(lst):
        a=np.array(lst[i]);i+=1
        for g in (Y,Z):
            u=norm(g@a)
            if u not in s:
                s[u]=len(lst);lst.append(u)
                if len(lst)>limit:return None
    return lst,s
random.seed(3)
while True:
    v=np.array([random.randrange(p) for _ in range(7)])
    if not v.any():continue
    r=orbit(v)
    if r and len(r[0])==1540:break
lst,idx=r;N=1540
gy=np.array([idx[norm(Y@np.array(w))] for w in lst]);gz=np.array([idx[norm(Z@np.array(w))] for w in lst])
G=PermutationGroup([Permutation(gy.tolist()),Permutation(gz.tolist())])
print("order",G.order())
def mul(a,b): return b[a]  # apply a then b
def cyc_order(a):
    seen=np.zeros(N,bool);L=1
    for i in range(N):
        if not seen[i]:
            j=i;c=0
            while not seen[j]:seen[j]=True;j=a[j];c+=1
            L=L*c//math.gcd(L,c)
    return L
def power(a,k):
    r=np.arange(N);b=a.copy()
    while k:
        if k&1:r=mul(r,b)
        b=mul(b,b);k>>=1
    return r
def rnd():
    a=np.arange(N)
    for _ in range(40):a=mul(a,random.choice([gy,gz]))
    return a
def elt_of_order(q):
    while True:
        a=rnd();o=cyc_order(a)
        if o%q==0:return power(a,o//q)
H=None
for t in range(400):
    a=elt_of_order(2);b=elt_of_order(3)
    if cyc_order(mul(a,b))!=11:continue
    Hg=PermutationGroup([Permutation(a.tolist()),Permutation(b.tolist())])
    o=Hg.order()
    if o==660:H=(a,b);print("found PSL(2,11) at",t);break
a,b=H
# orbit partition of H on 1540 points
def partition(a,b):
    parent=list(range(N))
    def f(x):
        while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
        return x
    for P in (a,b):
        for i in range(N):
            ri,rj=f(i),f(int(P[i]))
            if ri!=rj:parent[rj]=ri
    groups={}
    for i in range(N):groups.setdefault(f(i),[]).append(i)
    return frozenset(frozenset(g) for g in groups.values())
P0=partition(a,b)
print("H orbit sizes",sorted(len(g) for g in P0))
def img(Pt,g): return frozenset(frozenset(int(g[x]) for x in blk) for blk in Pt)
pts=[P0];pidx={P0:0};i=0
while i<len(pts):
    for g in (gy,gz):
        q=img(pts[i],g)
        if q not in pidx:pidx[q]=len(pts);pts.append(q)
    i+=1
print("points",len(pts))
M=len(pts)
perm=[[pidx[img(pt,g)] for pt in pts] for g in (gy,gz)]
json.dump(perm,open('gens266.json','w'))
