#!/usr/bin/env python3
"""Rebuild the data layers in world/layers/ from the source files in tools/world/sources/.

    python3 tools/world/build_layers.py

Sources (in tools/world/sources/; the two World Bank files are not committed, download them first)
  API_NY.GDP.PCAP.PP.KD.csv   World Bank WDI bulk CSV, GDP per capita PPP (constant 2021 intl $)
  API_NY.GDP.PCAP.CD.csv      World Bank WDI bulk CSV, GDP per capita (current US$)
      Download fresh copies from https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.KD
      and .../NY.GDP.PCAP.CD ("Download CSV"), unzip, and replace these files.
  who_alcohol_2019.csv        WHO Global status report on alcohol and health (2024),
      table of 2019 consumption per adult (15+), as published on Wikipedia's
      "List of countries by alcohol consumption per capita". "<0.1" is kept as text.

Only countries listed in world/countries.json are written; World Bank aggregates
(regions, income groups) are dropped that way.
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'sources')
OUT = os.path.join(ROOT, 'world', 'layers')

countries = json.load(open(os.path.join(ROOT, 'world', 'countries.json'), encoding='utf-8'))
KNOWN = set(countries['names'])


def wb_world(path):
    with open(path, encoding='utf-8-sig') as f:
        for r in csv.reader(f):
            if len(r) > 4 and r[1] == 'WLD':
                vals = [(i, v) for i, v in enumerate(r) if i >= 4 and v.strip()]
                return float(vals[-1][1]) if vals else None
    return None


def wb_series(path):
    """{iso3: {year: value}} from a World Bank bulk CSV; also returns its 'Last Updated Date'."""
    with open(path, encoding='utf-8-sig') as f:
        lines = f.read().splitlines()
    updated = next((l.split(',')[1].strip('"') for l in lines[:4] if l.startswith('"Last Updated Date"')), '')
    start = next(i for i, l in enumerate(lines) if l.startswith('"Country Name"'))
    rows = list(csv.reader(lines[start:]))
    header = rows[0]
    years = [(i, int(h)) for i, h in enumerate(header) if h.isdigit()]
    out = {}
    for r in rows[1:]:
        if len(r) < 4 or r[1] not in KNOWN:
            continue
        out[r[1]] = {y: float(r[i]) for i, y in years if i < len(r) and r[i].strip()}
    return out, updated


def latest(series):
    if not series:
        return None, None
    y = max(series)
    return y, series[y]


def gdp_layer():
    ppp, upd_ppp = wb_series(os.path.join(SRC, 'API_NY.GDP.PCAP.PP.KD.csv'))
    nom, upd_nom = wb_series(os.path.join(SRC, 'API_NY.GDP.PCAP.CD.csv'))
    data = {}
    years = []
    for iso in sorted(set(ppp) | set(nom)):
        rec = {}
        y, v = latest(ppp.get(iso))
        if v is not None:
            rec['ppp'] = round(v)
            rec['ppp_year'] = y
            years.append(y)
            back = ppp[iso].get(y - 10)
            if back:
                rec['real_change_10y'] = round((v / back - 1) * 100, 1)
        y2, v2 = latest(nom.get(iso))
        if v2 is not None:
            rec['nominal'] = round(v2)
            rec['nominal_year'] = y2
        notes = []
        if 'ppp_year' in rec and 'nominal_year' in rec and rec['ppp_year'] != rec['nominal_year']:
            notes.append(f"PPP figure is for {rec['ppp_year']}, nominal for {rec['nominal_year']}.")
        if 'ppp' not in rec:
            notes.append('No PPP estimate from the World Bank.')
        if notes:
            rec['note'] = ' '.join(notes)
        if 'ppp' in rec or 'nominal' in rec:
            data[iso] = rec
    main_year = max(set(years), key=years.count)
    return {
        'id': 'gdp-per-capita',
        'title': 'GDP per capita',
        'badge': '$',
        'kind': 'choropleth',
        'year': main_year,
        'about': ('Economic output per person per year. The default view uses purchasing power parity (PPP): '
                  'dollars adjusted for what money buys locally, in constant 2021 international dollars, '
                  'so countries and years compare fairly. Nominal US dollars show raw market value instead; '
                  'the gap between the two is mostly the local price level. '
                  'The 10-year change is real growth per person (PPP, inflation removed). '
                  f'Latest year available per country, mostly {main_year}.'),
        'source': {
            'name': f'World Bank, World Development Indicators (updated {upd_ppp or upd_nom})',
            'url': 'https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.KD',
            'indicators': ['NY.GDP.PCAP.PP.KD', 'NY.GDP.PCAP.CD']
        },
        'reference': {'label': 'World', 'values': {
            'ppp': round(wb_world(os.path.join(SRC, 'API_NY.GDP.PCAP.PP.KD.csv'))),
            'nominal': round(wb_world(os.path.join(SRC, 'API_NY.GDP.PCAP.CD.csv')))}},
        'fields': [
            {'key': 'ppp', 'label': 'PPP', 'unit': 'intl $', 'format': 'money', 'primary': True,
             'yearKey': 'ppp_year',
             'scale': {'type': 'log', 'palette': 'teal', 'bins': [2000, 5000, 10000, 20000, 40000, 80000]}},
            {'key': 'nominal', 'label': 'Nominal', 'unit': 'US$', 'format': 'money', 'yearKey': 'nominal_year',
             'scale': {'type': 'log', 'palette': 'blue', 'bins': [1000, 2500, 5000, 10000, 25000, 50000]}},
            {'key': 'real_change_10y', 'label': '10-year real change', 'unit': '%', 'format': 'signed',
             'scale': {'type': 'diverging', 'palette': 'redgreen', 'bins': [-20, -5, 0, 10, 25, 50]}},
            {'key': 'ppp_year', 'label': 'PPP year', 'hidden': True},
            {'key': 'nominal_year', 'label': 'Nominal year', 'hidden': True}
        ],
        'data': data
    }


def lt(s):
    return s.strip() if s.strip() else None


def num(s):
    if s is None:
        return None
    return 0.05 if s.startswith('<') else float(s)


def alcohol_layer():
    data = {}
    with open(os.path.join(SRC, 'who_alcohol_2019.csv'), encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    by_shares = {}
    for r in rows:
        iso = r['iso3']
        if iso not in KNOWN:
            print('alcohol: not on basemap', iso, r['country'])
            continue
        rec_s, unr_s = lt(r['recorded']), lt(r['unrecorded'])
        total = num(rec_s) + num(unr_s)
        if rec_s.startswith('<') and unr_s.startswith('<'):
            total = '<0.2'
        elif rec_s.startswith('<') or unr_s.startswith('<'):
            total = '≈' + str(round(total, 1))  # one part is below 0.1 L
        else:
            total = round(total, 1)
        rec = {'total': total,
               'recorded': cell(rec_s), 'unrecorded': cell(unr_s)}
        for k in ('beer_pct', 'wine_pct', 'spirits_pct', 'other_pct', 'proj_2025'):
            v = lt(r[k])
            if v is not None:
                rec[k.replace('_pct', '')] = cell(v)
        shares = tuple(r[k] for k in ('beer_pct', 'wine_pct', 'spirits_pct', 'other_pct'))
        if all(shares):
            by_shares.setdefault(shares, []).append(iso)
        data[iso] = rec
    names = {r['iso3']: r['country'] for r in rows}
    for isos in by_shares.values():
        if len(isos) > 1:
            for i in isos:
                others = ', '.join(names[o] for o in isos if o != i)
                row = lambda c: (data[c]['recorded'], data[c]['unrecorded'], data[c].get('proj_2025'))
                same_totals = all(row(o) == row(i) for o in isos)
                what = 'row' if same_totals else 'beverage split'
                data[i]['note'] = (f'The source table gives the same {what} as {others}; '
                                   'this may be a copying error in the source.')
    return {
        'id': 'alcohol',
        'title': 'Alcohol consumption',
        'badge': 'L',
        'kind': 'choropleth',
        'year': 2019,
        'about': ('Litres of pure alcohol per person aged 15 and over, per year. '
                  'Total = recorded (sales, production, trade data) + unrecorded (home-made, '
                  'smuggled, untaxed) estimates. 2019 values are WHO three-year averages (2017–2019), '
                  'the last pre-pandemic baseline. One litre of pure alcohol is about 60 bottles of beer (330 ml, 5%). '
                  'Beverage shares are of recorded consumption; the 2025 figure is a WHO projection.'),
        'source': {
            'name': 'WHO Global status report on alcohol and health (2024), via Wikipedia',
            'url': 'https://en.wikipedia.org/wiki/List_of_countries_by_alcohol_consumption_per_capita'
        },
        'fields': [
            {'key': 'total', 'label': 'Total', 'unit': 'L', 'format': 'decimal', 'primary': True,
             'scale': {'type': 'linear', 'palette': 'amber', 'bins': [1, 2.5, 5, 7.5, 10, 12.5]}},
            {'key': 'recorded', 'label': 'Recorded', 'unit': 'L', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'amber', 'bins': [1, 2.5, 5, 7.5, 10, 12.5]}},
            {'key': 'unrecorded', 'label': 'Unrecorded', 'unit': 'L', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'purple', 'bins': [0.25, 0.5, 1, 2, 4, 6]}},
            {'key': 'beer', 'label': 'Beer share', 'unit': '%', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'amber', 'bins': [10, 20, 35, 50, 65, 80]}},
            {'key': 'wine', 'label': 'Wine share', 'unit': '%', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'purple', 'bins': [5, 10, 20, 30, 45, 60]}},
            {'key': 'spirits', 'label': 'Spirits share', 'unit': '%', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'blue', 'bins': [10, 20, 35, 50, 65, 80]}},
            {'key': 'other', 'label': 'Other share', 'unit': '%', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'teal', 'bins': [1, 5, 15, 30, 50, 70]}},
            {'key': 'proj_2025', 'label': '2025 projection', 'unit': 'L', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'amber', 'bins': [1, 2.5, 5, 7.5, 10, 12.5]}}
        ],
        'data': data
    }


def cell(s):
    """Keep '<0.1' as text so the page can show it honestly; everything else as a number."""
    return s if s.startswith('<') else float(s)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for layer in (gdp_layer(), alcohol_layer()):
        with open(os.path.join(OUT, layer['id'] + '.json'), 'w', encoding='utf-8') as f:
            json.dump(layer, f, ensure_ascii=False, separators=(',', ':'))
        print(layer['id'], len(layer['data']), 'countries')
