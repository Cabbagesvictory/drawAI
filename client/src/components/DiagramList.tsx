/** 图纸列表（多画布管理） */
import { useState } from 'react'
import { LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import type { DiagramRecord } from '../types'

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  const d = new Date(ts)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今天 ${hm}`
  return `${d.getMonth() + 1}-${d.getDate()} ${hm}`
}

function DiagramItem({
  record,
  active,
  editing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}: {
  record: DiagramRecord
  active: boolean
  editing: boolean
  onStartEdit: () => void
  onCommitEdit: (name: string) => void
  onCancelEdit: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(record.name)

  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg border p-2 transition-colors ${
        active
          ? 'border-blue-300 bg-blue-50'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-100'
      }`}
      onClick={() => {
        if (!editing && !active) useAppStore.getState().selectDiagram(record.id)
      }}
      onDoubleClick={onStartEdit}
    >
      <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
        {record.thumbnail ? (
          <img src={record.thumbnail} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <LayoutGrid size={16} className="text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            className="w-full rounded border border-blue-300 px-1 py-0.5 text-sm outline-none"
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit(draft)
              if (e.key === 'Escape') onCancelEdit()
            }}
            onBlur={() => onCommitEdit(draft)}
          />
        ) : (
          <div className={`truncate text-sm ${active ? 'font-medium text-blue-900' : 'text-slate-700'}`}>
            {record.name}
          </div>
        )}
        <div className="mt-0.5 text-xs text-slate-400">{formatTime(record.updatedAt)}</div>
      </div>
      {!editing && (
        <div className="absolute right-1.5 top-1.5 hidden gap-0.5 rounded-md bg-white/95 p-0.5 shadow-sm group-hover:flex">
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="重命名"
            onClick={(e) => {
              e.stopPropagation()
              setDraft(record.name)
              onStartEdit()
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="删除"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

export function DiagramList() {
  const diagrams = useAppStore((s) => s.diagrams)
  const currentId = useAppStore((s) => s.currentId)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-11 items-center justify-between border-b border-slate-200 px-3">
        <span className="text-sm font-semibold text-slate-700">我的画布</span>
        <button
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
          title="新建画布"
          onClick={() => void useAppStore.getState().createDiagram()}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {diagrams.map((record) => (
          <DiagramItem
            key={record.id}
            record={record}
            active={record.id === currentId}
            editing={editingId === record.id}
            onStartEdit={() => setEditingId(record.id)}
            onCommitEdit={(name) => {
              setEditingId(null)
              if (name.trim() && name !== record.name) {
                void useAppStore.getState().renameDiagram(record.id, name)
              }
            }}
            onCancelEdit={() => setEditingId(null)}
            onDelete={() => {
              if (window.confirm(`确定删除画布「${record.name}」吗？此操作不可恢复。`)) {
                void useAppStore.getState().removeDiagram(record.id)
              }
            }}
          />
        ))}
      </div>
    </aside>
  )
}
