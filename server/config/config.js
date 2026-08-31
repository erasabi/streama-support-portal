// Sequelize CLI config — reads the same env vars as database.js / docker-compose.
const env = process.env

const base = {
	username: env.DB_USER || "postgres",
	password: env.DB_PASSWORD || "postgres",
	database: env.DB_SCHEMA || "postgres",
	host: env.DB_HOST || "127.0.0.1",
	port: env.DB_PORT ? parseInt(env.DB_PORT, 10) : 5432,
	dialect: "postgres",
}

module.exports = {
	development: base,
	production: base,
	test: base,
}
