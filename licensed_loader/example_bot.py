"""Minimal py-cord bot showing both licensing modes.

Run:  DISCORD_TOKEN=... LICENSE_KEY=... python example_bot.py
(This is illustrative; wire it into your own bot as needed.)
"""

from __future__ import annotations

import os

import discord  # py-cord

from licensed_loader import LicenseError, LicensedProject, ServerUnavailable

SERVER_URL = os.getenv("LICENSE_SERVER", "https://example.ru")
LICENSE_KEY = os.getenv("LICENSE_KEY", "LL_replace_me")
PROJECT_SLUG = "economy-bot"
MODE = os.getenv("LICENSE_MODE", "local")  # "local" or "remote"

bot = discord.Bot()

project = LicensedProject(
    license_key=LICENSE_KEY,
    server_url=SERVER_URL,
    project_slug=PROJECT_SLUG,
    mode=MODE,
    revalidate_interval=900,
    on_revoke=lambda: print("[licensed_loader] license revoked — feature disabled"),
)


@bot.event
async def on_ready() -> None:
    print(f"Logged in as {bot.user}")
    if MODE == "local":
        try:
            await project.load()
            print("[licensed_loader] project loaded")
        except LicenseError:
            print("[licensed_loader] license denied — economy features offline")
        except ServerUnavailable:
            print("[licensed_loader] server unreachable — will retry on demand")


@bot.slash_command(description="Claim your daily reward")
async def daily(ctx: discord.ApplicationContext) -> None:
    try:
        # Mode-agnostic call: local resolves in-process, remote runs on server.
        result = await project.call("core.calculate_reward", user_id=ctx.author.id)
    except LicenseError:
        await ctx.respond("This feature is currently unavailable.", ephemeral=True)
        return
    except ServerUnavailable:
        await ctx.respond("Service is busy, try again shortly.", ephemeral=True)
        return

    action = result.get("action")
    if action == "give_coins":
        await ctx.respond(f"💰 You earned {result['amount']} coins!")
    else:
        await ctx.respond(f"Result: {result}")


if __name__ == "__main__":
    bot.run(os.environ["DISCORD_TOKEN"])
