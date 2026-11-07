// Groups registry: viewers for single groups and families of groups, shown as Explore › Groups on the landing page.
// The pages themselves live in explore/. To add one: create explore/name/index.html, then add an entry here.
window.GROUPS = [
  {
    id: 'simple-groups',
    badge: 'FSG',
    title: 'Periodic table of finite simple groups',
    path: 'explore/simple-groups/',
    desc: '18 infinite families and 26 sporadic groups. Exact orders, factorizations, a lookup for any order, and character tables up to the Monster.'
  },
  {
    id: 'nonsimple',
    badge: 'D₄',
    title: 'Non-simple groups',
    path: 'explore/nonsimple/',
    desc: 'Fourteen groups from C₄ to SL(2,3) as moving solids, mirrors and maps of Z/5. Pick a subgroup, see its cosets color the multiplication table, collapse to G/H, and find where each group splits.'
  },
  {
    id: 'an-lab',
    badge: 'Aₙ',
    title: 'Aₙ(q) Lab',
    path: 'explore/an-lab/',
    desc: 'The linear groups PSL(n+1, q). Orders from the Dynkin diagram, the group moving its projective space, and a brute-force element census that tells the 20,160 twins apart.'
  },
  {
    id: 'a5',
    badge: 'A5',
    title: 'A₅ viewer',
    path: 'explore/a5/',
    desc: 'The dodecahedron\'s 60 rotations, its five hidden cubes and the icosahedron\'s 20 faces. Count what stays fixed and build the character table.'
  },
  {
    id: 'm11',
    badge: 'M11',
    title: 'M11 symmetry',
    path: 'explore/m11/',
    desc: '11 points, 66 blocks, 7920 symmetries. Move any 4 points anywhere.'
  },
  {
    id: 'm11-tree',
    badge: '7920',
    title: 'M11 Discovery Tree',
    path: 'explore/m11-tree/',
    desc: 'All 7,920 elements of M11 in one tree, 28 levels deep. Blue and gold edges, pan and zoom, jump to any node.'
  },
  {
    id: 'golay',
    badge: 'MOG',
    title: 'Golay MOG Lab',
    path: 'explore/golay/',
    desc: 'The binary Golay code on the Miracle Octad Generator. Complete octads, colour sextets, decode noisy messages, and build the code and M24 from a generator matrix and two permutations.'
  },
  {
    id: 'm24',
    badge: 'M₂₄',
    title: 'M₂₄ viewer',
    path: 'explore/m24/',
    desc: '24 points, four moves, 244,823,040 symmetries. Count the points, octads, sextets and trios each element fixes, and peel the counts into the character table.'
  },
  {
    id: 'j1',
    badge: 'J1',
    title: 'J1 viewer',
    path: 'explore/j1/',
    desc: 'The Livingstone graph: 266 vertices, 1,463 edges, valency 11, built from the Janko group J1. Spin, re-root and apply random symmetries.'
  }
];
