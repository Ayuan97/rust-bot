import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    const url = process.env.DATABASE_URL.split('?')[0];
    console.log('Connecting to:', url);

    try {
        const connection = await mysql.createConnection(process.env.DATABASE_URL);
        console.log('✅ MySQL2 Connection Successful!');
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM users');
        console.log('Users count:', rows[0].count);
        await connection.end();
    } catch (error) {
        console.error('❌ MySQL2 Connection Failed:');
        console.error(error);
    }
}

testConnection();
