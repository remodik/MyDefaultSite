import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from database import Project, File, User, async_session_factory, init_models

README_CONTENT = '''# Discord Bot Example

A simple Discord bot built with Python and Py-cord.

## Features

- [x] Welcome messages
- [x] Moderation commands
- [ ] Music player
- [ ] Leveling system

## Installation

```bash
pip install py-cord
python bot.py
```

## Math Example

The quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$

## Table

| Command | Description |
|---------|-------------|
| /help | Show help |
| /ping | Check latency |
| /ban | Ban a user |

## Code

```python
import discord
from discord.ext import commands

bot = commands.Bot(command_prefix="!")

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")

bot.run("TOKEN")
```

> **Note:** Replace TOKEN with your actual bot token.

:rocket: Happy coding!
'''

PYTHON_CODE = '''import discord
from discord.ext import commands
import asyncio
from datetime import datetime

class Bot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True
        super().__init__(command_prefix="!", intents=intents)
    
    async def on_ready(self):
        print(f"Bot {self.user} is ready!")
        print(f"Servers: {len(self.guilds)}")
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.watching,
                name="remod3.online"
            )
        )
    
    async def on_member_join(self, member: discord.Member):
        channel = member.guild.system_channel
        if channel:
            embed = discord.Embed(
                title="Welcome!",
                description=f"Welcome to the server, {member.mention}!",
                color=discord.Color.green(),
                timestamp=datetime.now()
            )
            embed.set_thumbnail(url=member.display_avatar.url)
            await channel.send(embed=embed)


bot = Bot()

@bot.command()
async def ping(ctx: commands.Context):
    """Check bot latency"""
    latency = round(bot.latency * 1000)
    await ctx.send(f"Pong! {latency}ms")

@bot.command()
@commands.has_permissions(ban_members=True)
async def ban(ctx: commands.Context, member: discord.Member, *, reason="No reason"):
    """Ban a member"""
    await member.ban(reason=reason)
    await ctx.send(f"{member} has been banned. Reason: {reason}")

if __name__ == "__main__":
    import os
    bot.run(os.getenv("DISCORD_TOKEN"))
'''

JS_CODE = '''// Discord.js Example
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const prefix = "!";

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity("remod3.online", { type: "WATCHING" });
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    if (command === "ping") {
        const latency = Date.now() - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);
        
        const embed = new EmbedBuilder()
            .setTitle("Pong! 🏓")
            .addFields(
                { name: "Latency", value: `${latency}ms`, inline: true },
                { name: "API Latency", value: `${apiLatency}ms`, inline: true }
            )
            .setColor("#5865F2")
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    }
    
    if (command === "userinfo") {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        
        const embed = new EmbedBuilder()
            .setTitle(user.tag)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "ID", value: user.id, inline: true },
                { name: "Joined", value: member.joinedAt.toDateString(), inline: true },
                { name: "Created", value: user.createdAt.toDateString(), inline: true }
            )
            .setColor(member.displayHexColor || "#5865F2");
        
        await message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
'''


async def create_demo_project():
    await init_models()
    
    async with async_session_factory() as session:
        result = await session.execute(select(Project).where(Project.name == "Discord Bot Example"))
        existing = result.scalar_one_or_none()
        
        if existing:
            print("Demo project already exists")
            return

        result = await session.execute(select(User).where(User.username == "remodik"))
        admin = result.scalar_one_or_none()
        
        if not admin:
            print("Admin user not found. Run create_admin.py first.")
            return

        project_id = str(uuid.uuid4())
        project = Project(
            id=project_id,
            name="Discord Bot Example",
            description="Example Discord bot project with Python and JavaScript implementations",
            created_by=admin.id,
            created_at=datetime.now(),
        )
        session.add(project)

        files_data = [
            ("README.md", README_CONTENT, "md"),
            ("bot.py", PYTHON_CODE, "py"),
            ("bot.js", JS_CODE, "js"),
        ]
        
        for name, content, file_type in files_data:
            file = File(
                id=str(uuid.uuid4()),
                project_id=project_id,
                name=name,
                content=content,
                file_type=file_type,
                is_binary=False,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(file)
        
        await session.commit()
        print("Demo project created successfully!")
        print(f"Project: Discord Bot Example")
        print(f"Files: README.md, bot.py, bot.js")


if __name__ == "__main__":
    asyncio.run(create_demo_project())
