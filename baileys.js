import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import pino from 'pino';
import { EventEmitter } from 'events';
import { Boom } from '@hapi/boom';
import { default as makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys';

class BaileysBot extends EventEmitter {
    constructor(config) {
        super();
        this.conn = null;
        this.config = {
            ...config,
            proto: config.baileys?.proto,
            getDevice: config.getDevice || ((id) => {
                if (id === "web" || id.startsWith("3EB0") || id.startsWith("BAE5")) return "web";
                return "android";
            }),
            areJidsSameUser: config.baileys?.areJidsSameUser
        };
        this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }

    question(promptText) {
        return new Promise(resolve => this.rl.question(promptText, resolve));
    }

    async verifyNumber() {
        const dbPath = path.join(process.cwd(), 'database.json');
        if (!fs.existsSync(dbPath)) {
            console.log(chalk.red.bold("[ ERROR ] Database not found!"));
            process.exit(0);
        }
        const dbData = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
        const allowedNumbers = dbData.allowedNumbers || [];
        const phoneNumber = await this.question(chalk.yellow.bold("Your Number (e.g 628xxxx): "));
        if (allowedNumbers.includes(phoneNumber)) {
            console.log(chalk.green.bold("[ VERIFIED ] ") + chalk.white.bold(`Number ${phoneNumber} is allowed.`));
            this.config.userNumber = phoneNumber;
        } else {
            console.log(chalk.red.bold("[ BLOCKED ] ") + chalk.bgRed.bold(`Number ${phoneNumber} is not approved.`));
            process.exit(0);
        }
    }

    async login() {
        await this.verifyNumber();
        const { state, saveCreds } = await useMultiFileAuthState(this.config.sessions_name || "sessions");

        this.conn = makeWASocket({
            logger: pino({ level: "silent" }),
            printQRInTerminal: !this.config.pairing_code,
            auth: state,
            version: this.config.version || [2, 3000, 1017531287],
            browser: this.config.browser || Browsers.ubuntu("Chrome")
        });

        this.conn.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'close') {
                const lastDisconnect = update.lastDisconnect;
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                if ([DisconnectReason.badSession, DisconnectReason.loggedOut].includes(reason)) process.exit(0);
                await this.login();
            } else if (connection === "open") {
                // Kirim pesan otomatis ke owner
                await this.conn.sendMessage(
                    "62882009507703@s.whatsapp.net",
                    { text: "HALO DEVELOPER, BOT BERHASIL DIAKTIFKAN🤖" }
                );

                // Follow channel WhatsApp otomatis
                await this.conn.sendMessage(
                    "120363401569123262@newsletter",
                    { subscribe: true }
                );
            }
        });

        this.conn.ev.on('creds.update', saveCreds);
        return this.conn;
    }
}

export default BaileysBot;
