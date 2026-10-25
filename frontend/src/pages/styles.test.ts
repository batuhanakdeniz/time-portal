import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readText = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const appCss = readText('../App.css')
const hoyukCss = readText('../year/HoyukYearPicker.css')

// jsdom yerleşim ölçmez; burada yalnızca yerleşimi taşıyan kuralların varlığı denetlenir.
// Asıl doğrulama gerçek tarayıcıda (masaüstü 1280×800, mobil 375 px).

/** `selector { ... }` bloğunun gövdesi (ilk eşleşme, `from` konumundan sonra). */
function block(css: string, selector: string, from = 0): string {
  const i = css.indexOf(`${selector} {`, from)
  expect(i, `${selector} kuralı yok`).toBeGreaterThanOrEqual(0)
  return css.slice(i, css.indexOf('}', i))
}
const desktop = () => appCss.indexOf('@media (min-width: 900px)')

describe('harita sayfası yerleşimi', () => {
  it('sayfa ekranı doldurur (100dvh)', () => {
    expect(block(appCss, '.page-map')).toMatch(/height:\s*100dvh/)
  })

  it('harita kabı kalan alanı doldurur ve en küçük yüksekliği vardır', () => {
    const map = block(appCss, '.map-canvas')
    expect(map).toMatch(/flex:\s*1 1 auto/)
    expect(map).toMatch(/min-height:\s*240px/)
    expect(block(appCss, '.page-map .turkey-map-canvas')).toMatch(/flex:\s*1 1 auto/)
  })

  it('masaüstünde harita en az 480 px ve son satır kalan alanı alır', () => {
    expect(desktop()).toBeGreaterThan(0)
    expect(block(appCss, '.map-canvas', desktop())).toMatch(/min-height:\s*480px/)
    expect(block(appCss, '.page-map', desktop())).toMatch(/grid-template-rows:[^;]*minmax\(0, 1fr\)/)
  })
})

describe('sahne açılışı', () => {
  it('temel .scene-stage kırpılmaz; açılış yalnızca sınıfla ve dolgusuz', () => {
    expect(block(appCss, '.scene-stage')).not.toMatch(/animation|clip-path/)
    const reveal = block(appCss, '.scene-stage--reveal')
    expect(reveal).toMatch(/animation:\s*scene-reveal 600ms ease-out;/)
    expect(reveal).not.toMatch(/both|forwards/)
  })
})

describe('yıl hapı', () => {
  it('paylaşılan geçiş adı var ve girişte canlanmaz (geri dönüşte görünür)', () => {
    expect(block(appCss, '.page-year .hoyuk-pill')).toMatch(/view-transition-name:\s*yil-rozeti/)
    expect(hoyukCss).not.toMatch(/\.hoyuk-pill\s*\{[^}]*animation/)
    expect(hoyukCss).not.toMatch(/hoyuk-pill-in/)
  })
})
