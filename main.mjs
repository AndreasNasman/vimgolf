import { execSync } from "child_process";
import { promises as fs } from "fs";
import { JSDOM } from "jsdom";
import { challenges } from "./challenges.mjs";

const args = process.argv.slice(2);

if (args.includes("--all")) {
  playAllChallenges();
} else if (
  args.length == 1 &&
  args.some((element) => /^--id=\w+$/.test(element))
) {
  playChallengeById();
} else if (args.length == 0 || args.includes("--last")) {
  playLastChallenge();
} else {
  throw new Error("❌ Unknown flag!");
}

// Make CTRL-C exit this script and return to the parent script, which runs some cleanup.
process.on("SIGINT", () => {
  process.exit();
});

/**
 * Loads given challenge and repeats it if specified.
 * @param {{lowestScore: string, id: string, title: string}} challenge - The challenge to load.
 */
async function loadChallenge(challenge) {
  let { lowestScore, id, title } = challenge;
  console.log(`🥷 Challenge title: ${title}`);
  console.log(`🎲 Lowest score: ${lowestScore}`);

  await new Promise((r) => setTimeout(r, 2000));
  execSync(`vimgolf put ${id}`, { stdio: "inherit" });

  const logFile = await fs.readFile("./console.log", {
    encoding: "utf8",
    flag: "r",
  });
  const newestLines = logFile.split("\r\n").reverse();
  const scoreLine = newestLines.find((line) => line.includes("Your score"));

  if (!scoreLine) throw new Error("No score line found!");

  if (scoreLine.toLowerCase().includes("fail")) return;
  else if (scoreLine.toLowerCase().includes("success")) {
    const [currentScore] = scoreLine.match(/(?<=: )\d+/) ?? [];
    if (!currentScore) throw new Error("No current score found!");
    else if (currentScore == lowestScore)
      console.log("💪 Good job! On to the next challenge! 🧑‍💻");
    else if (currentScore > lowestScore) {
      console.log(
        `🧩 The challenge can still be optimized to a score of ${lowestScore}, try again! 🤔`,
      );
      return loadChallenge(challenge, true);
    } else if (currentScore < lowestScore) {
      console.log(
        "🤯 Wow! A new solution found! Update the challenges file! 🤩",
      );
      process.exit();
    } else throw new Error("Unknown scoring!");
  } else throw new Error("Unhandled score line format!");
}

/**
 * Play all challenges listed in `challenges.mjs`.
 */
async function playAllChallenges() {
  let relevantChallenges = [...challenges];

  if (args.includes("--noteworthy"))
    relevantChallenges = relevantChallenges.filter(
      (challenge) => challenge.noteworthy,
    );
  if (args.includes("--random"))
    relevantChallenges.sort(() => 0.5 - Math.random());
  if (args.includes("--revised"))
    relevantChallenges = relevantChallenges.filter(
      (challenge) => challenge.revised,
    );

  for (const challenge of relevantChallenges) {
    const { id } = challenge;
    const { lowestScore, title } = await getChallengeInfo(id);
    await loadChallenge({ id, lowestScore, title });
  }
}

/**
 * Play matching challenge by the given challenge ID argument.
 */
async function playChallengeById() {
  const [challengeArgument] = args;
  const { challengeId } =
    challengeArgument.match(/^--id=(?<challengeId>\w+)$/)?.groups ?? {};
  const challengeToLoad = challenges.find(
    (challenge) => challenge.id === challengeId,
  );
  if (!challengeToLoad) throw new Error("Provide a valid challenge ID!");

  const { id } = challengeToLoad;
  const { lowestScore, title } = await getChallengeInfo(id);
  await loadChallenge({ id, lowestScore, title });
}

/**
 * Play the last challenge listed in `challenges.mjs`.
 */
async function playLastChallenge() {
  const lastChallenge = challenges.at(-1);
  if (!lastChallenge) throw new Error("No challenges provided!");

  const { id } = lastChallenge;
  const { lowestScore, title } = await getChallengeInfo(id);
  await loadChallenge({ id, lowestScore, title });
}

/**
 * Uses the given challenge ID to open the corresponding VimGolf challenge page and scrapes the lowest score and title of the challenge.
 * @param {string} challengeId - The challenge ID to request the lowest score and title for.
 * @returns {Promise<{lowestScore: string, title: string}>} An object containing the lowest score and title for the challenge matching given challenge ID.
 */
async function getChallengeInfo(challengeId) {
  const url = `https://www.vimgolf.com/challenges/${challengeId}`;
  const response = await fetch(url, { headers: { Accept: "text/html" } });
  const html = await response.text();

  const { document } = new JSDOM(html).window;
  const [leftDiv, rightDiv] = document.querySelectorAll("div#content>div");
  const lowestScore = rightDiv.querySelector(
    `a[href^='/challenges/${challengeId}']`,
  )?.textContent;
  const title = leftDiv.querySelector("b")?.textContent;

  if (!lowestScore)
    throw new Error(`No lowest score found for challenge ${challengeId}`);
  if (!title) throw new Error(`No title found for challenge ${challengeId}`);

  return { lowestScore, title };
}
