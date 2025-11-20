const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const config = require('./config');

class Database {
  constructor() {
    this.db = new sqlite3.Database('./users.db');
    this.init();
  }

  init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        userId INTEGER PRIMARY KEY,
        encryptedKey TEXT NOT NULL,
        address TEXT NOT NULL,
        totalTrades INTEGER DEFAULT 0,
        totalVolume TEXT DEFAULT '0',
        createdAt INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  encrypt(text) {
    // HEX kulcs kezelése
    const key = Buffer.from(config.encryptionKey, 'hex');
    const iv = Buffer.alloc(16, 0); // Fix IV az egyszerűség kedvéért
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  decrypt(text) {
    const key = Buffer.from(config.encryptionKey, 'hex');
    const iv = Buffer.alloc(16, 0);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async saveUser(userId, privateKey, address) {
    return new Promise((resolve, reject) => {
      try {
        const encryptedKey = this.encrypt(privateKey);
        this.db.run(
          'INSERT OR IGNORE INTO users (userId, encryptedKey, address) VALUES (?, ?, ?)',
          [userId, encryptedKey, address],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      } catch (error) {
        console.error("Titkosítási hiba:", error);
        reject(error);
      }
    });
  }

  async getUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE userId = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else if (row) {
            try {
              row.privateKey = this.decrypt(row.encryptedKey);
              resolve(row);
            } catch (e) {
              console.error("Dekódolási hiba:", e);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async updateStats(userId, volume) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET totalTrades = totalTrades + 1, totalVolume = totalVolume + ? WHERE userId = ?',
        [volume, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}

module.exports = new Database();