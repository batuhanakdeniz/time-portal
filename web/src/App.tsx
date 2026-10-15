import { useEffect, useState } from 'react'

type BackendStatus = 'checking' | 'up' | 'down'

const statusText: Record<BackendStatus, string> = {
  checking: 'Backend kontrol ediliyor…',
  up: 'Backend çalışıyor',
  down: 'Backend erişilemiyor',
}

export default function App() {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { status?: string }) => {
        if (!cancelled) setStatus(body.status === 'UP' ? 'up' : 'down')
      })
      .catch(() => {
        if (!cancelled) setStatus('down')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="app">
      <h1>Time Portal</h1>
      <p>Bir tarih ve konum seç, o anı 3 boyutlu keşfet.</p>
      <p className={`status status-${status}`} role="status">
        {statusText[status]}
      </p>
    </main>
  )
}
