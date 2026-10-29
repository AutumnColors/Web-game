// Level registry. To add a level: create levels/NN-name/index.html, then add an entry here.
window.LEVELS = [
  {
    id: 'smiley-paths',
    title: 'Smiley Paths',
    path: 'levels/01-smiley-paths/',
    desc: 'Find every hidden path. Shared bricks carry several faces.'
  },
  {
    id: 'vector-pairs',
    title: 'Vector Pairs',
    path: 'levels/02-vector-pairs/',
    desc: 'Pair tiles that differ in all four coordinates.'
  },
  {
    id: 'path-to-zero',
    title: 'Path to Zero',
    path: 'levels/03-path-to-zero/',
    desc: 'Trace each star edge back to the root. 20 paths.'
  },
  {
    id: 'counting-strokes',
    title: 'Counting Strokes',
    path: 'levels/04-counting-strokes/',
    desc: 'Stroke N is N steps. Hug old lines, eat apples, dodge bombs.'
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    path: 'levels/05-minesweeper/',
    desc: 'Classic 16×16 field, then a round one. More rule-bending levels to come.'
  }
];
