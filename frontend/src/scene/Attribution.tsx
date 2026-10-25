import type { ReactNode } from 'react'
import type { SceneAttribution } from '../api/scenes'
import { providerLabel, safeHttpsUrl } from './resultInfo'
import './Attribution.css'

function MaybeLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  const safe = safeHttpsUrl(href)
  return safe ? (
    <a href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  )
}

/** Görsel ve harita verisi atıfları; metinler düz metin olarak basılır. */
export function Attribution({ attribution }: { attribution?: SceneAttribution | null }) {
  const parts: ReactNode[] = []
  if (attribution) {
    const source = providerLabel(attribution.provider)
    if (attribution.author) parts.push(attribution.author)
    if (attribution.license) parts.push(<MaybeLink href={attribution.licenseUrl}>{attribution.license}</MaybeLink>)
    parts.push(<MaybeLink href={attribution.sourceUrl ?? source.url}>{source.name}</MaybeLink>)
  }
  return (
    <footer className="attribution">
      {parts.length > 0 && (
        <p>
          Görsel:{' '}
          {parts.map((part, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {part}
            </span>
          ))}
        </p>
      )}
      <p>
        İlçe sınırları ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap katkıcıları
        </a>{' '}
        (ODbL)
      </p>
    </footer>
  )
}
