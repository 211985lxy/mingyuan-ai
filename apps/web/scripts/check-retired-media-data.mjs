import mysql from "mysql2/promise"

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
  Asset: [
    "sourceAvatarId",
    "externalTaskId",
    "externalSpeakerId",
    "voiceModel",
    "demoAudioUrl",
    "retryCount",
  ],
  ContentTemplate: ["shanjianStyleId", "videoType", "packRulesJson", "processRulesJson"],
  User: ["authVideoUrl"],
}

async function runPreflight() {
  const [tableRows] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
    [database],
  )
  const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME))

  const [columnRows] = await connection.query(
    "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
    [database],
  )
  const existingColumns = new Set(
    columnRows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`),
  )

  const expectedObjects = [
    ...retiredTables.map((table) => `table:${table}`),
    ...Object.entries(retiredColumns).flatMap(([table, columns]) =>
      columns.map((column) => `column:${table}.${column}`),
    ),
  ]
  const presentObjects = expectedObjects.filter((object) => {
    if (object.startsWith("table:")) return existingTables.has(object.slice(6))
    return existingColumns.has(object.slice(7))
  })

  if (presentObjects.length === 0) {
    console.log("Retired-media schema is already absent; preflight passed.")
    return
  }

  const repairableAuthVideoDrift =
    presentObjects.length === 1 && presentObjects[0] === "column:User.authVideoUrl"
  if (repairableAuthVideoDrift) {
    const [rows] = await connection.query(
      "SELECT COUNT(*) AS count FROM `User` WHERE `authVideoUrl` IS NOT NULL",
    )
    const count = Number(rows[0].count)
    console.table([{ resource: "User(authVideoUrl repair drift)", count }])
    if (count > 0 && process.env.ACK_RETIRE_MEDIA_DATA !== confirmation) {
      console.error(
        `Refusing repair migration: ${count} authVideoUrl values exist. Rerun with ACK_RETIRE_MEDIA_DATA=${confirmation} after backup verification.`,
      )
      process.exitCode = 2
    } else if (count > 0 && !backupReference) {
      console.error(
        "Refusing repair migration: RETIRED_MEDIA_BACKUP_REFERENCE must identify the verified backup and restore drill.",
      )
      process.exitCode = 2
    } else {
      console.log("Known authVideoUrl repair drift preflight passed.")
    }
    return
  }

  if (presentObjects.length !== expectedObjects.length) {
    const missingObjects = expectedObjects.filter((object) => !presentObjects.includes(object))
    console.error("Refusing migration because the retired-media schema is partially present.")
    console.error(`Present: ${presentObjects.join(", ")}`)
    console.error(`Missing: ${missingObjects.join(", ")}`)
    process.exitCode = 3
    return
  }

  const counts = []
  for (const table of retiredTables) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    counts.push({ resource: table, count: Number(rows[0].count) })
  }

  const [voiceRows] = await connection.query(
    "SELECT COUNT(*) AS count FROM `Asset` WHERE `assetType` = 'voice'",
  )
  counts.push({ resource: "Asset(legacy voice clone)", count: Number(voiceRows[0].count) })

  const [assetMetadataRows] = await connection.query(
    "SELECT COUNT(*) AS count FROM `Asset` WHERE `sourceAvatarId` IS NOT NULL OR `externalTaskId` IS NOT NULL OR `externalSpeakerId` IS NOT NULL OR `voiceModel` IS NOT NULL OR `demoAudioUrl` IS NOT NULL OR `retryCount` <> 0",
  )
  counts.push({ resource: "Asset(retired metadata)", count: Number(assetMetadataRows[0].count) })

  const [templateRows] = await connection.query(
    "SELECT COUNT(*) AS count FROM `ContentTemplate` WHERE `shanjianStyleId` IS NOT NULL OR `videoType` IS NOT NULL OR `packRulesJson` IS NOT NULL OR `processRulesJson` IS NOT NULL",
  )
  counts.push({ resource: "ContentTemplate(retired metadata)", count: Number(templateRows[0].count) })

  const [authRows] = await connection.query(
    "SELECT COUNT(*) AS count FROM `User` WHERE `authVideoUrl` IS NOT NULL",
  )
  counts.push({ resource: "User(authVideoUrl)", count: Number(authRows[0].count) })

  const [assetRows] = await connection.query(
    "SELECT `assetType`, COUNT(*) AS count FROM `Asset` WHERE `assetType` IN ('image', 'video', 'music') GROUP BY `assetType` ORDER BY `assetType`",
  )

  console.table(counts)
  console.log("Preserved ordinary assets:")
  console.table(assetRows.map((row) => ({ assetType: row.assetType, count: Number(row.count) })))
  console.log("AIM ASR uses transient audio input and is not part of these retired asset records.")

  const destructiveRows = counts.reduce((sum, item) => sum + item.count, 0)
  if (destructiveRows > 0) {
    if (process.env.ACK_RETIRE_MEDIA_DATA !== confirmation) {
      console.error(
        `Refusing destructive migration: ${destructiveRows} retired records/metadata values exist. Export or archive them, then rerun with ACK_RETIRE_MEDIA_DATA=${confirmation}.`,
      )
      process.exitCode = 2
    } else if (!backupReference) {
      console.error(
        "Refusing destructive migration: RETIRED_MEDIA_BACKUP_REFERENCE must identify the verified backup and restore drill.",
      )
      process.exitCode = 2
    } else {
      console.log("Retired-media preflight passed with recorded backup evidence.")
    }
  } else {
    console.log("Retired-media preflight passed.")
  }
}

try {
  await runPreflight()
} finally {
  await connection.end()
}
