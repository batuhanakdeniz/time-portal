/**
 * 15 dönem için sade, kendi çizimimiz geometrik siluetler (lisans sorunu yok).
 * viewBox 0 0 64 64, çizgi rengi `currentColor`. Kurgu dönemlerde çizgi kesikli (CSS).
 */
import type { ReactElement } from 'react'

const shapes: Record<string, ReactElement> = {
  // El baltası ve ateş
  paleolitik: (
    <>
      <path d="M24 8 C34 20 36 38 24 56 C12 38 14 20 24 8Z" />
      <path d="M24 18 L24 46" />
      <path d="M46 56 C38 48 42 40 46 34 C48 42 54 44 50 56Z" />
    </>
  ),
  // T biçimli dikilitaş (Göbeklitepe)
  neolitik: (
    <>
      <path d="M14 12 H50 V22 H38 V56 H26 V22 H14Z" />
      <path d="M30 30 L34 34 L30 38" />
    </>
  ),
  // Güneş kursu
  tunc: (
    <>
      <path d="M12 44 A20 20 0 0 1 52 44" />
      <path d="M18 44 A14 14 0 0 1 46 44" />
      <circle cx="32" cy="18" r="3" />
      <circle cx="14" cy="28" r="3" />
      <circle cx="50" cy="28" r="3" />
      <path d="M32 44 V58 M24 58 H40" />
    </>
  ),
  // Sikke
  demir: (
    <>
      <circle cx="32" cy="32" r="20" />
      <circle cx="32" cy="32" r="14" />
      <path d="M24 36 C28 26 36 26 40 34 M26 38 H38" />
    </>
  ),
  // Amfora
  helenistik: (
    <>
      <path d="M27 8 H37 V16 C46 22 46 40 36 52 L32 58 L28 52 C18 40 18 22 27 16Z" />
      <path d="M27 14 C20 14 20 24 24 26 M37 14 C44 14 44 24 40 26" />
    </>
  ),
  // Sütunlar
  roma: (
    <>
      <path d="M10 14 H54 M14 14 L32 6 L50 14" />
      <path d="M16 18 H24 V52 H16Z M28 18 H36 V52 H28Z M40 18 H48 V52 H40Z" />
      <path d="M10 56 H54" />
    </>
  ),
  // Kubbe ve kemerler
  bizans: (
    <>
      <path d="M14 34 A18 18 0 0 1 50 34" />
      <path d="M12 34 H52 V56 H12Z" />
      <path d="M20 56 V46 A4 4 0 0 1 28 46 V56 M36 56 V46 A4 4 0 0 1 44 46 V56" />
      <path d="M32 16 V10" />
    </>
  ),
  // Kümbet
  selcuklu: (
    <>
      <path d="M20 30 L32 10 L44 30Z" />
      <path d="M22 30 H42 V56 H22Z" />
      <path d="M28 56 V44 A4 4 0 0 1 36 44 V56" />
    </>
  ),
  // Kubbe ve minare
  'osmanli-klasik': (
    <>
      <path d="M18 40 A14 14 0 0 1 46 40" />
      <path d="M14 40 H50 V56 H14Z" />
      <path d="M8 56 V20 L10 12 L12 20 V56" />
      <path d="M54 56 V20 L56 12 L58 20 V56" />
    </>
  ),
  // Saat kulesi
  'osmanli-gec': (
    <>
      <path d="M24 20 L32 8 L40 20Z" />
      <path d="M24 20 H40 V56 H24Z" />
      <circle cx="32" cy="30" r="5" />
      <path d="M32 27 V30 L34 31" />
      <path d="M18 56 H46" />
    </>
  ),
  // Buharlı lokomotif ve ray
  'erken-cumhuriyet': (
    <>
      <path d="M10 26 H30 V44 H10Z" />
      <path d="M30 32 H52 V44 H30" />
      <path d="M42 32 V22 H48 V32" />
      <circle cx="18" cy="48" r="4" />
      <circle cx="40" cy="48" r="4" />
      <path d="M6 54 H58" />
    </>
  ),
  // Asma köprü
  'yirminci-yy-sonu': (
    <>
      <path d="M18 54 V16 M46 54 V16" />
      <path d="M4 22 C12 38 14 40 18 16 C28 44 36 44 46 16 C50 40 52 38 60 22" />
      <path d="M4 42 H60" />
    </>
  ),
  // Şehir silueti
  bugun: (
    <>
      <path d="M6 56 V36 H14 V56 M16 56 V22 H26 V56 M28 56 V30 H34 V56 M36 56 V12 H44 V56 M46 56 V28 H56 V56" />
      <path d="M40 12 V6" />
      <path d="M4 56 H60" />
    </>
  ),
  // Rüzgâr türbini
  'yakin-gelecek': (
    <>
      <path d="M32 24 V58 M26 58 H38" />
      <circle cx="32" cy="22" r="2" />
      <path d="M32 20 L30 4 L34 4Z" />
      <path d="M34 23 L48 32 L46 35Z" />
      <path d="M30 23 L16 32 L18 35Z" />
    </>
  ),
  // Halkalı gezegen ve yıldız
  'uzak-gelecek': (
    <>
      <circle cx="28" cy="36" r="12" />
      <ellipse cx="28" cy="36" rx="22" ry="6" transform="rotate(-18 28 36)" />
      <path d="M50 8 L52 14 L58 16 L52 18 L50 24 L48 18 L42 16 L48 14Z" />
    </>
  ),
}

export function Silhouette({ id, className }: { id: string; className?: string }) {
  const shape = shapes[id]
  if (!shape) return null
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      width="56"
      height="56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-silhouette={id}
    >
      {shape}
    </svg>
  )
}

/** Testler için: siluet tanımlı dönem kimlikleri. */
export const SILHOUETTE_IDS = Object.keys(shapes)
