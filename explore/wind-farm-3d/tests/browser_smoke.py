"""Headless-browser smoke test of the 3D Wind Farm Lab (desktop + emulated phone).

Requires: Python Playwright and a Chrome/Chromium binary, plus a local copy of the
three.js npm package (CDN requests are answered from it, so the test runs offline):

    npm pack three@0.170.0 && tar xzf three-0.170.0.tgz      # gives ./package
    python3 tests/browser_smoke.py --three ./package --chrome /usr/bin/google-chrome --out /tmp/windlab

Checks: page starts without errors in every scenario; Top/Side views, tap-to-select, panel cards,
farm table and model tab; rendered blade tips and chord lines
match physics/geometry.js; mouse orbit/zoom and two-finger touch pinch/pan/twist move the
camera; CDN fallback (jsDelivr blocked → unpkg); a visible error when no CDN is reachable.
Screenshots are written to --out.
"""
import argparse, asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

LAB = pathlib.Path(__file__).resolve().parents[1]
CT = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json'}
STATE = "({ready: !!window.windLabReady, err: document.getElementById('errorText').textContent, status: document.getElementById('status').textContent})"
CAM = "(() => { const c = window.windLab.view.controls; return {az: c.azimuth, el: c.elevation, d: c.distance, t: [...c.target]}; })()"

async def open_page(p, a, mobile=False, block=()):
    b = await p.chromium.launch(executable_path=a.chrome, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(**(p.devices['Pixel 7'] if mobile else {'viewport': {'width': 1280, 'height': 800}}))
    page = await ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' or 'mismatch' in m.text else None)
    three = pathlib.Path(a.three)
    async def route(r):
        url = r.request.url
        for host in ('https://cdn.jsdelivr.net/npm/three@0.170.0/', 'https://unpkg.com/three@0.170.0/'):
            if url.startswith(host):
                if any(host.startswith(x) for x in block): return await r.abort()
                return await r.fulfill(body=(three / url[len(host):]).read_bytes(), content_type='text/javascript', headers={'access-control-allow-origin': '*'})
        if url.startswith('http://lab/'):
            f = LAB / url[len('http://lab/'):].split('#')[0].split('?')[0]
            if f.is_dir(): f = f / 'index.html'
            return await r.fulfill(body=f.read_bytes(), content_type=CT.get(f.suffix, 'application/octet-stream')) if f.exists() else await r.fulfill(status=404)
        return await r.abort()
    await page.route('**/*', route)
    return b, page, errors

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: check.failed = True
check.failed = False

async def main(a):
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        # desktop: all scenarios
        b, page, errors = await open_page(p, a)
        for sc in ['coast', 'plain', 'mountain', 'gust']:
            await page.goto(f'http://lab/index.html#scenario={sc}&seed=11'); await page.reload()
            await page.wait_for_function('window.windLabReady', timeout=30000); await page.wait_for_timeout(1500)
            st = await page.evaluate(STATE); chk = await page.evaluate('window.windLab.selfCheck()')
            check(st['ready'] and not st['err'], f'{sc}: running — {st["status"][:90]}')
            check(chk['tipError_m'] < 1e-6 and chk['chordDirectionError'] < 1e-9, f'{sc}: render geometry = physics geometry {chk}')
            await page.screenshot(path=str(out / f'desktop-{sc}.png'))
        # wake colouring + close-up
        await page.click('#legend'); await page.wait_for_timeout(400)
        await page.evaluate("""(() => { const w = window.windLab, t = w.sim.farm.turbines[0], c = w.view.controls;
            c.target = [t.x, 0, t.z]; c.targetLift = 90; c.distance = 1400; c.elevation = 0.9; c.update(); })()""")
        await page.wait_for_timeout(1500); await page.screenshot(path=str(out / 'desktop-wake-colour.png'))
        # mouse orbit and wheel zoom
        c0 = await page.evaluate(CAM)
        await page.mouse.move(640, 450); await page.mouse.down(); await page.mouse.move(760, 400, steps=8); await page.mouse.up()
        await page.mouse.wheel(0, 400); await page.wait_for_timeout(200)
        c1 = await page.evaluate(CAM)
        check(abs(c1['az'] - c0['az']) > 0.1 and abs(c1['el'] - c0['el']) > 0.02 and c1['d'] > c0['d'], f'mouse orbit + wheel zoom {c0} -> {c1}')
        # learning UI: 2D views, tap-to-select, panel cards and farm table
        await page.click('[data-view=top]'); await page.wait_for_timeout(800)
        target = await page.evaluate("""(() => { const w = window.windLab, t = w.sim.farm.turbines.find(q => q !== w.selected);
            const [x, y] = w.plan.topXY(t.x, t.z), r = w.plan.canvas.getBoundingClientRect(); return {id: t.id, x: r.left + x, y: r.top + y}; })()""")
        await page.mouse.click(target['x'], target['y']); await page.wait_for_timeout(300)
        check((await page.evaluate('window.windLab.selected.id')) == target['id'], f'tap in Top view selects T{target["id"]}')
        await page.screenshot(path=str(out / 'desktop-top.png'))
        await page.click('[data-view=side]'); await page.wait_for_timeout(800)
        side = await page.evaluate("(() => { const p = window.windLab.plan; return {mode: p.mode, kind: p.field.kind, hidden: p.canvas.hidden, profiles: p.profiles.length}; })()")
        check(side == {'mode': 'side', 'kind': 'side', 'hidden': False, 'profiles': 4}, f'Side view shows slice + 4 profiles {side}')
        await page.click('[data-card=thrust]'); await page.wait_for_timeout(200)
        check(await page.evaluate("document.querySelector('[data-card=thrust] .more').textContent.includes('Newton')"), 'card expands with explanation')
        await page.click('[data-card=curve]'); await page.wait_for_timeout(200)
        check(await page.evaluate("!!document.querySelector('canvas[data-chart=curve]')"), 'power-curve chart drawn')
        await page.screenshot(path=str(out / 'desktop-side.png'))
        await page.click('[data-tab=farm]'); await page.click('[data-select="1"]'); await page.wait_for_timeout(300)
        check((await page.evaluate('window.windLab.selected.id')) == 1, 'farm table row selects turbine')
        await page.click('[data-tab=model]'); await page.wait_for_timeout(200)
        check(await page.evaluate("document.querySelectorAll('[data-card^=reg-]').length") >= 15, 'model tab lists the coefficient registry')
        check(not errors, f'desktop console clean {errors[:3]}')
        await b.close()

        # phone: touch gestures through CDP (real multi-touch pointer events)
        b, page, errors = await open_page(p, a, mobile=True)
        await page.goto('http://lab/index.html#scenario=mountain&seed=5')
        await page.wait_for_function('window.windLabReady', timeout=30000); await page.wait_for_timeout(1500)
        size = await page.evaluate("(() => { const c = document.querySelector('#stage canvas'), v = document.getElementById('stage'); return [c.clientWidth, c.clientHeight, v.clientWidth, v.clientHeight, innerWidth, innerHeight, document.documentElement.scrollHeight]; })()")
        check(size[0] == size[2] and size[1] == size[3] and size[1] > 300 and size[6] <= size[5], f'phone layout: canvas fills view, no page scroll {size}')
        cdp = await page.context.new_cdp_session(page)
        async def touch(kind, pts): await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
        cx, cy = await page.evaluate("(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 + 20]; })()")
        c0 = await page.evaluate(CAM)
        await touch('touchStart', [(cx - 60, cy)])
        for k in range(1, 9): await touch('touchMove', [(cx - 60 + 10 * k, cy - 4 * k)])
        await touch('touchEnd', [])
        c1 = await page.evaluate(CAM)
        check(abs(c1['az'] - c0['az']) > 0.05, f'one-finger orbit {c0["az"]:.3f} -> {c1["az"]:.3f}')
        await touch('touchStart', [(cx - 40, cy - 30), (cx + 40, cy + 30)])
        for k in range(1, 9): await touch('touchMove', [(cx - 40 - 5 * k, cy - 30 - 4 * k + 2 * k), (cx + 40 + 5 * k, cy + 30 + 4 * k + 2 * k)])
        await touch('touchEnd', [])
        c2 = await page.evaluate(CAM)
        check(c2['d'] < c1['d'] and c2['t'] != c1['t'], f'pinch zoom-in + two-finger pan d {c1["d"]:.0f} -> {c2["d"]:.0f}')
        await page.tap('#legend'); await page.wait_for_timeout(300)
        check((await page.evaluate('window.windLab.view.colorMode')) == 'wake', 'tap legend switches colouring')
        await page.screenshot(path=str(out / 'phone-mountain.png'))
        await page.tap('[data-view=side]'); await page.wait_for_timeout(800)
        await page.screenshot(path=str(out / 'phone-side.png'))
        sizes = await page.evaluate("(() => { const s = document.getElementById('stage'), p = document.getElementById('panel'); return [s.clientHeight, p.clientHeight, p.scrollHeight]; })()")
        check(sizes[0] > 250 and sizes[1] > 250 and sizes[2] > sizes[1], f'phone: view and scrollable panel both visible {sizes}')
        check(not errors, f'phone console clean {errors[:3]}')
        await b.close()

        # CDN fallback and failure message
        b, page, errors = await open_page(p, a, block=('https://cdn.jsdelivr.net',))
        await page.goto('http://lab/index.html#scenario=coast&seed=3')
        await page.wait_for_function('window.windLabReady', timeout=30000)
        check(True, 'jsDelivr blocked → loaded from unpkg')
        await b.close()
        b, page, errors = await open_page(p, a, block=('https://cdn.jsdelivr.net', 'https://unpkg.com'))
        await page.goto('http://lab/index.html'); await page.wait_for_timeout(2500)
        st = await page.evaluate(STATE)
        check('Could not load three.js' in st['err'], 'no CDN reachable → visible error message')
        await page.screenshot(path=str(out / 'error-no-cdn.png'))
        await b.close()
    sys.exit(1 if check.failed else 0)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--three', required=True); ap.add_argument('--chrome', default=None); ap.add_argument('--out', default='/tmp/windlab')
    asyncio.run(main(ap.parse_args()))
