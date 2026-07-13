import { prepareE2eDatabase, resetE2eDatabase } from "../../scripts/e2e-database"

export default async function setup() {
  await prepareE2eDatabase()
  return async () => resetE2eDatabase()
}
