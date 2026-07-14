import mysql from "mysql2/promise"

const confirmation = "DELETE_RETIRED_MEDIA_DATA"
const databaseUrl = process.env.DATABASE_URL?.trim()

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the retired-media preflight")
  process.exit(1)
}

const url = new URL(databaseUrl)
const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
})

const tableNames = [
  "VideoTask",
  "VideoProductionPlan",
  "VideoPackagingTemplate",
  "PublicAvatarPreviewPreference",
  "PublicAvatarPreviewCache",
  "Avatar",
  "PexelsQueryCache",
  "PexelsMedia",
]

try {
  const counts = []
  for (const table of tableNames) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    counts.push({ resource: table, count: Number(rows[0].count) })
  }

  const [voiceRows] = await connection.query(
    "SELECT COUNT(*) AS count FROM `Asset` WHERE `assetType` = 'voice'",
  )
  counts.push({ resource: "Asset(assetType=voice)", count: Number(voiceRows[0].count) })

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

  const destructiveRows = counts.reduce((sum, item) => sum + item.count, 0)
  if (destructiveRows > 0 && process.env.ACK_RETIRE_MEDIA_DATA !== confirmation) {
    console.error(
      `Refusing destructive migration: ${destructiveRows} retired records/metadata values exist. Export or archive them, then rerun with ACK_RETIRE_MEDIA_DATA=${confirmation}.`,
    )
    process.exitCode = 2
  } else {
    console.log("Retired-media preflight passed.")
  }
} finally {
  await connection.end()
}
