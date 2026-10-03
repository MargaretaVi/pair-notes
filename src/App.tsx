import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  FileText,
  ListChecks,
  LockKeyhole,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  createEntry,
  createNote,
  createSpaceData,
  deleteEntry,
  deleteNote,
  getEntries,
  reorderEntry,
  setSortMode,
  toggleEntry,
  updateEntryText,
  updateNote,
  type EntryKind,
  type NoteKind,
  type SpaceData,
} from './model'
import {
  createSharedSpace as createRemoteSpace,
  deleteSharedSpace,
  pullSpace,
  pushSpace,
  rotateSpaceLink,
} from './api'
import './App.css'

const STORAGE_PREFIX = 'pair-notes:'
const ROOT = 'root'

function getSpaceId(): string | null {
  return new URLSearchParams(window.location.search).get('space')
}

function getAccessToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('access')
}

function readSpace(id: string | null): SpaceData | null {
  if (!id) return null
  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
    return saved ? JSON.parse(saved) as SpaceData : null
  } catch {
    return null
  }
}

function mergeSpaceData(local: SpaceData, remote: SpaceData): SpaceData {
  let changed = false
  const merge = <T extends { id: string; updatedAt: number }>(localItems: T[], remoteItems: T[]): T[] => {
    const items = new Map(localItems.map((item) => [item.id, item]))
    for (const remoteItem of remoteItems) {
      const localItem = items.get(remoteItem.id)
      if (!localItem || remoteItem.updatedAt > localItem.updatedAt) {
        items.set(remoteItem.id, remoteItem)
        changed = true
      }
    }
    return [...items.values()]
  }
  const notes = merge(local.notes, remote.notes)
  const entries = merge(local.entries, remote.entries)
  return changed ? { ...local, notes, entries } : local
}

function App() {
  const [spaceId, setSpaceId] = useState(getSpaceId)
  const [accessToken, setAccessToken] = useState(getAccessToken)
  const [data, setData] = useState<SpaceData | null>(() => readSpace(getSpaceId()))
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => readSpace(getSpaceId())?.notes.find((note) => !note.deleted)?.id ?? null)
  const [remoteReady, setRemoteReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'saved' | 'syncing' | 'offline'>('saved')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [newNoteKind, setNewNoteKind] = useState<NoteKind | null>(null)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [addParentId, setAddParentId] = useState<'closed' | null | string>('closed')
  const [entryKind, setEntryKind] = useState<EntryKind>('check')
  const [entryDraft, setEntryDraft] = useState('')
  const [entryError, setEntryError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (spaceId && data) localStorage.setItem(`${STORAGE_PREFIX}${spaceId}`, JSON.stringify(data))
  }, [spaceId, data])

  useEffect(() => {
    if (!spaceId || !accessToken) {
      setRemoteReady(false)
      return
    }
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      setSyncStatus('syncing')
      try {
        const remote = await pullSpace(spaceId, accessToken)
        if (!active) return
        setData((current) => mergeSpaceData(current ?? createSpaceData(spaceId), remote))
        setRemoteReady(true)
        setSyncStatus('saved')
        setActionError('')
      } catch (error) {
        if (!active) return
        setSyncStatus('offline')
        setRemoteReady(false)
        setActionError(error instanceof Error ? error.message : 'Could not connect to the shared space.')
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [spaceId, accessToken])

  useEffect(() => {
    if (!remoteReady || !spaceId || !accessToken || !data) return
    const timer = window.setTimeout(() => {
      void pushSpace(data, accessToken).then(() => {
        setSyncStatus('saved')
        setActionError('')
      }).catch((error: unknown) => {
        setSyncStatus('offline')
        setActionError(error instanceof Error ? error.message : 'Changes are saved on this device and will retry.')
      })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [remoteReady, spaceId, accessToken, data])

  const notes = data?.notes.filter((note) => !note.deleted).sort((left, right) => left.position - right.position) ?? []
  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0] ?? null

  async function createSharedSpace() {
    setBusy(true)
    setActionError('')
    try {
      const credentials = await createRemoteSpace(spaceName.trim() || undefined)
      const fresh = createSpaceData(credentials.id)
      setSpaceId(credentials.id)
      setAccessToken(credentials.accessToken)
      setData(fresh)
      setActiveNoteId(null)
      setRemoteReady(true)
      window.history.replaceState(null, '', `${window.location.pathname}?space=${encodeURIComponent(credentials.id)}#access=${credentials.accessToken}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create the shared space. Start the API service and try again.')
    } finally {
      setBusy(false)
    }
  }

  function saveNote(kind: NoteKind) {
    if (!data || !newNoteTitle.trim()) return
    const noteId = crypto.randomUUID()
    const updated = createNote(data, newNoteTitle, kind, noteId)
    setData(updated)
    setActiveNoteId(noteId)
    setNewNoteTitle('')
    setNewNoteKind(null)
  }

  function removeNote(noteId: string) {
    if (!data || !window.confirm('Delete this note?')) return
    const next = deleteNote(data, noteId)
    setData(next)
    if (activeNoteId === noteId) setActiveNoteId(next.notes.find((note) => !note.deleted)?.id ?? null)
  }

  function addEntry(noteId: string, parentId: string | null) {
    if (!data) return
    const result = createEntry(data, noteId, parentId, entryKind, entryDraft)
    if (result.error) {
      setEntryError(result.error)
      return
    }
    setData(result.data)
    setEntryDraft('')
    setEntryError('')
  }

  function shareLink(): string {
    if (!spaceId || !accessToken) return ''
    return `${window.location.origin}${window.location.pathname}?space=${encodeURIComponent(spaceId)}#access=${accessToken}`
  }

  async function copyLink() {
    const link = shareLink()
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setActionError('Clipboard access was blocked. Copy the link from the field instead.')
    }
  }

  async function replaceLink() {
    if (!spaceId || !accessToken || !window.confirm('The current link will stop working. Create a replacement link?')) return
    setBusy(true)
    try {
      const credentials = await rotateSpaceLink(spaceId, accessToken)
      setAccessToken(credentials.accessToken)
      window.history.replaceState(null, '', `${window.location.pathname}?space=${encodeURIComponent(spaceId)}#access=${credentials.accessToken}`)
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not replace the link.')
    } finally {
      setBusy(false)
    }
  }

  async function removeSpace() {
    if (!spaceId || !accessToken || !window.confirm('Permanently delete this shared space and all its notes?')) return
    setBusy(true)
    try {
      await deleteSharedSpace(spaceId, accessToken)
      localStorage.removeItem(`${STORAGE_PREFIX}${spaceId}`)
      setSpaceId(null)
      setAccessToken(null)
      setData(null)
      setActiveNoteId(null)
      setShareOpen(false)
      setRemoteReady(false)
      window.history.replaceState(null, '', window.location.pathname)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the shared space.')
    } finally {
      setBusy(false)
    }
  }

  function renderEntryGroup(noteId: string, parentId: string | null, depth = 0): ReactNode {
    if (!data) return null
    const entries = getEntries(data, noteId, parentId)
    const note = data.notes.find((item) => item.id === noteId)
    const mode = note?.sortModes[parentId ?? ROOT] ?? 'alphabetical'
    return (
      <div className={`entry-group${depth ? ' nested-group' : ''}`}>
        {depth > 0 && entries.length > 0 && (
          <div className="nested-order" aria-label="Nested list order">
            <button className={mode === 'alphabetical' ? 'selected' : ''} onClick={() => setData(setSortMode(data, noteId, parentId, 'alphabetical'))}>A–Z</button>
            <button className={mode === 'manual' ? 'selected' : ''} onClick={() => setData(setSortMode(data, noteId, parentId, 'manual'))}>Manual</button>
          </div>
        )}
        {entries.map((entry, index) => {
          const children = getEntries(data, noteId, entry.id)
          return (
            <div className={`entry-wrap${entry.checked ? ' is-checked' : ''}`} key={entry.id}>
              <div className="entry-row">
                {entry.kind === 'check' ? (
                  <button className="check-control" aria-label={entry.checked ? `Mark ${entry.text} incomplete` : `Complete ${entry.text}`} onClick={() => setData(toggleEntry(data, entry.id))}>
                    {entry.checked && <Check size={15} strokeWidth={3} />}
                  </button>
                ) : <span className="text-marker" aria-hidden="true">—</span>}
                <button className="entry-label" onDoubleClick={() => {
                  const edited = window.prompt('Edit item', entry.text)
                  if (edited !== null) {
                    const result = updateEntryText(data, entry.id, edited)
                    if (result.error) setEntryError(result.error)
                    else { setData(result.data); setEntryError('') }
                  }
                }} title="Double-click to edit">{entry.text}</button>
                <div className="entry-actions">
                  <button className="icon-button small" aria-label={`Add child to ${entry.text}`} title="Add nested item" onClick={() => { setAddParentId(entry.id); setEntryError('') }}><Plus size={16} /></button>
                  <button className="icon-button small" aria-label={`Move ${entry.text} up`} disabled={index === 0} onClick={() => setData(reorderEntry(data, entry.id, entries[index - 1]?.id ?? entry.id))}><ArrowUp size={15} /></button>
                  <button className="icon-button small" aria-label={`Move ${entry.text} down`} disabled={index === entries.length - 1} onClick={() => setData(reorderEntry(data, entry.id, entries[index + 1]?.id ?? entry.id))}><ArrowDown size={15} /></button>
                  <button className="icon-button small danger-action" aria-label={`Delete ${entry.text}`} onClick={() => setData(deleteEntry(data, entry.id))}><Trash2 size={15} /></button>
                </div>
              </div>
              {(children.length > 0 || addParentId === entry.id) && renderEntryGroup(noteId, entry.id, depth + 1)}
            </div>
          )
        })}
        {parentId === null && (
          <div className="root-order">
            <span>Order</span>
            <button className={mode === 'alphabetical' ? 'selected' : ''} onClick={() => setData(setSortMode(data, noteId, null, 'alphabetical'))}>Alphabetical</button>
            <button className={mode === 'manual' ? 'selected' : ''} onClick={() => setData(setSortMode(data, noteId, null, 'manual'))}>Manual</button>
          </div>
        )}
        {addParentId === parentId && (
          <form className="entry-composer" onSubmit={(event) => { event.preventDefault(); addEntry(noteId, parentId) }}>
            <div className="entry-kind-switch" role="group" aria-label="Entry type">
              <button type="button" className={entryKind === 'check' ? 'selected' : ''} onClick={() => setEntryKind('check')}>Checkable</button>
              <button type="button" className={entryKind === 'text' ? 'selected' : ''} onClick={() => setEntryKind('text')}>Text</button>
            </div>
            <div className="entry-input-row">
              <input autoFocus value={entryDraft} onChange={(event) => { setEntryDraft(event.target.value); setEntryError('') }} placeholder={entryKind === 'check' ? 'Add an item' : 'Add a text line'} aria-label="New checklist entry" />
              <button className="icon-button add-entry-button" type="submit" aria-label="Add entry"><Plus size={18} /></button>
              <button className="icon-button" type="button" aria-label="Cancel adding entry" onClick={() => { setAddParentId('closed'); setEntryError('') }}><X size={18} /></button>
            </div>
            {entryError && <p className="field-error" role="alert">{entryError}</p>}
          </form>
        )}
      </div>
    )
  }

  if (spaceId && !data) {
    return (
      <main className="welcome-screen">
        <div className="welcome-top"><div className="brand-mark"><Sparkles size={17} /></div><span>pair notes</span></div>
        <section className="welcome-content access-message">
          <p className="eyebrow">PRIVATE SPACE</p>
          <h1>{accessToken ? 'Opening your notes.' : 'This link is incomplete.'}</h1>
          <p className="welcome-copy">{actionError || (accessToken ? 'Connecting securely to the shared space…' : 'Open the full private link you received to join this space.')}</p>
          {actionError && <button className="primary-button" onClick={() => window.location.reload()}>Try again</button>}
        </section>
      </main>
    )
  }

  if (!spaceId || !data) {
    return (
      <main className="welcome-screen">
        <div className="welcome-top"><div className="brand-mark"><Sparkles size={17} /></div><span>pair notes</span><span className="private-label"><LockKeyhole size={13} /> private link</span></div>
        <section className="welcome-content">
          <p className="eyebrow">A shared space for two</p>
          <h1>Keep the little things<br /><em>in one place.</em></h1>
          <p className="welcome-copy">Notes and checklists, shared with one private link. No accounts to set up.</p>
          <form className="create-space-form" onSubmit={(event) => { event.preventDefault(); void createSharedSpace() }}>
            <label htmlFor="space-name">Optional space name</label>
            <input id="space-name" aria-describedby="space-name-help" autoComplete="off" disabled={busy} maxLength={32} minLength={3} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="e.g. weekend-plans" value={spaceName} onChange={(event) => setSpaceName(event.target.value.toLowerCase().replace(/\s+/g, '-'))} />
            <p id="space-name-help">3–32 lowercase letters, numbers, or hyphens. It appears in the URL; the private link is still required.</p>
            <button className="primary-button create-space-button" disabled={busy} type="submit"><Plus size={18} /> {busy ? 'Creating…' : 'Create a shared space'}</button>
          </form>
          {actionError && <p className="field-error welcome-error" role="alert">{actionError}</p>}
          <div className="welcome-foot"><LockKeyhole size={14} /><span>Anyone with your link can view and edit.</span></div>
        </section>
        <div className="welcome-aside"><span className="aside-number">01</span><span>NOTES FOR BOTH OF YOU</span><span className="aside-line" /></div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark"><Sparkles size={16} /></div><span>pair notes</span><span className="pair-dot" /></div>
        <div className="space-switcher"><span className="space-avatar">{(spaceId[0] ?? 'P').toUpperCase()}</span><div><strong>Shared space</strong><span>Just the two of you</span></div><ChevronRight size={16} /></div>
        <div className="sidebar-heading"><span>YOUR NOTES</span><span>{notes.length.toString().padStart(2, '0')}</span></div>
        <nav className="note-navigation" aria-label="Notes">
          {notes.map((note) => (
            <button key={note.id} className={`note-nav-item${note.id === activeNote?.id ? ' active' : ''}`} onClick={() => setActiveNoteId(note.id)}>
              <span className={`note-type-icon ${note.kind}`}>{note.kind === 'checklist' ? <ListChecks size={16} /> : <FileText size={16} />}</span>
              <span className="nav-note-title">{note.title || 'Untitled'}</span>
              <span className="nav-note-count">{note.kind === 'checklist' ? getEntries(data, note.id, null).length : ''}</span>
            </button>
          ))}
        </nav>
        {newNoteKind ? (
          <form className="new-note-form" onSubmit={(event) => { event.preventDefault(); saveNote(newNoteKind) }}>
            <label htmlFor="new-note-title">{newNoteKind === 'checklist' ? 'New checklist' : 'New text note'}</label>
            <input id="new-note-title" autoFocus value={newNoteTitle} onChange={(event) => setNewNoteTitle(event.target.value)} placeholder="Give it a name" />
            <div><button type="submit" className="tiny-primary">Create</button><button type="button" className="tiny-plain" onClick={() => setNewNoteKind(null)}>Cancel</button></div>
          </form>
        ) : (
          <div className="new-note-area">
            <button className="new-note-button" onClick={() => setNewNoteKind('text')}><Plus size={16} /> New note</button>
            <button className="new-checklist-button" onClick={() => setNewNoteKind('checklist')}><ListChecks size={16} /> New checklist</button>
          </div>
        )}
        <div className="sidebar-bottom"><span className={`sync-indicator ${syncStatus}`}><span />{syncStatus === 'saved' ? 'Synced just now' : syncStatus === 'syncing' ? 'Syncing changes' : 'Offline · saved here'}</span><button className="share-link-button" onClick={() => setShareOpen(true)}><Share2 size={15} /> Share space</button></div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div className="mobile-brand"><div className="brand-mark"><Sparkles size={15} /></div><span>pair notes</span></div><div className="topbar-space"><span className={`online-dot ${syncStatus}`} /> Shared space</div><button className="top-share-button" onClick={() => setShareOpen(true)}><Share2 size={16} /><span>Invite your person</span></button></header>
        {activeNote ? (
          <article className={`note-editor ${activeNote.kind === 'checklist' ? 'checklist-editor' : 'text-editor'}`}>
            <div className="note-kicker"><span className={`note-type-icon ${activeNote.kind}`}>{activeNote.kind === 'checklist' ? <ListChecks size={16} /> : <FileText size={16} />}</span><span>{activeNote.kind === 'checklist' ? 'CHECKLIST' : 'TEXT NOTE'}</span><button className="delete-note" onClick={() => removeNote(activeNote.id)} aria-label="Delete note" title="Delete note"><Trash2 size={16} /></button></div>
            <input className="note-title-input" aria-label="Note title" value={activeNote.title} onChange={(event) => setData(updateNote(data, activeNote.id, { title: event.target.value }))} placeholder="Untitled note" />
            {activeNote.kind === 'text' ? (
              <div className="text-note-content"><textarea key={activeNote.id} defaultValue={activeNote.body} onBlur={(event) => setData(updateNote(data, activeNote.id, { body: event.target.value }))} placeholder="Start writing here…" aria-label="Note text" /><div className="text-note-footer"><span>Plain text</span><span>Shared with your person</span></div></div>
            ) : (
              <div className="checklist-content">
                <div className="checklist-intro"><span>Small things, handled together.</span><span>{getEntries(data, activeNote.id, null).filter((entry) => entry.checked).length} / {getEntries(data, activeNote.id, null).filter((entry) => entry.kind === 'check').length} done</span></div>
                {renderEntryGroup(activeNote.id, null)}
                {addParentId === 'closed' && <button className="add-root-entry" onClick={() => { setAddParentId(null); setEntryKind('check'); setEntryError('') }}><Plus size={17} /> Add an item</button>}
              </div>
            )}
          </article>
        ) : (
          <section className="empty-notes"><div className="empty-icon"><FileText size={22} /></div><p className="eyebrow">YOUR SHARED SPACE</p><h1>Start with a note.</h1><p>Create a text note or a checklist. Your person can join with the link.</p><button className="primary-button" onClick={() => setNewNoteKind('text')}><Plus size={17} /> Create your first note</button></section>
        )}
        <footer className="main-footer"><span>PRIVATE BY LINK</span><span className="footer-lock"><LockKeyhole size={13} /> Only people with the link can open this space</span></footer>
      </main>

      {shareOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false) }}>
          <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <button className="modal-close icon-button" onClick={() => setShareOpen(false)} aria-label="Close sharing dialog"><X size={18} /></button>
            <div className="modal-icon"><Share2 size={19} /></div><p className="eyebrow">PASS IT ALONG</p><h2 id="share-title">Invite your person.</h2><p className="modal-copy">This private link gives anyone who has it access to view and edit your notes.</p>
            <div className="share-link-field"><span>{shareLink()}</span><button onClick={() => void copyLink()} aria-label="Copy private link"><Copy size={16} />{copied ? 'Copied' : 'Copy'}</button></div>
            {actionError && <p className="field-error" role="alert">{actionError}</p>}
            <p className="share-warning"><LockKeyhole size={14} /> Keep this link between the two of you.</p>
            <div className="share-management"><button disabled={busy} onClick={() => void replaceLink()}>Replace private link</button><button disabled={busy} className="remove-space-button" onClick={() => void removeSpace()}>Delete shared space</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
