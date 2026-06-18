const userData = await getEconomyData(client, guildId, userId);

// Force it to be a number right away, defaulting to 0 if undefined or a string
const currentWallet = typeof userData.wallet === 'number' ? userData.wallet : parseInt(userData.wallet) || 0;

const lastGamble = userData.lastGamble || 0;
let cloverCount = userData.inventory?.["lucky_clover"] || 0;
let charmCount = userData.inventory?.["lucky_charm"] || 0;

// ... (cooldown check goes here) ...

// Change your validation guard clause to use currentWallet:
if (currentWallet < betAmount) {
    throw createError(
        "Insufficient cash for gamble",
        ErrorTypes.VALIDATION,
        `You only have $${currentWallet.toLocaleString()} cash, but you are trying to bet $${betAmount.toLocaleString()}.`,
        { required: betAmount, current: currentWallet }
    );
}
