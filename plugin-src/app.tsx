import { defaultHeaderColors } from "./color"
import {
  KeyColumn,
  Column,
} from "./column"
import {
  KeyIndexes,
  Index,
} from "./index"
import Header from "./header"
import { defaultSizes } from "./size"
import {
  BridgeError,
  CLONE_GAP,
  KEY_INBOX,
  KEY_STATUS,
  NAMESPACE,
  TableData,
  clearInbox,
  getWidgetNode,
  parseInbox,
  resolveTable,
  toSyncedState,
  writeState,
  writeStatus,
} from "./bridge"

const { widget } = figma
const {
  // Components
  AutoLayout,

  // Hooks
  useEffect,
  usePropertyMenu,
  useSyncedState,
  useWidgetNodeId,

  // Funtions
  register,
  waitForTask,
} = widget

const startColor: HexCode = defaultHeaderColors[Math.floor(Math.random() * defaultHeaderColors.length)].option

function DatabaseTableWidget() {
  const [color, setColor] = useSyncedState("theme", startColor)
  const [size, setSize] = useSyncedState("size", "400")
  const [tableName, setTableName] = useSyncedState("tableName", null)
  const [columns, setColumns] = useSyncedState("columns", (): Column[] => [])
  const [indexes, setIndexes] = useSyncedState("indexes", (): Index[] => [])
  const widgetNodeId = useWidgetNodeId()

  const currentTable: TableData = {
    tableName,
    color,
    size,
    columns,
    indexes,
  }

  // Mirror the table into sharedPluginData ("erd" / "state") after every
  // render, so changes from any editor or from "Sync dari AI" are visible to
  // other plugins. writeState only touches the document when data changed.
  useEffect(() => {
    waitForTask(
      getWidgetNode(widgetNodeId)
        .then((node) => writeState(node, currentTable))
        .catch((error) => console.error("[erd] gagal menulis state:", error)),
    )
  })

  // Applies the "erd" / "inbox" JSON: the first table goes to this widget,
  // the rest become new widgets via cloneWidget.
  async function syncFromInbox(): Promise<void> {
    let node: WidgetNode
    try {
      node = await getWidgetNode(widgetNodeId)
    } catch (error) {
      figma.notify(`Sync dari AI gagal: ${(error as Error).message}`, { error: true })
      return
    }

    try {
      const inbox = parseInbox(node.getSharedPluginData(NAMESPACE, KEY_INBOX))
      if (!inbox) {
        figma.notify("Inbox kosong, tidak ada perubahan dari AI.")
        return
      }

      // Validate everything before touching the document, so a bad table
      // never leaves a half-applied sync behind.
      const [first, ...rest] = inbox.tables
      const firstTable = resolveTable(first, currentTable, "tables[0]")
      const newTables = rest.map((table, position) => resolveTable(
        table,
        // New widgets start empty but inherit look (color and size).
        { tableName: null, color: firstTable.color, size: firstTable.size, columns: [], indexes: [] },
        `tables[${position + 1}]`,
      ))

      // Clear the inbox first so clones never inherit a pending inbox.
      clearInbox(node)

      setTableName(firstTable.tableName)
      setColor(firstTable.color)
      setSize(firstTable.size)
      setColumns(firstTable.columns)
      setIndexes(firstTable.indexes)
      writeState(node, firstTable)

      const widgets = [{ nodeId: node.id, tableName: firstTable.tableName }]
      let x = node.x + parseInt(firstTable.size) + CLONE_GAP
      for (const table of newTables) {
        const clone = node.cloneWidget(toSyncedState(table))
        clone.x = x
        clone.y = node.y
        clearInbox(clone)
        clone.setSharedPluginData(NAMESPACE, KEY_STATUS, "")
        writeState(clone, table)
        widgets.push({ nodeId: clone.id, tableName: table.tableName })
        x += parseInt(table.size) + CLONE_GAP
      }

      const message = newTables.length === 0
        ? "Sync dari AI: tabel diperbarui."
        : `Sync dari AI: tabel diperbarui, ${newTables.length} tabel baru dibuat.`
      writeStatus(node, { ok: true, message, widgets })
      figma.notify(message)
    } catch (error) {
      const message = error instanceof BridgeError
        ? error.message
        : `kesalahan tak terduga: ${String(error)}`
      writeStatus(node, { ok: false, message, widgets: [] })
      figma.notify(`Sync dari AI gagal: ${message}`, { error: true })
    }
  }

  useEffect(() => {
    figma.ui.onmessage = (message) => {
      const { action, data } = JSON.parse(message)
      switch (action) {
        case "edit":
          setColumns(data)
          break
        case "rawEdit":
          setColumns(data.columns)
          setIndexes(data.indexes)
          setColor(data.color)
          setTableName(data.tableName)
          break
        case "indexEdit":
          setIndexes(data)
          break
      }

      figma.closePlugin()
    }
  })

  usePropertyMenu(
    [
      {
        itemType: "color-selector",
        propertyName: "color",
        tooltip: "Color selector",
        selectedOption: color,
        options: defaultHeaderColors,
      },
      {
        itemType: "dropdown",
        propertyName: "size",
        tooltip: "Size",
        selectedOption: size,
        options: defaultSizes,
      },
      {
        itemType: "action",
        tooltip: "Edit table",
        propertyName: "edit",
      },
      {
        itemType: "action",
        tooltip: "Edit indexes",
        propertyName: "indexEdit",
      },
      {
        itemType: "action",
        tooltip: "Edit raw JSON",
        propertyName: "rawEdit",
      },
      {
        itemType: "separator",
      },
      {
        itemType: "action",
        tooltip: "Sync dari AI",
        propertyName: "syncFromAi",
      },
    ],
    ({ propertyName, propertyValue }) => {
      switch (propertyName) {
        case "color":
          return setColor(propertyValue)
        case "size":
          return setSize(propertyValue)
        case "edit":
          return new Promise(() => {
            figma.showUI(__uiFiles__.edit, {
              width: 700,
              height: 500,
              title: "Table Editor",
            })
            figma.ui.postMessage(columns)
          })
        case "indexEdit":
          return new Promise(() => {
            figma.showUI(__uiFiles__.indexEdit, {
              width: 700,
              height: 500,
              title: "Index Editor",
            })
            figma.ui.postMessage({
              indexes,
              columns,
            })
          })
        case "rawEdit":
          return new Promise(() => {
            figma.showUI(__uiFiles__.rawEdit, {
              width: 700,
              height: 500,
              title: "Raw JSON Editor",
            })
            figma.ui.postMessage({
              tableName,
              color,
              columns,
              indexes,
            })
          })
        case "syncFromAi":
          return syncFromInbox()
      }
    },
  )

  return (
    <AutoLayout
      direction="vertical"
      cornerRadius={16}
      stroke="#e6e6e6"
      width={parseInt(size)}
    >
      <Header
        title={tableName}
        color={color}
        onTextEditEnd={(event: TextEditEvent) => setTableName(event.characters)}
      />

      {columns.map((column) => (<KeyColumn key={column.name} column={column} />))}
      {indexes.length != 0 && <KeyIndexes indexes={indexes} />}
    </AutoLayout>
  )
}

register(DatabaseTableWidget)
