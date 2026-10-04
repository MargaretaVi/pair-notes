import { describe, expect, it } from 'vitest'
import {
  createEntry,
  createNote,
  createSpaceData,
  getEntries,
  reorderEntry,
  revertEntryText,
  setEntryCategory,
  setSortMode,
  suggestGroceryCategory,
  updateEntryText,
} from './model'

function checklist() {
  const data = createNote(createSpaceData('space-1'), 'Groceries', 'checklist', 'note-1')
  return data
}

function add(data: ReturnType<typeof checklist>, parentId: string | null, text: string, kind: 'check' | 'text' = 'check') {
  const result = createEntry(data, 'note-1', parentId, kind, text)
  expect(result.error).toBeUndefined()
  return result.data
}

describe('checklist entries', () => {
  it('inserts new entries alphabetically', () => {
    let data = checklist()
    data = add(data, null, 'Pear')
    data = add(data, null, 'Apples')
    data = add(data, null, 'Bananas')

    expect(getEntries(data, 'note-1', null).map((entry) => entry.text)).toEqual(['Apples', 'Bananas', 'Pear'])
  })

  it('suggests categories for English, Swedish, and unknown item names', () => {
    expect(suggestGroceryCategory('Tomatoes')).toBe('produce')
    expect(suggestGroceryCategory('Mjölk')).toBe('dairy-eggs')
    expect(suggestGroceryCategory('Blåbär')).toBe('produce')
    expect(suggestGroceryCategory('fryst broccoli')).toBe('frozen')
    expect(suggestGroceryCategory('Beer')).toBe('systembolaget')
    expect(suggestGroceryCategory('Rött vin')).toBe('systembolaget')
    expect(suggestGroceryCategory('alkoholfri öl')).toBe('beverages')
    expect(suggestGroceryCategory('something unfamiliar')).toBe('other')
  })

  it('allows category corrections that persist when the item is renamed', () => {
    let data = add(checklist(), null, 'Mjölk')
    const milk = getEntries(data, 'note-1', null)[0]
    data = setEntryCategory(data, milk.id, 'produce')

    const result = updateEntryText(data, milk.id, 'Äpplen')

    expect(result.data.entries[0]).toMatchObject({ category: 'produce', categoryManual: true, text: 'Äpplen' })
  })

  it('restores original text captured by autocorrect', () => {
    const result = createEntry(checklist(), 'note-1', null, 'check', 'The apples', ' Teh apples ')
    const entry = result.data.entries[0]

    expect(entry.originalText).toBe('Teh apples')
    const reverted = revertEntryText(result.data, entry.id)

    expect(reverted.error).toBeUndefined()
    expect(reverted.data.entries[0]).toMatchObject({ text: 'Teh apples', originalText: null })
  })

  it('categorizes nested check entries but leaves free-text uncategorized', () => {
    let data = add(checklist(), null, 'Fruit')
    const fruit = getEntries(data, 'note-1', null)[0]
    data = add(data, fruit.id, 'Apples')
    data = add(data, null, 'Shopping note', 'text')

    expect(data.entries.find((entry) => entry.text === 'Fruit')?.category).toBe('produce')
    expect(data.entries.find((entry) => entry.text === 'Apples')?.category).toBe('produce')
    expect(data.entries.find((entry) => entry.text === 'Shopping note')?.category).toBeNull()
  })

  it('rejects case-insensitive duplicates after trimming in the same sibling list', () => {
    const data = add(checklist(), null, '  Oat milk  ')
    const result = createEntry(data, 'note-1', null, 'check', 'oAT MILK')

    expect(result.error).toBe('That item is already in this list.')
    expect(result.data).toBe(data)
  })

  it('allows the same label in another branch and as a text entry', () => {
    let data = add(checklist(), null, 'Breakfast')
    const parent = getEntries(data, 'note-1', null)[0]
    data = add(data, parent.id, 'Coffee')
    data = add(data, null, 'Coffee', 'text')
    const secondBranch = add(data, null, 'Weekend')
    const weekend = getEntries(secondBranch, 'note-1', null).find((entry) => entry.text === 'Weekend')!
    const result = createEntry(secondBranch, 'note-1', weekend.id, 'check', 'coffee')

    expect(result.error).toBeUndefined()
  })

  it('rejects a rename that would duplicate a sibling', () => {
    let data = add(checklist(), null, 'Apples')
    data = add(data, null, 'Bananas')
    const banana = getEntries(data, 'note-1', null).find((entry) => entry.text === 'Bananas')!
    const result = updateEntryText(data, banana.id, ' apples ')

    expect(result.error).toBe('That item is already in this list.')
    expect(getEntries(result.data, 'note-1', null).map((entry) => entry.text)).toEqual(['Apples', 'Bananas'])
  })

  it('switches a sibling list to manual order after a move and appends new entries', () => {
    let data = checklist()
    data = add(data, null, 'Apples')
    data = add(data, null, 'Bananas')
    data = add(data, null, 'Cherries')
    const root = getEntries(data, 'note-1', null)
    data = reorderEntry(data, root[0].id, root[2].id)
    data = add(data, null, 'Dates')

    expect(getEntries(data, 'note-1', null).map((entry) => entry.text)).toEqual(['Bananas', 'Cherries', 'Apples', 'Dates'])
    expect(data.notes[0].sortModes.root).toBe('manual')
  })

  it('restores alphabetical order when requested', () => {
    let data = checklist()
    data = add(data, null, 'Apples')
    data = add(data, null, 'Cherries')
    data = add(data, null, 'Bananas')
    const root = getEntries(data, 'note-1', null)
    data = reorderEntry(data, root[0].id, root[2].id)
    data = setSortMode(data, 'note-1', null, 'alphabetical')

    expect(getEntries(data, 'note-1', null).map((entry) => entry.text)).toEqual(['Apples', 'Bananas', 'Cherries'])
    expect(data.notes[0].sortModes.root).toBe('alphabetical')
  })
})