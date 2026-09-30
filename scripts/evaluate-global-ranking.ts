import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  currentGlobalRankingReleaseDecision,
  currentGlobalRankingScorecard,
} from "@/lib/global-ranking-evaluation";

const scorecard = currentGlobalRankingScorecard();
const report = JSON.stringify({ scorecard, releaseDecision: currentGlobalRankingReleaseDecision() }, null, 2) + "\n";
if (process.argv.includes("--write")) {
  void writeFile(resolve("docs/evaluations/global-discovery-ranking-v1.json"), report, "utf8")
    .then(() => console.log("Wrote docs/evaluations/global-discovery-ranking-v1.json"))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
} else {
  console.log(report);
}
