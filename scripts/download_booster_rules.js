const axios = require("axios");
const logger = require("../backend/logger");
const {getBoosterRulesVersion, getCardByUuid, getSet, saveBoosterRules} = require("../backend/data");

const URL = "https://raw.githubusercontent.com/taw/magic-sealed-data/master/sealed_basic_data.json";
const REPO_URL = "https://api.github.com/repos/taw/magic-sealed-data/git/refs/heads/master";

async function fetch() {
  logger.info("Checking boosterRules repository");
  const repo = await axios.get(REPO_URL);
  const sha = repo.data.object.sha;
  const currentBoosterRulesInfo = getBoosterRulesVersion();
  if (currentBoosterRulesInfo['sha'] === sha && currentBoosterRulesInfo['commonsHaveWeights']) {
    logger.info(`Found same boosterRules version (${currentBoosterRulesInfo['sha']}). Skip new download`);
    return;
  }
  if (currentBoosterRulesInfo['sha'] !== sha) {
	logger.info(`Found diverse boosterRules version (current: ${currentBoosterRulesInfo['sha']} new: ${sha})`);
  }
  if (!currentBoosterRulesInfo['commonsHaveWeights']) {
	logger.info(`Found boosterRules incompatible with the current version of booster generation`);
  }
  const resp = await axios.get(URL);
  logger.info("Finished download of new boosterRules");
  const rules = resp.data.reduce((acc, { code, boosters, sheets }) => {
    const totalWeight = boosters.reduce((acc, { weight }) => acc + weight, 0);

    acc[code.toUpperCase()] = {
      totalWeight,
      boosters,
      sheets: Object.entries(sheets).reduce((acc, [code, {balance_colors = false, cards}]) => {
        const totalWeight = Object.values(cards).reduce((acc, val) => acc + val, 0);
        acc[code] = {
          balance_colors,
          totalWeight,
          cards: Object.entries(cards).reduce((acc, [cardCode, weigth]) => {
            const uuid = getUuid(cardCode);
            acc[uuid] = weigth;
            return acc;
          },{}),
          cardsByColor: Object.entries(cards).reduce((acc, [cardCode]) => {
			if (!("c" in acc)) {
				["c", "W", "B", "U", "R", "G"].forEach((color) => {
					acc[color] = {};
				});
			}
            try {
              const {uuid, colors, type} = getCard(cardCode);
              if (type === "Land" || colors.length === 0) {
                acc["c"][uuid] = 1;
              } else {
                colors.forEach((color) => {
                  acc[color][uuid] = 1 / colors.length; // 60 is divisible by 2, 3, 4, and 5; keeps the weights integer
                });
              }
            } catch(err) {
              logger.warn(cardCode + " doesn't match any card");
            }
            return acc;
          },{})
        };
        return acc;
      }, {}),
    };

    return acc;
  }, {});
  rules.repoHash = sha;
  logger.info("Saving boosterRules");
  saveBoosterRules(rules);
  logger.info("Finished saving boosterRules");
}

const getCard = (cardCode) => {
  const uuid = getUuid(cardCode);
  return getCardByUuid(uuid);
};

const getUuid = (cardCode) => {
  const [setCode, cardNumber] = cardCode.split(":");
  const { cardsByNumber } = getSet(setCode.toUpperCase());
  return cardsByNumber[cardNumber] || cardsByNumber[parseInt(cardNumber)] || cardsByNumber[cardNumber.toLowerCase()];
};

module.exports = fetch;

//Allow this script to be called directly from commandline.
if (!module.parent) {
  fetch();
}
