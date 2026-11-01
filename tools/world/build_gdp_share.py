#!/usr/bin/env python3
"""Build world/layers/gdp-share.json: each country's share of world GDP, one frame per decade.

    pip install pandas openpyxl
    python3 tools/world/build_gdp_share.py

Sources (in tools/world/sources/, not committed; download them first)
  mpd2023_web.xlsx            Maddison Project Database 2023 (Bolt & van Zanden), sheet "Full data":
                              GDP per capita in 2011 international dollars (PPP) and population, to 2022.
                              https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023
  API_NY.GDP.PCAP.PP.KD.csv   World Bank GDP per capita, PPP (constant 2021 intl $), bulk CSV
  API_SP.POP.TOTL.csv         World Bank population, bulk CSV

GDP = GDP per capita x population. World GDP for a year = the sum over every country with data
that year. Frames after 2022 extend Maddison with World Bank real growth (GDP per capita PPP in
constant prices x population), up to the latest year the World Bank has for that country, after
which GDP per capita is held flat. Countries with no World Bank PPP series keep their 2022 GDP per
capita and only grow with population. Each such case gets a note in the layer.

The Soviet Union, Yugoslavia and Czechoslovakia are single entries before they split up (the layer's
`groups`); afterwards their successor states are counted separately. Maddison's figures for the
successors before the split are not used, so nothing is counted twice.
"""
import csv, json, os
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'sources')
OUT = os.path.join(ROOT, 'world', 'layers', 'gdp-share.json')

YEARS = [1955, 1965, 1975, 1985, 1995, 2005, 2015, 2025]
MPD_LAST = 2022

GROUPS = {  # entity: name, members, first year the members count on their own
    'SUN': ('Soviet Union', ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE',
                             'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], 1992),
    'YUG': ('Yugoslavia', ['SVN', 'HRV', 'BIH', 'SRB', 'MNE', 'MKD', 'XKX'], 1992),
    'CSK': ('Czechoslovakia', ['CZE', 'SVK'], 1993),
}
MEMBER = {m: g for g, (_, ms, _) in GROUPS.items() for m in ms}

countries = json.load(open(os.path.join(ROOT, 'world', 'countries.json'), encoding='utf-8'))
KNOWN = set(countries['names'])


def wb(path):
    lines = open(path, encoding='utf-8-sig').read().splitlines()
    s = next(i for i, l in enumerate(lines) if l.startswith('"Country Name"'))
    rows = list(csv.reader(lines[s:]))
    yi = {int(h): i for i, h in enumerate(rows[0]) if h.isdigit()}
    return {r[1]: {y: float(r[i]) for y, i in yi.items() if i < len(r) and r[i].strip()} for r in rows[1:]}


def main():
    mpd = pd.read_excel(os.path.join(SRC, 'mpd2023_web.xlsx'), 'Full data')
    mpd = mpd[mpd.year >= 1950].dropna(subset=['gdppc', 'pop'])
    gdp = {}  # (iso, year) -> GDP in 2011 intl $
    pop = {}  # (iso, year) -> people
    for r in mpd.itertuples():
        gdp[(r.countrycode, int(r.year))] = r.gdppc * r.pop * 1000
        pop[(r.countrycode, int(r.year))] = r.pop * 1000

    ppc = wb(os.path.join(SRC, 'API_NY.GDP.PCAP.PP.KD.csv'))
    wpop = wb(os.path.join(SRC, 'API_SP.POP.TOTL.csv'))
    notes = {}
    for y in [y for y in YEARS if y > MPD_LAST]:
        for iso in {k for k, _ in gdp}:
            if (iso, MPD_LAST) not in gdp or iso in GROUPS:
                continue
            p0, p1 = wpop.get(iso, {}).get(MPD_LAST), wpop.get(iso, {}).get(y)
            popg = p1 / p0 if p0 and p1 else 1.0
            series = ppc.get(iso, {})
            g0 = series.get(MPD_LAST)
            last = max((yy for yy in series if MPD_LAST < yy <= y), default=None)
            if g0 and last:
                gdp[(iso, y)] = gdp[(iso, MPD_LAST)] * popg * series[last] / g0
                if last < y:
                    notes[iso] = (f'{y} is estimated: World Bank growth to {last}, '
                                  f'then GDP per person held at its {last} level.')
            else:
                gdp[(iso, y)] = gdp[(iso, MPD_LAST)] * popg
                notes[iso] = (f'{y} is estimated from 2022: no World Bank growth figures, '
                              'so GDP per person is held at its 2022 level.')
            pop[(iso, y)] = pop[(iso, MPD_LAST)] * popg

    def active(iso, y):
        if iso in GROUPS:
            return y < GROUPS[iso][2]
        if iso in MEMBER:
            return y >= GROUPS[MEMBER[iso]][2]
        return True

    entities = sorted({k for k, _ in gdp})
    world = {y: sum(gdp[(e, y)] for e in entities if (e, y) in gdp and active(e, y)) for y in YEARS}
    wpopsum = {y: sum(pop[(e, y)] for e in entities if (e, y) in pop and active(e, y)) for y in YEARS}

    def r_share(x):
        return round(x, 3) if x < 1 else round(x, 2)

    data, skipped = {}, []
    for e in entities:
        if e not in KNOWN and e not in GROUPS:
            skipped.append(e)
            continue
        rec = {'share': [], 'pop_share': [], 'gdp': [], 'pop': []}
        for y in YEARS:
            ok = (e, y) in gdp and active(e, y)
            rec['share'].append(r_share(gdp[(e, y)] / world[y] * 100) if ok else None)
            rec['pop_share'].append(r_share(pop[(e, y)] / wpopsum[y] * 100) if ok else None)
            rec['gdp'].append(round(gdp[(e, y)] / 1e9) if ok else None)
            rec['pop'].append((round(pop[(e, y)] / 1e6, 1) if pop[(e, y)] >= 1e6 else round(pop[(e, y)] / 1e6, 2)) if ok else None)
        if all(v is None for v in rec['share']):
            continue
        if e in notes:
            rec['note'] = notes[e]
        data[e] = rec
    data['DEU']['note'] = 'Germany within today\'s borders: East and West Germany combined before 1990.'

    layer = {
        'id': 'gdp-share',
        'title': 'Share of world GDP',
        'badge': '%',
        'kind': 'choropleth',
        'time': {'years': YEARS, 'default': YEARS[-1], 'label': 'Decade'},
        'about': ('Each country\'s slice of the world economy: its GDP as a percent of the sum of all '
                  'countries\' GDP that year. GDP is measured in purchasing-power dollars (2011 international $), '
                  'so a dollar buys the same amount everywhere. Population share is shown for comparison: '
                  'a country with a bigger GDP share than population share is richer than the world average. '
                  'Move the slider or press play to watch 70 years of change. '
                  'The Soviet Union, Yugoslavia and Czechoslovakia count as one country until they split. '
                  '2025 extends the 2022 Maddison figures with World Bank growth rates.'),
        'source': {
            'name': 'Maddison Project Database 2023 (to 2022) and World Bank WDI (2025)',
            'url': 'https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2023'
        },
        'groups': {g: {'name': n, 'members': [m for m in ms if m in KNOWN], 'until': u}
                   for g, (n, ms, u) in GROUPS.items()},
        'fields': [
            {'key': 'share', 'label': 'GDP share', 'unit': '%', 'format': 'share', 'primary': True,
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]}},
            {'key': 'pop_share', 'label': 'Population share', 'unit': '%', 'format': 'share',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]}},
            {'key': 'gdp', 'label': 'GDP', 'unit': 'bn intl $', 'format': 'billions',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [5, 10, 25, 50, 100, 250, 1000, 5000]}},
            {'key': 'pop', 'label': 'Population', 'unit': 'million', 'format': 'decimal',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [1, 2.5, 5, 10, 25, 50, 100, 500]}}
        ],
        'data': data
    }
    # One country per line, so diffs between rebuilds stay readable.
    head = {k: v for k, v in layer.items() if k != 'data'}
    c = dict(ensure_ascii=False, separators=(',', ':'))
    rows = ',\n'.join(f'{json.dumps(k, **c)}:{json.dumps(v, **c)}' for k, v in layer['data'].items())
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(json.dumps(head, **c)[:-1] + ',"data":{\n' + rows + '\n}}\n')
    print('gdp-share', len(data), 'entries; not on the map:', skipped)
    for y in YEARS:
        top = sorted(((v['share'][YEARS.index(y)] or 0, k) for k, v in data.items()), reverse=True)[:5]
        print(y, f'world {world[y]/1e12:.1f}T', [(k, s) for s, k in top])


if __name__ == '__main__':
    main()
