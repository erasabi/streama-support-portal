const Sequelize = require('sequelize');
const sequelize = new Sequelize(process.env.DB_SCHEMA || 'postgres',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        dialectOptions: {
            ssl: process.env.DB_SSL == "true"
        }
    });

const Request = sequelize.define('Request', {
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    posterPath: {
        type: Sequelize.STRING,
        allowNull: true
    },
    originalTitle: {
        type: Sequelize.STRING,
        allowNull: true
    },
    releaseDate: {
        type: Sequelize.STRING,
        allowNull: true
    },
    adult: {
        type: Sequelize.BOOLEAN,
        allowNull: true
    },
    mediaType: {
        type: Sequelize.STRING,
        allowNull: true
    },
    queueStatus: {
        type: Sequelize.STRING,
        allowNull: true
    },
    queueMessage: {
        type: Sequelize.STRING,
        allowNull: true
    },
    requestUser: {
        type: Sequelize.STRING,
        allowNull: true
    },
});

module.exports = {
    sequelize: sequelize,
    Request: Request
};
