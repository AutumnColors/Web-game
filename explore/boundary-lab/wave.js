'use strict';
/* Boundary Release Lab, part 2: the Wave Engine and the Release Controller.

   Model:   ∂²u/∂t² + γ ∂u/∂t = c² ∇²u      (scalar wave equation; γ = 0 unless damping is switched on)
   Scheme:  second-order leapfrog on a square grid, fixed time step Δt = C Δx / c  (C = Courant number).
            u⁺ = [ 2u − (1 − g) u⁻ + C² (S(u) − D u) ] / (1 + g),   g = γ Δt / 2
            S(u) is the weighted sum of the neighbours, D the sum of the weights that count:
              · a FIXED wall cell (Dirichlet) holds u = 0 and its weight counts;
              · a FREE wall cell (Neumann) is skipped, its weight does not count (no flux through that face).
            The operator D − S is symmetric, so with γ = 0 the scheme conserves the discrete energy
              E = ½ Δx² Σ v² + ½ c² Σ u⁺ (D u − S(u)),   v = (u⁺ − u)/Δt
            to rounding error. energy() returns exactly this quantity.
   Stencils: 'iso9' (weights 4/6 edge, 1/6 corner; isotropic leading error, stable for C ≤ √3/2)
             'five' (the usual 5 points; stable for C ≤ 1/√2; shows the grid's fourfold anisotropy more).
   Release rule: a released obstacle cell becomes an ordinary cell that starts at rest at zero displacement
             (u = u⁻ = 0). Next to a FIXED obstacle the field is already zero there, so the energy does not change.
             Next to a FREE obstacle the field is not zero at the wall, so the release creates a step whose energy
             is real for this model; it is measured and reported as releaseJump, never hidden.
   Outer boundary: 'fixed' (the default: a clamped rim, like a drum), 'reflect' (free), 'periodic', or 'absorb' (an unseen damping layer SPONGE wide
             outside the domain, ending in a fixed wall).
   Domain:   'square' (the frame [-0.5, 0.5]² itself: only D₄), 'disc' (a circle of radius 0.5 inside the frame) or
             'wide' (a circle of radius WIDE, larger than the frame, so the picture is full and the outer wall is
             as round as the obstacle: the default, because a circular experiment should not be boxed in a square).

   No DOM here: the same file runs in the page and in the Node validation script. */
(function(root){
const SPONGE=0.15, WIDE=0.75, TAU=Math.PI*2;
const LIMIT={iso9:Math.sqrt(3)/2, five:Math.SQRT1_2};

const FIELDS=[
  {v:'standing', t:'Standing contours',  s:'A sin(kd + φ), at rest'},
  {v:'inward',   t:'Travelling inward',  s:'A sin(kd + ωt + φ)'},
  {v:'outward',  t:'Travelling outward', s:'A sin(kd − ωt + φ)'},
  {v:'pulse',    t:'Single pulse',       s:'one ring, moving inward'},
  {v:'gauss',    t:'Gaussian pulse',     s:'a bump at one point, at rest'},
  {v:'plane',    t:'Plane waves',        s:'a wave train approaching'}
];
const DEFAULTS={
  field:{kind:'standing', density:12, amp:1, phase:0, follow:'boundary', taper:0.05, dist:0.1, width:0.025, px:0.3, py:0, angle:0},
  phys:{c:1, damping:0, obstacle:'fixed', outer:'fixed', domain:'wide'},
  release:{mode:'instant', duration:0.25},
  num:{N:256, courant:0.5, stencil:'iso9'}
};
const smooth=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };

// displacement and velocity of the chosen initial field at one point. d: distance coordinate (0 on the boundary)
function fieldAt(F,c,x,y,d){
  const k=TAU*F.density, w=c*k, ph=F.phase*Math.PI/180, A=F.amp;
  switch(F.kind){
    case 'inward':  return [A*Math.sin(k*d+ph),  A*w*Math.cos(k*d+ph)];
    case 'outward': return [A*Math.sin(k*d+ph), -A*w*Math.cos(k*d+ph)];
    case 'pulse': { const q=(d-F.dist)/F.width, g=A*Math.exp(-q*q); return [g, -c*2*q/F.width*g]; }            // u = g(d + ct)
    case 'gauss': { const q2=((x-F.px)*(x-F.px)+(y-F.py)*(y-F.py))/(4*F.width*F.width); return [A*Math.exp(-q2), 0]; }   // e-folding radius 2·width
    case 'plane': { const a=F.angle*Math.PI/180, s=x*Math.cos(a)+y*Math.sin(a), del=0.03, z=(s+0.36)/del;   // u = f(s − ct), front at s = −0.36
      const env=0.5*(1-Math.tanh(z)), ch=Math.cosh(Math.min(20,Math.abs(z))), denv=-0.5/(ch*ch*del);
      return [A*Math.sin(k*s+ph)*env, -c*A*(k*Math.cos(k*s+ph)*env+Math.sin(k*s+ph)*denv)]; }
    case 'custom': return F.fn(x,y,d);                 // a user-defined field: fn(x, y, d) → [u, v]
    default: return [A*Math.sin(k*d+ph), 0];
  }
}

function Sim(cfg,geom){
  this.cfg={field:Object.assign({},DEFAULTS.field,cfg.field), phys:Object.assign({},DEFAULTS.phys,cfg.phys),
            release:Object.assign({},DEFAULTS.release,cfg.release), num:Object.assign({},DEFAULTS.num,cfg.num)};
  this.geom=geom;
  const P=this.cfg.phys, Q=this.cfg.num, N=this.N=Q.N;
  this.disc=P.domain!=='square'; this.Rd=P.domain==='wide'?WIDE:0.5;      // radius of a circular domain
  this.outer=(this.disc&&P.outer==='periodic')?'reflect':P.outer;
  this.pad=(this.disc?Math.ceil((this.Rd-0.5)*N):0)+(this.outer==='absorb'?Math.ceil(SPONGE*N):0)+1;
  const M=this.M=N+2*this.pad, n=M*M;
  this.dx=1/N; this.c=P.c;
  this.iso=Q.stencil!=='five';
  this.courant=Math.min(Q.courant,0.95*LIMIT[this.iso?'iso9':'five']);     // never run at or above the stability limit
  this.dt=this.courant*this.dx/this.c; this.C2=this.courant*this.courant;
  this.u=new Float64Array(n); this.up=new Float64Array(n); this.un=new Float64Array(n);
  this.kind=new Uint8Array(n);      // 0 ordinary cell · 1 fixed wall · 2 free wall · 3 periodic ghost
  this.obst=new Uint8Array(n);      // 1 while the cell belongs to the obstacle
  this.sd=new Float32Array(n);      // signed distance to the obstacle boundary
  this.gam=new Float64Array(n);     // damping γ per cell (global damping + absorbing layer)
  this.D=new Float64Array(n); this.A=new Float64Array(n); this.B=new Float64Array(n);
  // radial profile: bins a third of a cell wide, every cell shared between its two nearest bins
  this.nb=3*(N>>1); this.rbin=new Uint16Array(n); this.rfrac=new Float32Array(n);
  this.rs=new Float64Array(this.nb); this.rw=new Float64Array(this.nb); this.rm=new Float64Array(this.nb);
  this.reset();
}
Sim.prototype={
  // coordinates of cell centre (i, j); y grows with j
  X(i){ return (i-this.pad+0.5)*this.dx-0.5; },

  reset(){
    const {M,N,pad,dx,geom}=this, F=this.cfg.field, P=this.cfg.phys, abs=this.outer==='absorb', per=this.outer==='periodic';
    const wallOut=this.outer==='reflect'?2:1, wallObs=P.obstacle==='free'?2:1, gmax=20.7*this.c/SPONGE;
    const u=this.u, v=this.un, R0=geom.params.size, gx=geom.centre[0], gy=geom.centre[1];
    u.fill(0); this.up.fill(0); v.fill(0); this.obst.fill(0); this.rw.fill(0);
    const list=[]; let depth=0;
    for(let j=0;j<M;j++){ const y=this.X(j);
      for(let i=0;i<M;i++){ const x=this.X(i), q=j*M+i, r=Math.hypot(x,y), e=this.disc?r-this.Rd:Math.max(Math.abs(x),Math.abs(y))-0.5;
        const sd=geom.sdf(x,y); this.sd[q]=sd; this.gam[q]=P.damping; this.rbin[q]=65535;
        let kd=0;
        if(i===0||j===0||i===M-1||j===M-1) kd=per?3:wallOut;
        else if(e>0){ if(abs&&e<SPONGE) this.gam[q]+=gmax*(e/SPONGE)*(e/SPONGE); else kd=wallOut; }   // beyond the absorbing layer: wall
        else {
          if(r<0.5){ const p=Math.max(0,3*r/dx-0.5); let b=Math.floor(p), f=p-b; if(b>this.nb-2){ b=this.nb-2; f=1; }
            this.rbin[q]=b; this.rfrac[q]=f; this.rw[b]+=1-f; this.rw[b+1]+=f; }
          if(sd<0){ kd=wallObs; this.obst[q]=1; list.push(q); if(-sd>depth) depth=-sd; }
        }
        this.kind[q]=kd;
        if(kd===0 && e<=0){
          const d=F.follow==='radial'?Math.hypot(x-gx,y-gy)-R0:sd, w=geom.initialField?[F.amp*geom.initialField(x,y,sd),0]:fieldAt(F,this.c,x,y,d), env=F.taper>0?smooth(0,F.taper,-e):1;
          u[q]=w[0]*env; v[q]=w[1]*env;
        }
      } }
    list.sort((a,b)=>this.sd[b]-this.sd[a]);            // outermost obstacle cells first, for a gradual release
    this.obstList=Int32Array.from(list); this.obstPtr=0; this.depth=depth;
    this.hasObstacle=list.length>0; this.released=!this.hasObstacle; this.releasing=false; this.relT0=0; this.releaseT=null; this.releaseJump=0;
    this.t=0; this.steps=0;
    this.coef();
    // second-order start: u(−Δt) = u − Δt v + ½ C² (S(u) − D u)
    if(per) this.sync(u);
    const up=this.up, C2=this.C2, dt=this.dt;
    for(let j=1;j<M-1;j++) for(let q=j*M+1,end=j*M+M-1;q<end;q++){
      if(this.A[q]===0){ up[q]=0; continue; }
      up[q]=u[q]-dt*v[q]+0.5*C2*(this.S(u,q)-this.D[q]*u[q]);
    }
    if(per) this.sync(up);
    this.un.fill(0);
    this.E0=this.energy().total;
  },

  // neighbour sum at cell q
  S(a,q){ const M=this.M;
    return this.iso ? (4*(a[q-1]+a[q+1]+a[q-M]+a[q+M])+a[q-M-1]+a[q-M+1]+a[q+M-1]+a[q+M+1])/6 : a[q-1]+a[q+1]+a[q-M]+a[q+M]; },

  // coefficients of the update for the present walls; called again whenever cells are released
  coef(){
    const {M,kind,D,A,B,gam}=this, wa=this.iso?4/6:1, wb=this.iso?1/6:0, g2=this.dt/2;
    for(let j=1;j<M-1;j++) for(let q=j*M+1,end=j*M+M-1;q<end;q++){
      if(kind[q]!==0){ D[q]=0; A[q]=0; B[q]=0; continue; }
      let d=0;
      if(kind[q-1]!==2) d+=wa; if(kind[q+1]!==2) d+=wa; if(kind[q-M]!==2) d+=wa; if(kind[q+M]!==2) d+=wa;
      if(wb){ if(kind[q-M-1]!==2) d+=wb; if(kind[q-M+1]!==2) d+=wb; if(kind[q+M-1]!==2) d+=wb; if(kind[q+M+1]!==2) d+=wb; }
      const g=gam[q]*g2; D[q]=d; A[q]=1/(1+g); B[q]=1-g;
    }
  },

  // periodic outer boundary: the ghost ring copies the opposite side
  sync(a){ const M=this.M;
    for(let i=1;i<M-1;i++){ a[i]=a[(M-2)*M+i]; a[(M-1)*M+i]=a[M+i]; }
    for(let j=0;j<M;j++){ a[j*M]=a[j*M+M-2]; a[j*M+M-1]=a[j*M+1]; } },

  step(n){
    n=n||1;
    const M=this.M, C2=this.C2, D=this.D, A=this.A, B=this.B, per=this.outer==='periodic', iso=this.iso;
    for(let s=0;s<n;s++){
      if(this.releasing) this.advanceRelease();
      const u=this.u, up=this.up, un=this.un;
      if(per) this.sync(u);
      if(iso){
        for(let j=1;j<M-1;j++) for(let q=j*M+1,end=j*M+M-1;q<end;q++){
          const a=A[q]; if(a===0){ un[q]=0; continue; }
          const uc=u[q], S=(4*(u[q-1]+u[q+1]+u[q-M]+u[q+M])+u[q-M-1]+u[q-M+1]+u[q+M-1]+u[q+M+1])/6;
          un[q]=(2*uc-B[q]*up[q]+C2*(S-D[q]*uc))*a;
        }
      } else {
        for(let j=1;j<M-1;j++) for(let q=j*M+1,end=j*M+M-1;q<end;q++){
          const a=A[q]; if(a===0){ un[q]=0; continue; }
          const uc=u[q];
          un[q]=(2*uc-B[q]*up[q]+C2*(u[q-1]+u[q+1]+u[q-M]+u[q+M]-D[q]*uc))*a;
        }
      }
      this.up=u; this.u=un; this.un=up;
      this.steps++; this.t=this.steps*this.dt;
    }
  },

  /* ---------- Release Controller ---------- */
  release(){
    if(this.released||this.releasing||this.cfg.release.mode==='none') return false;
    this.releaseT=this.t;
    if(this.cfg.release.mode==='gradual' && this.cfg.release.duration>0){ this.releasing=true; this.relT0=this.t; }
    else this.free(Infinity);
    return true;
  },
  advanceRelease(){
    const p=(this.t-this.relT0)/this.cfg.release.duration;
    this.free(p>=1?Infinity:p*this.depth);       // the boundary recedes inward at a constant rate
  },
  // release every obstacle cell shallower than `depth` (distance inside the boundary)
  free(depth){
    const L=this.obstList, sd=this.sd; let k=this.obstPtr; const k0=k;
    while(k<L.length && -sd[L[k]]<depth) k++;
    if(k===k0){ if(depth===Infinity){ this.releasing=false; this.released=true; } return; }
    const before=this.energy().total;
    for(let m=k0;m<k;m++){ const q=L[m]; this.kind[q]=0; this.obst[q]=0; this.u[q]=0; this.up[q]=0; }   // the documented rule: at rest, zero displacement
    this.obstPtr=k; this.coef();
    this.releaseJump+=this.energy().total-before;
    if(k>=L.length){ this.releasing=false; this.released=true; }
  },

  /* ---------- measurements ---------- */
  energy(){
    const M=this.M, u=this.u, up=this.up, D=this.D, A=this.A, idt=1/this.dt; let kin=0, pot=0;
    if(this.outer==='periodic') this.sync(up);
    for(let j=1;j<M-1;j++) for(let q=j*M+1,end=j*M+M-1;q<end;q++){
      if(A[q]===0) continue;
      const v=(u[q]-up[q])*idt; kin+=v*v; pot+=u[q]*(D[q]*up[q]-this.S(up,q));
    }
    kin*=0.5*this.dx*this.dx; pot*=0.5*this.c*this.c;
    return {kin, pot, total:kin+pot};
  },
  // displacement at the centre of the domain (the mean of the four cells that share that corner)
  centre(){ const M=this.M, q=(this.pad+this.N/2-1)*M+this.pad+this.N/2-1, u=this.u; return (u[q]+u[q+1]+u[q+M]+u[q+M+1])/4; },
  centreVelocity(){ const M=this.M, q=(this.pad+this.N/2-1)*M+this.pad+this.N/2-1, u=this.u, p=this.up;
    return (u[q]+u[q+1]+u[q+M]+u[q+M+1]-p[q]-p[q+1]-p[q+M]-p[q+M+1])/(4*this.dt); },
  // value at any point of the domain (bilinear between cell centres)
  at(x,y){ const M=this.M, gx=(x+0.5)*this.N+this.pad-0.5, gy=(y+0.5)*this.N+this.pad-0.5;
    const i=Math.max(0,Math.min(M-2,Math.floor(gx))), j=Math.max(0,Math.min(M-2,Math.floor(gy))), fx=gx-i, fy=gy-j, q=j*M+i, u=this.u;
    return (u[q]*(1-fx)+u[q+1]*fx)*(1-fy)+(u[q+M]*(1-fx)+u[q+M+1]*fx)*fy; },
  // Mean of u over each circle about the centre of the domain, r < 0.5 → out[0 … nb−1], bin b at r = (b + ½) Δx/3.
  // Returns the departure from radial symmetry: rms of (u − its angular mean) / rms of u, between 0 and 1.
  radial(out){
    const n=this.M*this.M, u=this.u, rb=this.rbin, rf=this.rfrac, s=this.rs, w=this.rw, m=this.rm, nb=this.nb;
    s.fill(0);
    for(let q=0;q<n;q++){ const b=rb[q]; if(b===65535) continue; const f=rf[q], v=u[q]; s[b]+=v*(1-f); s[b+1]+=v*f; }
    let last=0; for(let b=nb-1;b>=0;b--){ if(w[b]>1e-9) last=s[b]/w[b]; m[b]=last; }
    if(out) for(let b=0;b<nb;b++) out[b]=m[b];
    let dev=0, tot=0;
    for(let q=0;q<n;q++){ const b=rb[q]; if(b===65535) continue; const f=rf[q], v=u[q], d=v-(m[b]*(1-f)+m[b+1]*f); dev+=d*d; tot+=v*v; }
    return tot>1e-300?Math.sqrt(dev/tot):0;
  },
  // u along the ray from the centre towards +x, at the same radii as radial()
  ray(out){ const n=this.nb; for(let b=0;b<n;b++) out[b]=this.at((b+0.5)*this.dx/3,0); },
  // Mean displacement and mean velocity over the ordinary cells. When no wall is fixed (free or periodic edges
  // and no fixed obstacle) nothing holds the sheet: the mean then moves at a constant rate. That drift belongs to
  // the model, it is not an instability, and it is why it is measured.
  mean(){ const u=this.u, up=this.up, A=this.A; let s=0, v=0, n=0;
    for(let q=0;q<u.length;q++){ if(A[q]===0) continue; s+=u[q]; v+=u[q]-up[q]; n++; }
    return n?[s/n,v/n/this.dt]:[0,0]; },
  maxAbs(){ const u=this.u; let m=0; for(let q=0;q<u.length;q++){ const a=u[q]<0?-u[q]:u[q]; if(a>m) m=a; } return m; },

  // Which of the square grid's 8 symmetries leave the present state (walls, u and u⁻) unchanged?
  // This is the symmetry of the whole discrete experiment, which can be smaller than the obstacle's own group.
  gridSymmetry(){
    const M=this.M, u=this.u, up=this.up, kind=this.kind, L=M-1, tol=1e-9*Math.max(1,this.cfg.field.amp);
    const maps=[null,(i,j)=>(L-j)*M+L-i,(i,j)=>j*M+L-i,(i,j)=>(L-j)*M+i,(i,j)=>i*M+j,(i,j)=>(L-i)*M+L-j,(i,j)=>i*M+L-j,(i,j)=>(L-i)*M+j];
    const names=['identity','rotation 180°','mirror x → −x','mirror y → −y','mirror in y = x','mirror in y = −x','rotation 90°','rotation 270°'];
    const kept=[true];
    for(let m=1;m<8;m++){ const f=maps[m]; let ok=true;
      for(let j=0;j<M&&ok;j++) for(let i=0;i<M;i++){ const a=j*M+i, b=f(i,j);
        if(kind[a]!==kind[b] || Math.abs(u[a]-u[b])>tol || Math.abs(up[a]-up[b])>tol){ ok=false; break; } }
      kept.push(ok); }
    const order=kept.filter(Boolean).length, ax=kept[2]&&kept[3], dg=kept[4]&&kept[5];
    let group;
    if(order===8) group='D₄';
    else if(order===4) group=kept[6]?'C₄':ax?'D₂ (mirrors on the axes)':'D₂ (mirrors on the diagonals)';
    else if(order===2) group=kept[1]?'C₂':'D₁ (one mirror)';
    else group='trivial';
    return {group, order, kept:names.filter((_,m)=>kept[m])};
  }
};

const api={Sim, FIELDS, DEFAULTS, SPONGE, WIDE, LIMIT, fieldAt};
root.BRLWave=api;
if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
