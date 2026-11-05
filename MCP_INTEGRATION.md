# Integrasi Figma Console MCP

Widget **Figma Database Table with MCP** membuka jembatan data lewat `sharedPluginData` di node
widget. Plugin lain, termasuk Figma Console MCP (`figma_execute`), dapat membaca
tabel dan mengirim perubahan tanpa perlu ID widget.

## Ringkasan

Semua data ada di namespace **`erd`** pada setiap node widget:

| Key      | Ditulis oleh      | Isi                                                                 |
|----------|-------------------|---------------------------------------------------------------------|
| `state`  | widget            | Salinan tabel saat ini. Diperbarui otomatis setiap tabel berubah.   |
| `inbox`  | plugin lain / AI  | Perubahan yang menunggu diterapkan. Dikosongkan setelah sync sukses.|
| `status` | widget            | Hasil "Sync dari AI" terakhir (sukses/gagal, pesan, node yang dibuat).|

Alur kerja:

1. AI membaca `state` semua widget.
2. AI menulis JSON ke `inbox` sebuah widget.
3. Pengguna memilih widget tersebut lalu klik **Sync dari AI** di property menu.
4. Widget memvalidasi inbox, menerapkan tabel pertama ke dirinya sendiri,
   membuat widget baru (`cloneWidget`) untuk tabel lainnya, memperbarui `state`,
   menulis `status`, lalu mengosongkan `inbox`.
5. AI membaca `status` untuk memastikan hasilnya.

> **Langkah 3 wajib manual.** Plugin lain tidak bisa memicu aksi property menu
> widget, dan `setWidgetSyncedState`/`cloneWidget` hanya boleh dipanggil oleh
> widget itu sendiri. Karena itu perubahan dari AI selalu lewat inbox.

> **Desktop Bridge tertutup setiap kali widget menjalankan kode.** Figma hanya
> menjalankan satu plugin/widget dalam satu file. Memasukkan widget, membuka
> editor, mengubah warna/ukuran, atau klik "Sync dari AI" akan menutup plugin
> Desktop Bridge, sehingga `figma_execute` gagal dengan "Cannot connect to Figma
> Desktop". Jalankan ulang Desktop Bridge (Plugins › Development) sebelum AI
> membaca `status`/`state`. Beri jeda beberapa detik sampai koneksinya pulih.

> **Gunakan `erd/state`, bukan `widgetSyncedState`.** Dari plugin lain,
> `node.widgetSyncedState` widget ini terbaca `{}`, sehingga `state` adalah
> satu-satunya sumber data tabel bagi MCP.

`state` ditulis setiap kali widget dirender: saat pertama kali diletakkan di
board, setelah edit lewat Table/Index/Raw JSON editor, setelah judul, warna,
atau ukuran diubah, dan setelah sync. Widget yang belum pernah dirender oleh versi
ini belum punya `state`. Ubah sesuatu sekali, atau masukkan ulang widgetnya.

## Format JSON (version 1)

Formatnya mengikuti struktur synced state widget, sama dengan bentuk di
**Edit raw JSON**, ditambah `version` dan `size`.

### Tabel

```json
{
  "tableName": "orders",
  "color": "#0D99FF",
  "size": "400",
  "columns": [
    { "name": "id",         "type": "bigint",    "nullable": false, "keyType": "primary" },
    { "name": "user_id",    "type": "bigint",    "nullable": false, "keyType": "foreign",
      "references": { "table": "users", "column": "id" } },
    { "name": "code",       "type": "varchar",   "nullable": false, "keyType": "unique" },
    { "name": "note",       "type": "text",      "nullable": true,  "keyType": "normal" }
  ],
  "indexes": [
    { "name": ["user_id", "code"], "keyType": "unique" }
  ]
}
```

| Field       | Tipe                    | Keterangan |
|-------------|-------------------------|------------|
| `tableName` | `string \| null`        | Nama tabel di header widget. |
| `color`     | `string`                | Warna header, hex 6 digit (`"#0D99FF"`). Disimpan dalam huruf besar. |
| `size`      | `string`                | Lebar widget: `"320"`, `"400"`, `"480"`, `"560"`, `"640"`. Angka juga diterima di inbox. |
| `columns`   | `Column[]`              | Urutan array = urutan tampilan. |
| `indexes`   | `Index[]`               | Ditampilkan di bagian "Indexes". |

**Column**

| Field        | Tipe      | Wajib | Keterangan |
|--------------|-----------|-------|------------|
| `name`       | `string`  | ya    | Tidak kosong, unik dalam satu tabel. |
| `type`       | `string`  | ya    | Bebas (`int`, `varchar(255)`, `uuid`, ...). |
| `nullable`   | `boolean` | tidak | Default `false`. Ditampilkan sebagai `?` di belakang tipe. |
| `keyType`    | `string`  | tidak | `primary` (PK), `foreign` (FK), `unique`, `index`, `normal`. Default `normal`. |
| `references` | `{ table, column }` | tidak | Target relasi. Dipakai untuk FK, tetapi boleh ada di `keyType` lain (mis. kolom PK yang juga FK di tabel pivot). |

**Index**

| Field     | Tipe       | Keterangan |
|-----------|------------|------------|
| `name`    | `string[]` | Daftar kolom (multikey). Semua harus ada di `columns`. |
| `keyType` | `string`   | `primary`, `foreign`, `unique`, `index`. |

**Relasi.** Satu-satunya sumber relasi adalah `references` pada kolom. Untuk
mendapatkan seluruh relasi diagram, kumpulkan `references` dari `state` semua
widget (lihat contoh di bawah). `references.table` dicocokkan dengan
`tableName` widget lain. Widget tidak menggambar connector secara otomatis.

### `erd/state`

```json
{ "version": 1, "tableName": "...", "color": "...", "size": "...", "columns": [...], "indexes": [...] }
```

Urutan key selalu tetap, dan field kolom yang tidak dikenal dibuang.

### `erd/inbox`

```json
{
  "version": 1,
  "tables": [
    { "tableName": "orders", "columns": [ ... ], "indexes": [ ... ] },
    { "tableName": "order_items", "columns": [ ... ] }
  ]
}
```

Aturan:

- `version` wajib. Inbox dengan `version` lebih tinggi dari yang didukung widget
  ditolak, dan pengguna diminta memperbarui widget.
- `tables` minimal berisi satu tabel.
- **`tables[0]`** diterapkan ke widget yang inbox-nya ditulis. Field yang tidak
  disertakan tetap memakai nilai lama. `columns` dan `indexes`, kalau ada,
  **mengganti seluruh** array (tidak ada patch per kolom). Jadi untuk menambah
  satu kolom, baca `state`, ubah, lalu kirim array lengkap.
- **`tables[1..]`** menjadi widget baru (`cloneWidget`) yang diletakkan berjajar di
  kanan widget asal dengan jarak 80px. Field yang tidak disertakan memakai
  default: `tableName: null`, `columns: []`, `indexes: []`. `color` dan `size`
  mengikuti hasil `tables[0]`.
- Semua tabel divalidasi dulu sebelum ada yang diterapkan. Kalau satu tabel
  tidak valid, tidak ada yang berubah, `inbox` **tidak** dikosongkan, dan
  pesan error ditulis ke `status`.
- Index yang tidak ikut dikirim tetap dicek terhadap kolom baru. Kalau
  `columns` menghapus kolom yang masih dipakai index lama, kirim juga `indexes`.

### `erd/status`

```json
{
  "version": 1,
  "ok": true,
  "message": "Sync dari AI: tabel diperbarui, 1 tabel baru dibuat.",
  "at": "2026-11-05T10:00:00.000Z",
  "widgets": [
    { "nodeId": "12:34", "tableName": "orders" },
    { "nodeId": "12:99", "tableName": "order_items" }
  ]
}
```

Saat gagal, `ok` bernilai `false`, `message` berisi alasannya (mis.
`tables[0].columns[2].keyType harus salah satu dari: ...`), dan `widgets` kosong.

## Contoh `figma_execute`

Kode di bawah ditulis untuk `figma_execute` (mendukung `await` dan `return`).
Widget dikenali dari keberadaan `erd/state`, jadi tidak bergantung pada ID
widget hasil publish.

### Membaca semua tabel (semua halaman) beserta relasinya

```js
await figma.loadAllPagesAsync()

const tables = []
for (const page of figma.root.children) {
  for (const node of page.findAllWithCriteria({ types: ["WIDGET"] })) {
    const raw = node.getSharedPluginData("erd", "state")
    if (!raw) continue
    tables.push({ nodeId: node.id, page: page.name, ...JSON.parse(raw) })
  }
}

const relations = []
for (const table of tables) {
  for (const column of table.columns) {
    if (column.references) {
      relations.push({
        from: `${table.tableName}.${column.name}`,
        to: `${column.references.table}.${column.references.column}`,
      })
    }
  }
}

return { tables, relations }
```

Untuk halaman aktif saja, ganti loop halaman dengan
`figma.currentPage.findAllWithCriteria({ types: ["WIDGET"] })`.

### Mengubah satu tabel (tambah kolom)

```js
await figma.loadAllPagesAsync()

const node = figma.root
  .findAllWithCriteria({ types: ["WIDGET"] })
  .find((n) => {
    const raw = n.getSharedPluginData("erd", "state")
    return raw && JSON.parse(raw).tableName === "orders"
  })
if (!node) return "Tabel orders tidak ditemukan"

const state = JSON.parse(node.getSharedPluginData("erd", "state"))
state.columns.push({
  name: "created_at", type: "timestamp", nullable: false, keyType: "normal",
})

node.setSharedPluginData("erd", "inbox", JSON.stringify({
  version: 1,
  tables: [{ tableName: state.tableName, columns: state.columns, indexes: state.indexes }],
}))

// Pindah ke halaman widget dan pilih widgetnya, supaya pengguna tinggal klik.
let page = node.parent
while (page && page.type !== "PAGE") page = page.parent
if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page)
figma.currentPage.selection = [node]
figma.viewport.scrollAndZoomIntoView([node])
return `Inbox ditulis ke ${node.id}. Klik "Sync dari AI" pada widget orders.`
```

### Membuat beberapa tabel sekaligus

Siapkan satu widget kosong di board (pengguna memasukkannya dari menu widget),
pilih widget itu, lalu:

```js
const node = figma.currentPage.selection.find((n) => n.type === "WIDGET")
if (!node) return "Pilih satu widget Figma Database Table with MCP terlebih dahulu"

node.setSharedPluginData("erd", "inbox", JSON.stringify({
  version: 1,
  tables: [
    {
      tableName: "users",
      color: "#14AE5C",
      columns: [
        { name: "id", type: "bigint", keyType: "primary" },
        { name: "email", type: "varchar(255)", keyType: "unique" },
      ],
    },
    {
      tableName: "orders",
      columns: [
        { name: "id", type: "bigint", keyType: "primary" },
        { name: "user_id", type: "bigint", keyType: "foreign",
          references: { table: "users", column: "id" } },
        { name: "total", type: "numeric(12,2)" },
      ],
      indexes: [{ name: ["user_id"], keyType: "index" }],
    },
  ],
}))

return "Inbox berisi 2 tabel. Klik \"Sync dari AI\": users diterapkan ke widget ini, orders dibuat sebagai widget baru."
```

### Mengecek hasil sync

```js
const node = await figma.getNodeByIdAsync("12:34") // nodeId widget yang di-sync
return {
  status: JSON.parse(node.getSharedPluginData("erd", "status") || "null"),
  inboxPending: node.getSharedPluginData("erd", "inbox") !== "",
}
```

## Kompatibilitas

- `version` saat ini: **1**.
- Perubahan yang **tidak** menaikkan versi: field opsional baru. Pembaca harus
  mengabaikan field yang tidak dikenal.
- Perubahan yang mengubah arti atau bentuk field yang ada menaikkan `version`.
  Widget menolak inbox dengan versi di atas yang didukungnya.
