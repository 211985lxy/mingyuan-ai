import mysql from "mysql2/promise"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const confirmation = "DELETE_RETIRED_MEDIA_DATA"
const databaseUrl = process.env.DATABASE_URL?.trim()
const backupReference = process.env.RETIRED_MEDIA_BACKUP_REFERENCE?.trim()

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the retired-media preflight")
  process.exit(1)
}

const url = new URL(databaseUrl)
const database = url.pathname.replace(/^\//, "")
const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
})

const restoredCoreTables = ["Avatar", "VideoTask", "VideoProductionPlan"]
const retiredTables = [
  "VideoTask",
  "VideoProductionPlan",
  "VideoPackagingTemplate",
  "PublicAvatarPreviewPreference",
  "PublicAvatarPreviewCache",
  "Avatar",
  "PexelsQueryCache",
  "PexelsMedia",
]
const retiredColumns = {
  Asset: ["sourceAvatarId", "externalTaskId", "externalSpeakerId", "voiceModel", "demoAudioUrl", "retryCount"],
  ContentTemplate: ["shanjianStyleId", "videoType", "packRulesJson", "processRulesJson"],
  User: ["authVideoUrl"],
}

try {
  const [tableRows] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
    [database],
  )
  const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME))

  // The approved first-phase product deliberately restores these tables. When
  // the complete core is present, this command is a non-destructive schema
  // guard and must never treat the restored tables as deletion candidates.
  const restoredCorePresent = restoredCoreTables.filter((table) => existingTables.has(table))
  if (restoredCorePresent.length === restoredCoreTables.length) {
    console.log("retired-media-preflight-ok mode=digital-human-restored (no destructive preflight)")
    process.exitCode = 0
  } else if (restoredCorePresent.length > 0) {
    console.error(`Refusing migration because the restored digital-human schema is partial: ${restoredCorePresent.join(", ")}`)
    process.exitCode = 3
  } else {
    const [columnRows] = await connection.query(
      "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
      [database],
    )
    const existingColumns = new Set(columnRows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`))
    const expectedObjects = [
      ...retiredTables.map((table) => `table:${table}`),
      ...Object.entries(retiredColumns).flatMap(([table, columns]) => columns.map((column) => `column:${table}.${column}`)),
    ]
    const presentObjects = expectedObjects.filter((object) => object.startsWith("table:")
      ? existingTables.has(object.slice(6))
      : existingColumns.has(object.slice(7)))

    if (presentObjects.length === 0) {
      console.log("Retired-media schema is already absent; preflight passed.")
    } else if (process.env.ACK_RETIRE_MEDIA_DATA !== confirmation || !backupReference) {
      console.error(
        `Refusing destructive migration: ${presentObjects.length} retired schema objects exist. Verify a backup, set RETIRED_MEDIA_BACKUP_REFERENCE, and rerun with ACK_RETIRE_MEDIA_DATA=${confirmation}.`,
      )
      process.exitCode = 2
    } else {
      console.log("Retired-media preflight passed with recorded backup evidence.")
    }
  }
} finally {
  await connection.end()
}
