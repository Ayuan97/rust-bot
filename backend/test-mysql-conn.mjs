import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    console.log('Testing connection with specific config...');
    try {
        // Parse the URL manually or Use an object config
        const dbUrl = new URL(process.env.DATABASE_URL);
        const config = {
            host: dbUrl.hostname,
            port: parseInt(dbUrl.port),
            user: dbUrl.username,
            password: dbUrl.password,
            database: dbUrl.pathname.slice(1), // remove leading /
            ssl: false, // Explicitly disable SSL
            connectTimeout: 10000,
            debug: true
        };

        console.log('Config:', { ...config, password: '***' });

        const connection = await mysql.createConnection(config);
        console.log('✅ MySQL2 Connection Successful (SSL Disabled)!');
        const [rows] = await connection.execute('SELECT 1 as res');
        console.log('Query result:', rows);
        await connection.end();
    } catch (error) {
        console.error('❌ MySQL2 Connection Failed:');
        console.error(error.message);
    }
}

testConnection();
