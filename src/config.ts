import dotenv from "dotenv";
dotenv.config();

const { CLIENT_ID, GUILD_ID, DISCORD_TOKEN, JOIN_WAIT_TIME, WAIT_TIME_FOR_ANSWER } = process.env;

if(!CLIENT_ID || !GUILD_ID || !DISCORD_TOKEN || !JOIN_WAIT_TIME || !WAIT_TIME_FOR_ANSWER) {
    throw new Error("Missing env variables!");
}

const config: Record<string, string> = {
    CLIENT_ID,
    GUILD_ID,
    DISCORD_TOKEN,
    JOIN_WAIT_TIME,
    WAIT_TIME_FOR_ANSWER
}

export default config