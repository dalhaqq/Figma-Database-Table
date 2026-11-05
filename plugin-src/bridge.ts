// Bridge between this widget and other plugins (e.g. Figma Console MCP).
//
// Everything is stored as sharedPluginData on the widget node, namespace "erd":
//   - "state":  mirror of this widget's table, rewritten whenever it changes.
//   - "inbox":  written by other plugins; applied by the "Sync dari AI" action.
//   - "status": result of the last "Sync dari AI" run.
//
// See MCP_INTEGRATION.md for the full JSON convention.

import { Column, ColumnReference } from "./column"
import { Index } from "./index"
import { KeyType } from "./key"
import { defaultSizes } from "./size"

export const NAMESPACE = "erd"
export const KEY_STATE = "state"
export const KEY_INBOX = "inbox"
export const KEY_STATUS = "status"

// Bump when the JSON format changes in a non backwards compatible way.
export const FORMAT_VERSION = 1

// Horizontal gap between widgets created from a multi-table inbox.
export const CLONE_GAP = 80

const INDEX_KEY_TYPES: KeyType[] = ["primary", "foreign", "unique", "index"]
const COLUMN_KEY_TYPES: Column["keyType"][] = [...INDEX_KEY_TYPES, "normal"]
const SIZE_OPTIONS: string[] = defaultSizes.map((size) => size.option)

export interface TableData {
  tableName: string | null
  color: HexCode
  size: string
  columns: Column[]
  indexes: Index[]
}

export interface StateDocument extends TableData {
  version: number
}

export interface InboxTable {
  tableName?: string | null
  color?: string
  size?: string | number
  columns?: unknown[]
  indexes?: unknown[]
}

export interface InboxDocument {
  version: number
  tables: InboxTable[]
}

export interface StatusDocument {
  version: number
  ok: boolean
  message: string
  at: string
  widgets: { nodeId: string, tableName: string | null }[]
}

export class BridgeError extends Error {}

function fail(message: string): never {
  throw new BridgeError(message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function has(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

// Builds the "state" document with a fixed key order, so equal tables always
// serialize to the same string.
export function toStateDocument(table: TableData): StateDocument {
  return {
    version: FORMAT_VERSION,
    tableName: table.tableName,
    color: table.color,
    size: table.size,
    columns: table.columns.map((column) => {
      const result: Column = {
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        keyType: column.keyType,
      }
      if (column.references) {
        result.references = {
          table: column.references.table,
          column: column.references.column,
        }
      }
      return result
    }),
    indexes: table.indexes.map((index) => ({
      name: index.name.slice(),
      keyType: index.keyType,
    })),
  }
}

export function serializeState(table: TableData): string {
  return JSON.stringify(toStateDocument(table))
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateReference(value: unknown, where: string): ColumnReference {
  if (!isObject(value)) {
    fail(`${where}.references harus berupa objek { table, column }`)
  }
  const { table, column } = value
  if (typeof table !== "string" || table.trim() === "") {
    fail(`${where}.references.table harus berupa string tidak kosong`)
  }
  if (typeof column !== "string" || column.trim() === "") {
    fail(`${where}.references.column harus berupa string tidak kosong`)
  }
  return { table, column }
}

function validateColumn(value: unknown, where: string): Column {
  if (!isObject(value)) {
    fail(`${where} harus berupa objek`)
  }

  const { name, type } = value
  if (typeof name !== "string" || name.trim() === "") {
    fail(`${where}.name harus berupa string tidak kosong`)
  }
  if (typeof type !== "string" || type.trim() === "") {
    fail(`${where}.type harus berupa string tidak kosong`)
  }

  const nullable = has(value, "nullable") ? value.nullable : false
  if (typeof nullable !== "boolean") {
    fail(`${where}.nullable harus berupa boolean`)
  }

  const keyType = has(value, "keyType") ? value.keyType : "normal"
  if (COLUMN_KEY_TYPES.indexOf(keyType as Column["keyType"]) === -1) {
    fail(`${where}.keyType harus salah satu dari: ${COLUMN_KEY_TYPES.join(", ")}`)
  }

  const column: Column = {
    name,
    type,
    nullable,
    keyType: keyType as Column["keyType"],
  }
  if (has(value, "references") && value.references !== null) {
    column.references = validateReference(value.references, where)
  }
  return column
}

function validateIndex(value: unknown, where: string, columnNames: string[]): Index {
  if (!isObject(value)) {
    fail(`${where} harus berupa objek`)
  }

  const { name, keyType } = value
  if (!Array.isArray(name) || name.length === 0) {
    fail(`${where}.name harus berupa array nama kolom yang tidak kosong`)
  }
  name.forEach((columnName, position) => {
    if (typeof columnName !== "string") {
      fail(`${where}.name[${position}] harus berupa string`)
    }
    if (columnNames.indexOf(columnName) === -1) {
      fail(`${where}.name[${position}] merujuk ke kolom "${columnName}" yang tidak ada`)
    }
  })
  if (INDEX_KEY_TYPES.indexOf(keyType as KeyType) === -1) {
    fail(`${where}.keyType harus salah satu dari: ${INDEX_KEY_TYPES.join(", ")}`)
  }

  return {
    name: (name as string[]).slice(),
    keyType: keyType as KeyType,
  }
}

// Merges one inbox table on top of a base table and validates the result.
// Keys missing from the inbox table keep the base value.
export function resolveTable(input: unknown, base: TableData, where: string): TableData {
  if (!isObject(input)) {
    fail(`${where} harus berupa objek`)
  }

  let tableName = base.tableName
  if (has(input, "tableName")) {
    if (input.tableName !== null && typeof input.tableName !== "string") {
      fail(`${where}.tableName harus berupa string atau null`)
    }
    tableName = input.tableName as string | null
  }

  let color = base.color
  if (has(input, "color")) {
    if (typeof input.color !== "string" || !/^#[0-9a-f]{6}$/i.test(input.color)) {
      fail(`${where}.color harus berupa hex 6 digit, contoh "#0D99FF"`)
    }
    color = input.color.toUpperCase() as HexCode
  }

  let size = base.size
  if (has(input, "size")) {
    size = String(input.size)
    if (SIZE_OPTIONS.indexOf(size) === -1) {
      fail(`${where}.size harus salah satu dari: ${SIZE_OPTIONS.join(", ")}`)
    }
  }

  let columns = base.columns
  if (has(input, "columns")) {
    if (!Array.isArray(input.columns)) {
      fail(`${where}.columns harus berupa array`)
    }
    columns = input.columns.map((column, position) =>
      validateColumn(column, `${where}.columns[${position}]`))
  }

  const columnNames = columns.map((column) => column.name)
  columnNames.forEach((name, position) => {
    if (columnNames.indexOf(name) !== position) {
      fail(`${where}.columns: nama kolom "${name}" duplikat`)
    }
  })

  let indexes = base.indexes
  if (has(input, "indexes")) {
    if (!Array.isArray(input.indexes)) {
      fail(`${where}.indexes harus berupa array`)
    }
    indexes = input.indexes.map((index, position) =>
      validateIndex(index, `${where}.indexes[${position}]`, columnNames))
  } else {
    // Indexes kept from the base table must still point to existing columns.
    indexes.forEach((index, position) =>
      validateIndex(index, `${where}.indexes[${position}] (lama)`, columnNames))
  }

  return { tableName, color, size, columns, indexes }
}

// Parses the raw "inbox" string. Returns null when the inbox is empty.
export function parseInbox(raw: string): InboxDocument | null {
  if (raw.trim() === "") {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    fail(`inbox bukan JSON yang valid: ${(error as Error).message}`)
  }

  if (!isObject(parsed)) {
    fail("inbox harus berupa objek { version, tables }")
  }
  if (typeof parsed.version !== "number" || parsed.version < 1) {
    fail("inbox.version harus berupa angka >= 1")
  }
  if (parsed.version > FORMAT_VERSION) {
    fail(`inbox.version ${parsed.version} belum didukung (maksimal ${FORMAT_VERSION}); perbarui widget`)
  }
  if (!Array.isArray(parsed.tables) || parsed.tables.length === 0) {
    fail("inbox.tables harus berupa array berisi minimal satu tabel")
  }

  return {
    version: parsed.version,
    tables: parsed.tables as InboxTable[],
  }
}

// ---------------------------------------------------------------------------
// Node access
// ---------------------------------------------------------------------------

export async function getWidgetNode(nodeId: string): Promise<WidgetNode> {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || node.type !== "WIDGET") {
    fail("node widget tidak ditemukan")
  }
  return node
}

// Writes the "state" mirror only when it actually changed, to avoid needless
// document edits (and undo history entries) on every render.
export function writeState(node: BaseNode, table: TableData): void {
  const serialized = serializeState(table)
  if (node.getSharedPluginData(NAMESPACE, KEY_STATE) !== serialized) {
    node.setSharedPluginData(NAMESPACE, KEY_STATE, serialized)
  }
}

export function writeStatus(node: BaseNode, status: Omit<StatusDocument, "version" | "at">): void {
  const document: StatusDocument = {
    version: FORMAT_VERSION,
    ok: status.ok,
    message: status.message,
    at: new Date().toISOString(),
    widgets: status.widgets,
  }
  node.setSharedPluginData(NAMESPACE, KEY_STATUS, JSON.stringify(document))
}

export function clearInbox(node: BaseNode): void {
  node.setSharedPluginData(NAMESPACE, KEY_INBOX, "")
}

// Maps table data to this widget's synced state keys (see app.tsx).
export function toSyncedState(table: TableData): { [key: string]: unknown } {
  return {
    theme: table.color,
    size: table.size,
    tableName: table.tableName,
    columns: table.columns,
    indexes: table.indexes,
  }
}
