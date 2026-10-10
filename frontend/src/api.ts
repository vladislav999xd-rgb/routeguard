export type Session = { authenticated: boolean; user: null | { username: string; name: string }; workspace: null | { id: string; name: string; kind: 'demo' | 'persistent'; demo_date: string; expires_at: string | null }; role: string | null }

function csrf(): string {
  return document.cookie.split('; ').find((item) => item.startsWith('csrftoken='))?.split('=')[1] ?? ''
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = csrf()
  if (token) headers.set('X-CSRFToken', token)
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message ?? 'Не удалось выполнить запрос')
  return data as T
}

export const post = <T,>(path: string, data: object = {}, headers?: HeadersInit) => api<T>(path, { method: 'POST', body: JSON.stringify(data), headers })

export const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
}
