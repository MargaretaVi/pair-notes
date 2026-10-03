import type { SpaceData } from './model'

const API_ROOT = '/api'

export interface SharedSpaceCredentials {
  id: string
  accessToken: string
}

export async function createSharedSpace(): Promise<SharedSpaceCredentials> {
  return request<SharedSpaceCredentials>(`${API_ROOT}/spaces`, { method: 'POST' })
}

export async function pullSpace(id: string, accessToken: string): Promise<SpaceData> {
  const response = await request<SpaceData & { serverTime: number }>(`${API_ROOT}/sync/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return { id: response.id || id, notes: response.notes, entries: response.entries }
}

export async function pushSpace(data: SpaceData, accessToken: string): Promise<void> {
  await request<{ ok: true }>(`${API_ROOT}/sync/${encodeURIComponent(data.id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: data.notes, entries: data.entries }),
  })
}

export async function rotateSpaceLink(id: string, accessToken: string): Promise<SharedSpaceCredentials> {
  return request<SharedSpaceCredentials>(`${API_ROOT}/spaces/${encodeURIComponent(id)}/rotate-link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function deleteSharedSpace(id: string, accessToken: string): Promise<void> {
  await request<{ ok: true }>(`${API_ROOT}/spaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    if (response.status === 401) throw new Error('This private link is no longer valid.')
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}