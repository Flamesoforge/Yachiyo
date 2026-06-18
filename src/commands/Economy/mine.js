import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const WIN_CHANCE = 0.5; // Fixed 50/50 odds
const PAYOUT_MULTIPLIER = 2.0;

const COIN_COOLDOWN = 30 * 1000;          // 30 seconds between standard flips
const MAX_FLIPS = 60;                    // Max attempts allowed
const LOCKOUT_DURATION = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

export default {
    data: new SlashCommandBuilder()
        .setName('coin')
        .setDescription('Flip a coin to double your cash')
        .addStringOption(option =>
            option
                .setName('side')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of cash to bet')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const chosenSide = interaction.options.getString('side');
        const betAmount = interaction.options.getInteger('amount');
        const now = Date.now();

        // 1. Fetch and Sanitize Data
        const userData = await getEconomyData(client, guildId, userId);
        const currentWallet = typeof userData.wallet === 'number' ? userData.wallet : parseInt(userData.wallet) || 0;
        const lastCoinFlip = userData.lastCoinFlip || 0;
        
        let flipCount = userData.coinFlipCount || 0;
        const lockoutExpiry = userData.coinFlipLockoutExpiry || 0;

        // 2. Check 8-Hour Lockout Expiry First
        if (now < lockoutExpiry) {
            const remainingLockout = lockoutExpiry - now;
            const hours = Math.floor(remainingLockout / (1000 * 60 * 60));
            const minutes = Math.floor((remainingLockout % (1000 * 60 * 60)) / (1000 * 60));

            throw createError(
                "Coinflip execution locked",
                ErrorTypes.RATE_LIMIT,
                `🚫 You reached your limit of **${MAX_FLIPS}** flips. You are locked out for another **${hours}h ${minutes}m**.`,
                { remainingLockout, cooldownType: 'coin_lockout' }
            );
        }

        // Auto-reset flip count if lockout time has passed
        if (lockoutExpiry > 0 && now >= lockoutExpiry) {
            flipCount = 0;
            userData.coinFlipLockoutExpiry = 0;
        }

        // 3. Standard Cooldown Guard Clause
        if (now < lastCoinFlip + COIN_COOLDOWN) {
            const remaining = lastCoinFlip + COIN_COOLDOWN - now;
            const seconds = Math.floor(remaining / 1000);

            throw createError(
                "Coinflip cooldown active",
                ErrorTypes.RATE_LIMIT,
                `Don't rush the flip. Wait **${seconds}s** before risking it again.`,
                { remaining, cooldownType: 'coin' }
            );
        }

        // 4. Financial Guard Clause
        if (currentWallet < betAmount) {
            throw createError(
                "Insufficient cash for coinflip",
                ErrorTypes.VALIDATION,
                `You only have $${currentWallet.toLocaleString()} cash, but you are trying to bet $${betAmount.toLocaleString()}.`,
                { required: betAmount, current: currentWallet }
            );
        }

        // 5. Game Logic Execution (Pure 50/50)
        const coinSideResult = Math.random() < WIN_CHANCE ? chosenSide : (chosenSide === 'heads' ? 'tails' : 'heads');
        const win = chosenSide === coinSideResult;
        
        let cashChange = 0;
        let resultEmbed;

        if (win) {
            const totalPayout = Math.floor(betAmount * PAYOUT_MULTIPLIER);
            cashChange = totalPayout - betAmount; // Net profit calculation

            resultEmbed = successEmbed(
                `🪙 It's ${coinSideResult.toUpperCase()}!`,
                `You predicted correctly! Your **$${betAmount.toLocaleString()}** bet turned into **$${totalPayout.toLocaleString()}**!`
            );
        } else {
            cashChange = -betAmount; // Net loss calculation

            resultEmbed = errorEmbed(
                `🪙 It's ${coinSideResult.toUpperCase()}...`,
                `Unlucky. The coin landed on **${coinSideResult}**. You lost your **$${betAmount.toLocaleString()}** bet.`
            );
        }

        // Increment track counters
        flipCount += 1;

        // Check if user hit the 60 max cap
        let lockoutTriggered = false;
        if (flipCount >= MAX_FLIPS) {
            userData.coinFlipLockoutExpiry = now + LOCKOUT_DURATION;
            flipCount = 0; // Clear it for when the 8 hours expire
            lockoutTriggered = true;
        }

        // 6. Update State & Save to Database
        userData.wallet = currentWallet + cashChange;
        userData.lastCoinFlip = now;
        userData.coinFlipCount = flipCount;

        await setEconomyData(client, guildId, userId, userData);

        // 7. Output Fields
        resultEmbed.addFields({
            name: "💵 New Cash Balance",
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });

        if (lockoutTriggered) {
            resultEmbed.addFields({
                name: "🚨 Limit Reached!",
                value: "You have used up all **60** available flips! You are locked out of the casino for **8 hours**.",
                inline: false
            });
        } else {
            resultEmbed.addFields({
                name: "📊 Attempts Used",
                value: `**${flipCount}** / **${MAX_FLIPS}** before 8hr lock.`,
                inline: true
            });
        }

        resultEmbed.setFooter({ text: `Next flip available in 30 seconds.` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'coin' })
};
