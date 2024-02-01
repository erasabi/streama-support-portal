"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable("Requests", {
			id: {
				type: Sequelize.STRING(50),
				unique: true,
				allowNull: false,
			},
			title: {
				type: Sequelize.STRING(100),
				allowNull: false,
			},
			posterPath: {
				type: Sequelize.STRING(255),
			},
			createdAt: {
				type: Sequelize.DATE,
			},
			updatedAt: {
				type: Sequelize.DATE,
			},
			originalTitle: {
				type: Sequelize.STRING(120),
			},
			releaseDate: {
				type: Sequelize.STRING(20),
			},
			adult: {
				type: Sequelize.BOOLEAN,
			},
			mediaType: {
				type: Sequelize.STRING(20),
			},
			queueStatus: {
				type: Sequelize.STRING(40),
			},
			queueEvents: {
				type: Sequelize.ARRAY(
					Sequelize.JSONB({
						type: Sequelize.STRING(50),
						message: Sequelize.STRING(255),
					})
				),
			},
			queueMessage: {
				type: Sequelize.STRING(120),
			},
			requestUser: {
				type: Sequelize.STRING(60),
			},
		})
	},
	down: async (queryInterface, Sequelize) => {
		await queryInterface.dropTable("Requests")
	},
}
