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
    clearedAt: 0,
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
    vi.stubGlobal('confirm', vi.fn(() => true))
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.history.replaceState({}, '', '?space=space-1#access=token-1')
    localStorage.clear()
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
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

  it('collapses nested items and reopens the branch to add another child', async () => {
    let data = createNote(createSpaceData('space-1'), 'Groceries', 'checklist', 'note-1')
    data = createEntry(data, 'note-1', null, 'check', 'Shopping').data
    const parentId = data.entries[0].id
    data = createEntry(data, 'note-1', parentId, 'check', 'Produce').data
    data = createEntry(data, 'note-1', null, 'check', 'Loose item').data
    localStorage.setItem('pair-notes:space-1', JSON.stringify(data))

    await act(async () => root.render(<App />))

    const collapseButton = document.querySelector<HTMLButtonElement>('[aria-label="Collapse children of Shopping"]')!
    expect(collapseButton.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[aria-label="Collapse children of Loose item"]')).toBeNull()
    expect(Array.from(document.querySelectorAll('.entry-label')).some((label) => label.textContent === 'Produce')).toBe(true)

    await act(async () => collapseButton.click())
    expect(document.querySelector('[aria-label="Expand children of Shopping"]')?.getAttribute('aria-expanded')).toBe('false')
    expect(Array.from(document.querySelectorAll('.entry-label')).some((label) => label.textContent === 'Produce')).toBe(false)

    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Add child to Shopping"]')?.click())
    expect(document.querySelector('[aria-label="Collapse children of Shopping"]')?.getAttribute('aria-expanded')).toBe('true')
    const input = document.querySelector<HTMLInputElement>('input[aria-label="New checklist entry"]')!
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Collapse children of Shopping"]')?.click())
    expect(Array.from(document.querySelectorAll('.entry-label')).some((label) => label.textContent === 'Produce')).toBe(false)
    expect(document.querySelector('input[aria-label="New checklist entry"]')).toBeTruthy()
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Expand children of Shopping"]')?.click())

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(input, 'Bananas')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector<HTMLFormElement>('.entry-composer')!.requestSubmit()
    })

    expect(Array.from(document.querySelectorAll('.entry-label')).some((label) => label.textContent === 'Bananas')).toBe(true)
  })

  it('categorizes and groups a checkable nested item', async () => {
    const data = createNote(createSpaceData('space-1'), 'Groceries', 'checklist', 'note-1')
    const withParent = createEntry(data, 'note-1', null, 'check', 'Shopping').data
    localStorage.setItem('pair-notes:space-1', JSON.stringify(withParent))

    await act(async () => root.render(<App />))
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Add child to Shopping"]')?.click())

    const input = document.querySelector<HTMLInputElement>('input[aria-label="New checklist entry"]')!
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(input, 'Mjölk')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector<HTMLFormElement>('.entry-composer')!.requestSubmit()
    })

    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Category for Mjölk"]')?.value).toBe('dairy-eggs')
    expect(Array.from(document.querySelectorAll('.nested-group .category-section h3')).map((heading) => heading.textContent)).toContain('Dairy & Eggs')
  })

  it('groups grocery items by suggested category and lets the user change it', async () => {
    let data = createNote(createSpaceData('space-1'), 'Groceries', 'checklist', 'note-1')
    data = createEntry(data, 'note-1', null, 'check', 'Mjölk').data
    data = createEntry(data, 'note-1', null, 'check', 'Tomatoes').data
    data = createEntry(data, 'note-1', null, 'check', 'Beer').data
    data = createEntry(data, 'note-1', null, 'text', 'Remember the bags').data
    localStorage.setItem('pair-notes:space-1', JSON.stringify(data))

    await act(async () => {
      root.render(<App />)
    })

    expect(Array.from(document.querySelectorAll('.category-section h3')).map((heading) => heading.textContent)).toEqual(['Produce', 'Dairy & Eggs', 'Systembolaget', 'Notes'])
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Category for Beer"]')?.value).toBe('systembolaget')
    const selector = document.querySelector<HTMLSelectElement>('select[aria-label="Category for Tomatoes"]')!
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      valueSetter?.call(selector, 'other')
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Category for Tomatoes"]')?.value).toBe('other')
    expect(document.querySelectorAll('.category-section h3')[0]?.textContent).toBe('Dairy & Eggs')
    expect(document.querySelectorAll('.category-section h3')[1]?.textContent).toBe('Systembolaget')
    expect(document.querySelectorAll('.category-section h3')[2]?.textContent).toBe('Other')
  })

  it('keeps autocorrected entry text reversible after more text is typed', async () => {
    const data = createNote(createSpaceData('space-1'), 'Groceries', 'checklist', 'note-1')
    localStorage.setItem('pair-notes:space-1', JSON.stringify(data))

    await act(async () => {
      root.render(<App />)
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.add-root-entry')?.click()
    })
    const input = document.querySelector<HTMLInputElement>('input[aria-label="New checklist entry"]')!
    const setInputValue = (value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    }

    await act(async () => {
      setInputValue('teh apples')
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    })
    await act(async () => {
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertReplacementText' }))
      setInputValue('the apples')
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }))
    })
    await act(async () => {
      setInputValue('the apples and milk')
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    })
    await act(async () => {
      document.querySelector<HTMLFormElement>('.entry-composer')!.requestSubmit()
    })

    const revertButton = document.querySelector<HTMLButtonElement>('button[aria-label="Revert the apples and milk to teh apples"]')
    expect(revertButton).toBeTruthy()
    await act(async () => revertButton!.click())

    expect(Array.from(document.querySelectorAll('.entry-label')).map((label) => label.textContent)).toContain('teh apples')
  })

  it('creates a shared space with the chosen name and keeps the token in the URL fragment', async () => {
    window.history.replaceState({}, '', '/')
    await act(async () => {
      root.render(<App />)
    })

    const nameInput = document.querySelector<HTMLInputElement>('#space-name')!
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(nameInput, 'Weekend Plans')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      document.querySelector<HTMLFormElement>('.create-space-form')!.requestSubmit()
    })

    expect(createSharedSpace).toHaveBeenCalledWith('weekend-plans')
    expect(window.location.search).toBe('?space=space-1')
    expect(window.location.hash).toBe('#access=token-1')
  })

  it('retries a failed upload after a successful poll before reporting synced', async () => {
    vi.useFakeTimers()
    pushSpace.mockRejectedValueOnce(new Error('Temporary upload failure'))

    await act(async () => root.render(<App />))
    await act(async () => vi.advanceTimersByTimeAsync(450))

    expect(document.querySelector('.sync-indicator')?.textContent).toContain('Offline')
    expect(pushSpace).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTimeAsync(3000))
    await act(async () => vi.advanceTimersByTimeAsync(450))

    expect(pushSpace).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.sync-indicator')?.textContent).toBe('Synced just now')
  })

  it('discards cached notes when the shared space has been cleared', async () => {
    vi.useFakeTimers()
    const cached = createNote(createSpaceData('space-1'), 'Old test note', 'text', 'old-note')
    localStorage.setItem('pair-notes:space-1', JSON.stringify(cached))
    pullSpace.mockResolvedValue({ id: 'space-1', notes: [], entries: [], clearedAt: 123 })

    await act(async () => root.render(<App />))

    expect(JSON.parse(localStorage.getItem('pair-notes:space-1')!).notes).toEqual([])
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(pushSpace).toHaveBeenCalledWith(
      expect.objectContaining({ notes: [], entries: [], clearedAt: 123 }),
      'token-1',
    )
  })

  it('shows a clear error when the private link is no longer valid', async () => {
    pullSpace.mockRejectedValueOnce(new Error('This private link is no longer valid.'))
    localStorage.clear()
    window.history.replaceState({}, '', '?space=space-1#access=token-1')

    await act(async () => root.render(<App />))

    expect(document.querySelector('.welcome-copy')?.textContent).toContain('This private link is no longer valid.')
    expect(document.querySelector('.primary-button')?.textContent).toBe('Try again')
  })

  it('replaces the private link and updates the URL fragment', async () => {
    const cached = createNote(createSpaceData('space-1'), 'Shared note', 'text', 'note-1')
    localStorage.setItem('pair-notes:space-1', JSON.stringify(cached))
    window.history.replaceState({}, '', '?space=space-1#access=token-1')

    await act(async () => root.render(<App />))
    await act(async () => document.querySelector<HTMLButtonElement>('.share-link-button')?.click())
    await act(async () => document.querySelectorAll<HTMLButtonElement>('.share-management button')[0]?.click())

    expect(rotateSpaceLink).toHaveBeenCalledWith('space-1', 'token-1')
    expect(window.location.hash).toBe('#access=token-2')
  })

  it('ignores malformed cached space payloads instead of crashing the app', async () => {
    localStorage.setItem('pair-notes:space-1', JSON.stringify({ id: 'space-1', notes: 'not-an-array' }))
    window.history.replaceState({}, '', '?space=space-1#access=token-1')

    await act(async () => root.render(<App />))

    expect(document.body.textContent).toContain('pair notes')
  })

  it('ignores malformed remote sync payloads instead of surfacing invalid notes', async () => {
    const cached = createNote(createSpaceData('space-1'), 'Good note', 'text', 'note-1')
    localStorage.setItem('pair-notes:space-1', JSON.stringify(cached))
    pullSpace.mockResolvedValueOnce({
      id: 'space-1',
      notes: [{
        id: 'note-2',
        title: 'Bad note',
        kind: 'text',
        body: '',
        position: 0,
        sortModes: {},
        updatedAt: undefined,
        deleted: false,
      }] as any,
      entries: [],
      clearedAt: 0,
    })

    await act(async () => root.render(<App />))

    expect(Array.from(document.querySelectorAll('.nav-note-title')).map((node) => node.textContent)).toEqual(['Good note'])
  })

  it('keeps text note content synchronized when the server refreshes the note body', async () => {
    const cached = createNote(createSpaceData('space-1'), 'Draft', 'text', 'note-1')
    localStorage.setItem('pair-notes:space-1', JSON.stringify(cached))
    pullSpace.mockResolvedValueOnce({
      id: 'space-1',
      notes: [{ ...cached.notes[0], body: 'fresh remote body', updatedAt: Date.now() + 1 }] as any,
      entries: [],
      clearedAt: 0,
    })

    await act(async () => root.render(<App />))
    await act(async () => {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note text"]')
      expect(textarea?.value).toBe('fresh remote body')
    })
  })
})
