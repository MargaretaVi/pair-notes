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
})
