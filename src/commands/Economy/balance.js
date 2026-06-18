import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check your or someone else's wallet balance")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check balance for')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const targetUser = interaction.options.getUser("user") || interaction.user;
        const guildId = interaction.guildId;

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for balance",
                ErrorTypes.VALIDATION,
                "Bots don't have an economy balance."
            );
        }

        // 1. Fetch data from database
        const userData = await getEconomyData(client, guildId, targetUser.id);
        
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "Failed to load economy data. Please try again later.",
                { userId: targetUser.id, guildId }
            );
        }

        // 2. Sanitize wallet and coin-flip tracking variables
        const wallet = typeof userData.wallet === 'number' ? userData.wallet : parseInt(userData.wallet) || 0;
        const flipCount = userData.coinFlipCount || 0;

        // 3. Build a lightweight, clean Embed matching your coin layout
        const embed = createEmbed({
            title: `💰 ${targetUser.username}'s Balance`,
            description: `Current economy stats for ${targetUser.username}.`,
        })
        .addFields(
            {
                name: "💵 Cash Wallet",
                value: `$${wallet.toLocaleString()}`,
                inline: true,
            },
            {
                name: "📊 Coin Flips Today",
                value: `**${flipCount}** / 60 used`,
                inline: true,
            }
        )
        .setFooter({
            text: `Requested by ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL(),
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};
