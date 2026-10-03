import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createEntry, createNote, createSpaceData } from './model'

const { createSharedSpace, pullSpace, pushSpace, rotateSpaceLink, deleteSharedSpace } = vi.hoisted(() => ({
  createSharedSpace: vi.fn(async () => ({
    id: 'space-1',
    accessToken: 'token-1',
  })),
  pullSpace: vi.fn(async () => ({
    id: 'space-1',
    notes: [],
    entries: [],
  })),
  pushSpace: vi.fn(async () => undefined),
  rotateSpaceLink: vi.fn(async () => ({ id: 'space-1', accessToken: 'token-2' })),
  deleteSharedSpace: vi.fn(async () => undefined),
}))

vi.mock('./api', () => ({
  createSharedSpace,
  pullSpace,
  pushSpace,
  rotateSpaceLink,
  deleteSharedSpace,
}))

describe('nested checklist creation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.history.replaceState({}, '', '?space=space-1#access=token-1')
    localStorage.clear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.clear()
  })

  it('shows the nested composer even when the parent has no children yet', async () => {
    const base = createNote(createSpaceData('space-1'), 'Trip', 'checklist', 'note-1')
    const withEntry = createEntry(base, 'note-1', null, 'check', 'Groceries').data
    localStorage.setItem('pair-notes:space-1', JSON.stringify(withEntry))

    await act(async () => {
      root.render(<App />)
    })

    const addChildButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label') === 'Add child to Groceries',
    )
    expect(addChildButton).toBeTruthy()

    await act(async () => {
      addChildButton!.click()
    })

    const nestedInputs = Array.from(document.querySelectorAll('input[aria-label="New checklist entry"]'))
    expect(nestedInputs.length).toBe(1)
  })
})
