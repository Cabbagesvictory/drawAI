/** 图纸本地存储（IndexedDB via idb） */
import { openDB, type IDBPDatabase } from 'idb'
import type { DiagramRecord } from '../types'

const DB_NAME = 'drawai'
const STORE = 'diagrams'
const LAST_ID_KEY = 'drawai.lastDiagramId'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      },
    })
  }
  return dbPromise
}

export function newId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function listDiagrams(): Promise<DiagramRecord[]> {
  const db = await getDb()
  const all = (await db.getAll(STORE)) as DiagramRecord[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDiagram(id: string): Promise<DiagramRecord | undefined> {
  const db = await getDb()
  return (await db.get(STORE, id)) as DiagramRecord | undefined
}

export async function putDiagram(record: DiagramRecord): Promise<void> {
  const db = await getDb()
  await db.put(STORE, record)
}

export async function deleteDiagram(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, id)
}

/** 记录/读取最后打开的图纸 id（localStorage 即可） */
export function setLastDiagramId(id: string | null): void {
  if (id == null) localStorage.removeItem(LAST_ID_KEY)
  else localStorage.setItem(LAST_ID_KEY, id)
}

export function getLastDiagramId(): string | null {
  return localStorage.getItem(LAST_ID_KEY)
}

/** 生成空白 drawio 图的 XML（A4 横向页面） */
export function createBlankXml(): string {
  return [
    '<mxfile host="drawai" agent="drawai" version="1.0" type="device">',
    '  <diagram id="page-1" name="Page-1">',
    '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">',
    '      <root>',
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
  ].join('\n')
}

export function createDiagramRecord(name = '未命名画布'): DiagramRecord {
  const now = Date.now()
  return {
    id: newId(),
    name,
    xml: createBlankXml(),
    createdAt: now,
    updatedAt: now,
  }
}
